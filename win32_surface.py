#!/usr/bin/env python3
"""Windows native Followcast share surface using Win32 GDI (stdlib ctypes only)."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from capture_argv import destination_output, parse_stream_output, stdin_line_iter
from win32_desktop import FOLLOWCAST_SURFACE_CLASS, list_monitors

WIDTH = 1280
HEIGHT = 720
FRAME_INTERVAL_MS = 33
MONITOR_CACHE_TTL_S = 1.0


def runtime_state_path(env: Mapping[str, str], fallback_temp: str) -> Path:
    runtime = (
        env.get("XDG_RUNTIME_DIR")
        or env.get("LOCALAPPDATA")
        or env.get("TEMP")
        or env.get("TMP")
        or fallback_temp
    )
    return Path(runtime) / "followcast" / "privacy.json"


def parse_privacy_state(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def resolve_monitor_rect(
    monitors: list[dict[str, Any]],
    output_name: str,
) -> tuple[int, int, int, int] | None:
    for monitor in monitors:
        if monitor.get("name") == output_name:
            x = monitor.get("x")
            y = monitor.get("y")
            width = monitor.get("width")
            height = monitor.get("height")
            if (
                isinstance(x, int)
                and isinstance(y, int)
                and isinstance(width, int)
                and isinstance(height, int)
            ):
                return (x, y, width, height)
    return None


def _run_surface() -> int:
    import ctypes
    from ctypes import wintypes

    from win32_desktop import _enable_dpi_awareness

    _enable_dpi_awareness()

    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32
    kernel32 = ctypes.windll.kernel32

    WS_OVERLAPPEDWINDOW = 0x00CF0000
    WS_VISIBLE = 0x10000000
    WM_DESTROY = 0x0002
    WM_PAINT = 0x000F
    WM_CLOSE = 0x0010
    WM_ERASEBKGND = 0x0014
    WM_TIMER = 0x0113
    TIMER_ID = 1
    SRCCOPY = 0x00CC0020
    HALFTONE = 4
    DT_CENTER = 0x00000001
    DT_VCENTER = 0x00000004
    DT_SINGLELINE = 0x00000020
    TRANSPARENT = 1
    FW_NORMAL = 400
    FW_SEMIBOLD = 600
    DEFAULT_CHARSET = 1
    OUT_DEFAULT_PRECIS = 0
    CLIP_DEFAULT_PRECIS = 0
    CLEARTYPE_QUALITY = 5
    DEFAULT_PITCH = 0

    def rgb(r: int, g: int, b: int) -> int:
        return r | (g << 8) | (b << 16)

    BG_COLOR = rgb(0x12, 0x14, 0x1A)
    KICKER_COLOR = rgb(0x9A, 0xA3, 0xB5)
    APP_COLOR = rgb(0xF4, 0xF6, 0xFB)
    DETAIL_COLOR = rgb(0xC5, 0xCD, 0xDB)

    WNDPROC = ctypes.WINFUNCTYPE(
        ctypes.c_ssize_t,
        wintypes.HWND,
        wintypes.UINT,
        wintypes.WPARAM,
        wintypes.LPARAM,
    )

    class WNDCLASSEXW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.UINT),
            ("style", wintypes.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
            ("hIconSm", wintypes.HICON),
        ]

    class PAINTSTRUCT(ctypes.Structure):
        _fields_ = [
            ("hdc", wintypes.HDC),
            ("fErase", wintypes.BOOL),
            ("rcPaint", wintypes.RECT),
            ("fRestore", wintypes.BOOL),
            ("fIncUpdate", wintypes.BOOL),
            ("rgbReserved", wintypes.BYTE * 32),
        ]

    user32.DefWindowProcW.argtypes = [
        wintypes.HWND,
        wintypes.UINT,
        wintypes.WPARAM,
        wintypes.LPARAM,
    ]
    user32.DefWindowProcW.restype = ctypes.c_ssize_t
    user32.RegisterClassExW.argtypes = [ctypes.POINTER(WNDCLASSEXW)]
    user32.RegisterClassExW.restype = wintypes.ATOM
    user32.LoadCursorW.argtypes = [wintypes.HINSTANCE, ctypes.c_void_p]
    user32.LoadCursorW.restype = wintypes.HANDLE
    user32.CreateWindowExW.argtypes = [
        wintypes.DWORD,
        wintypes.LPCWSTR,
        wintypes.LPCWSTR,
        wintypes.DWORD,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HWND,
        wintypes.HMENU,
        wintypes.HINSTANCE,
        wintypes.LPVOID,
    ]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.SetTimer.argtypes = [wintypes.HWND, ctypes.c_size_t, wintypes.UINT, ctypes.c_void_p]
    user32.SetTimer.restype = ctypes.c_size_t
    user32.KillTimer.argtypes = [wintypes.HWND, ctypes.c_size_t]
    user32.KillTimer.restype = wintypes.BOOL
    user32.InvalidateRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT), wintypes.BOOL]
    user32.InvalidateRect.restype = wintypes.BOOL
    user32.DestroyWindow.argtypes = [wintypes.HWND]
    user32.DestroyWindow.restype = wintypes.BOOL
    user32.PostQuitMessage.argtypes = [ctypes.c_int]
    user32.PostQuitMessage.restype = None
    user32.GetMessageW.argtypes = [
        ctypes.POINTER(wintypes.MSG),
        wintypes.HWND,
        wintypes.UINT,
        wintypes.UINT,
    ]
    user32.GetMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.TranslateMessage.restype = wintypes.BOOL
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.DispatchMessageW.restype = ctypes.c_ssize_t
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.PostMessageW.restype = wintypes.BOOL
    user32.BeginPaint.argtypes = [wintypes.HWND, ctypes.POINTER(PAINTSTRUCT)]
    user32.BeginPaint.restype = wintypes.HDC
    user32.EndPaint.argtypes = [wintypes.HWND, ctypes.POINTER(PAINTSTRUCT)]
    user32.EndPaint.restype = wintypes.BOOL
    user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetClientRect.restype = wintypes.BOOL
    user32.GetDC.argtypes = [wintypes.HWND]
    user32.GetDC.restype = wintypes.HDC
    user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
    user32.ReleaseDC.restype = ctypes.c_int
    user32.FillRect.argtypes = [wintypes.HDC, ctypes.POINTER(wintypes.RECT), wintypes.HBRUSH]
    user32.FillRect.restype = ctypes.c_int
    user32.DrawTextW.argtypes = [
        wintypes.HDC,
        wintypes.LPCWSTR,
        ctypes.c_int,
        ctypes.POINTER(wintypes.RECT),
        wintypes.UINT,
    ]
    user32.DrawTextW.restype = ctypes.c_int
    gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
    gdi32.CreateCompatibleDC.restype = wintypes.HDC
    gdi32.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
    gdi32.CreateCompatibleBitmap.restype = wintypes.HBITMAP
    gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
    gdi32.SelectObject.restype = wintypes.HGDIOBJ
    gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
    gdi32.DeleteObject.restype = wintypes.BOOL
    gdi32.DeleteDC.argtypes = [wintypes.HDC]
    gdi32.DeleteDC.restype = wintypes.BOOL
    gdi32.CreateSolidBrush.argtypes = [wintypes.COLORREF]
    gdi32.CreateSolidBrush.restype = wintypes.HBRUSH
    gdi32.SetBkMode.argtypes = [wintypes.HDC, ctypes.c_int]
    gdi32.SetBkMode.restype = ctypes.c_int
    gdi32.SetTextColor.argtypes = [wintypes.HDC, wintypes.COLORREF]
    gdi32.SetTextColor.restype = wintypes.COLORREF
    gdi32.SetStretchBltMode.argtypes = [wintypes.HDC, ctypes.c_int]
    gdi32.SetStretchBltMode.restype = ctypes.c_int
    gdi32.SetBrushOrgEx.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    gdi32.SetBrushOrgEx.restype = wintypes.BOOL
    gdi32.StretchBlt.argtypes = [
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.DWORD,
    ]
    gdi32.StretchBlt.restype = wintypes.BOOL
    gdi32.BitBlt.argtypes = [
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.DWORD,
    ]
    gdi32.BitBlt.restype = wintypes.BOOL
    gdi32.CreateFontW.argtypes = [
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPCWSTR,
    ]
    gdi32.CreateFontW.restype = wintypes.HFONT

    lock = threading.Lock()
    state: dict[str, Any] = {
        "output": None,
        "monitors": list_monitors(),
        "monitors_at": time.monotonic(),
    }
    hwnd_box: list[int] = [0]
    privacy_file = runtime_state_path(os.environ, tempfile.gettempdir())

    bg_brush = gdi32.CreateSolidBrush(BG_COLOR)
    kicker_font = gdi32.CreateFontW(
        -22, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Segoe UI",
    )
    app_font = gdi32.CreateFontW(
        -44, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Segoe UI",
    )
    detail_font = gdi32.CreateFontW(
        -18, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Segoe UI",
    )

    def read_privacy() -> dict[str, Any]:
        if not privacy_file.exists():
            return {}
        try:
            return parse_privacy_state(privacy_file.read_text(encoding="utf-8"))
        except OSError:
            return {}

    def get_monitor_rect(output: str | None) -> tuple[int, int, int, int] | None:
        if output is None:
            return None
        now = time.monotonic()
        with lock:
            monitors = state["monitors"]
            if now - state["monitors_at"] > MONITOR_CACHE_TTL_S:
                monitors = list_monitors()
                state["monitors"] = monitors
                state["monitors_at"] = now
        rect = resolve_monitor_rect(monitors, output)
        if rect is None:
            monitors = list_monitors()
            with lock:
                state["monitors"] = monitors
                state["monitors_at"] = now
            rect = resolve_monitor_rect(monitors, output)
        return rect

    def draw_privacy_card(dc: int, width: int, height: int, app_label: str) -> None:
        full = wintypes.RECT(0, 0, width, height)
        user32.FillRect(dc, ctypes.byref(full), bg_brush)
        gdi32.SetBkMode(dc, TRANSPARENT)
        center_y = height // 2

        old_font = gdi32.SelectObject(dc, kicker_font)
        gdi32.SetTextColor(dc, KICKER_COLOR)
        r1 = wintypes.RECT(0, center_y - 75, width, center_y - 35)
        user32.DrawTextW(dc, "Hidden by Followcast", -1, ctypes.byref(r1), DT_CENTER | DT_VCENTER | DT_SINGLELINE)

        gdi32.SelectObject(dc, app_font)
        gdi32.SetTextColor(dc, APP_COLOR)
        r2 = wintypes.RECT(0, center_y - 30, width, center_y + 30)
        user32.DrawTextW(dc, app_label, -1, ctypes.byref(r2), DT_CENTER | DT_VCENTER | DT_SINGLELINE)

        gdi32.SelectObject(dc, detail_font)
        gdi32.SetTextColor(dc, DETAIL_COLOR)
        r3 = wintypes.RECT(0, center_y + 40, width, center_y + 75)
        user32.DrawTextW(
            dc,
            "This application is off in the Followcast privacy filter.",
            -1,
            ctypes.byref(r3),
            DT_CENTER | DT_VCENTER | DT_SINGLELINE,
        )
        gdi32.SelectObject(dc, old_font)

    def paint_window(hwnd: int) -> None:
        ps = PAINTSTRUCT()
        hdc = user32.BeginPaint(hwnd, ctypes.byref(ps))
        if not hdc:
            return
        try:
            client = wintypes.RECT()
            user32.GetClientRect(hwnd, ctypes.byref(client))
            cw = max(1, client.right - client.left)
            ch = max(1, client.bottom - client.top)

            mem_dc = gdi32.CreateCompatibleDC(hdc)
            bmp = gdi32.CreateCompatibleBitmap(hdc, cw, ch)
            old_bmp = gdi32.SelectObject(mem_dc, bmp)
            try:
                privacy = read_privacy()
                if privacy.get("visible") and privacy.get("kind") == "slide":
                    dest = destination_output(privacy)
                    if dest is not None:
                        with lock:
                            state["output"] = dest
                if privacy.get("visible") and privacy.get("appLabel"):
                    draw_privacy_card(mem_dc, cw, ch, str(privacy["appLabel"]))
                else:
                    with lock:
                        output = state["output"]
                    rect = get_monitor_rect(output)
                    if rect is None:
                        full = wintypes.RECT(0, 0, cw, ch)
                        user32.FillRect(mem_dc, ctypes.byref(full), bg_brush)
                    else:
                        mx, my, mw, mh = rect
                        screen_dc = user32.GetDC(0)
                        try:
                            gdi32.SetStretchBltMode(mem_dc, HALFTONE)
                            gdi32.SetBrushOrgEx(mem_dc, 0, 0, None)
                            gdi32.StretchBlt(
                                mem_dc, 0, 0, cw, ch,
                                screen_dc, mx, my, mw, mh,
                                SRCCOPY,
                            )
                        finally:
                            user32.ReleaseDC(0, screen_dc)
                gdi32.BitBlt(hdc, 0, 0, cw, ch, mem_dc, 0, 0, SRCCOPY)
            finally:
                gdi32.SelectObject(mem_dc, old_bmp)
                gdi32.DeleteObject(bmp)
                gdi32.DeleteDC(mem_dc)
        finally:
            user32.EndPaint(hwnd, ctypes.byref(ps))

    def _wnd_proc(hwnd: int, msg: int, wparam: int, lparam: int) -> int:
        if msg == WM_ERASEBKGND:
            return 1
        if msg == WM_TIMER:
            user32.InvalidateRect(hwnd, None, False)
            return 0
        if msg == WM_PAINT:
            paint_window(hwnd)
            return 0
        if msg == WM_CLOSE:
            user32.DestroyWindow(hwnd)
            return 0
        if msg == WM_DESTROY:
            user32.KillTimer(hwnd, TIMER_ID)
            user32.PostQuitMessage(0)
            return 0
        return int(user32.DefWindowProcW(hwnd, msg, wparam, lparam))

    wnd_proc = WNDPROC(_wnd_proc)
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HINSTANCE
    hinstance = kernel32.GetModuleHandleW(None)

    wc = WNDCLASSEXW()
    wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
    wc.style = 0
    wc.lpfnWndProc = wnd_proc
    wc.hInstance = hinstance
    wc.hCursor = user32.LoadCursorW(None, ctypes.c_void_p(32512))  # IDC_ARROW
    wc.hbrBackground = bg_brush
    wc.lpszClassName = FOLLOWCAST_SURFACE_CLASS

    if not user32.RegisterClassExW(ctypes.byref(wc)):
        return 1

    title = os.environ.get("FOLLOWCAST_TITLE", "Followcast")
    user32.CreateWindowExW.restype = wintypes.HWND
    hwnd = user32.CreateWindowExW(
        0,
        FOLLOWCAST_SURFACE_CLASS,
        title,
        WS_OVERLAPPEDWINDOW | WS_VISIBLE,
        100,
        100,
        WIDTH,
        HEIGHT,
        None,
        None,
        hinstance,
        None,
    )
    if not hwnd:
        return 1

    hwnd_box[0] = int(hwnd or 0)
    user32.SetTimer(hwnd, TIMER_ID, FRAME_INTERVAL_MS, None)

    def _read_stdin() -> None:
        for raw in stdin_line_iter(sys.stdin.fileno()):
            output = parse_stream_output(raw)
            if output is None:
                continue
            with lock:
                state["output"] = output
        if hwnd_box[0]:
            user32.PostMessageW(hwnd_box[0], WM_CLOSE, 0, 0)

    threading.Thread(target=_read_stdin, daemon=True).start()

    msg = wintypes.MSG()
    try:
        while user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    finally:
        gdi32.DeleteObject(bg_brush)
        gdi32.DeleteObject(kicker_font)
        gdi32.DeleteObject(app_font)
        gdi32.DeleteObject(detail_font)
    return 0


if __name__ == "__main__":
    raise SystemExit(_run_surface())
