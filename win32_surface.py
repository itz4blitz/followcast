#!/usr/bin/env python3
"""Windows native Followcast share surface using Win32 GDI (stdlib ctypes only)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from capture_argv import destination_output, parse_stream_output, stdin_line_iter
from win32_desktop import (
    FOLLOWCAST_SURFACE_CLASS,
    list_clients,
    list_monitors,
    list_monitors_with_labels,
)

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


def policy_file_path(env: Mapping[str, str], home: Path) -> Path:
    base = env.get("XDG_CONFIG_HOME") or env.get("APPDATA")
    if base:
        return Path(base) / "followcast" / "policy.json"
    return home / ".config" / "followcast" / "policy.json"


def load_policy(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"monitors": {}, "apps": {}}
    if not isinstance(parsed, dict):
        return {"monitors": {}, "apps": {}}
    monitors_raw = parsed.get("monitors")
    apps_raw = parsed.get("apps")
    monitors = (
        {k: v for k, v in monitors_raw.items() if isinstance(k, str) and isinstance(v, bool)}
        if isinstance(monitors_raw, dict)
        else {}
    )
    apps = (
        {k: v for k, v in apps_raw.items() if isinstance(k, str) and isinstance(v, bool)}
        if isinstance(apps_raw, dict)
        else {}
    )
    result: dict[str, Any] = {"monitors": monitors, "apps": apps}
    if parsed.get("paused") is True:
        result["paused"] = True
    return result


def save_policy_atomic(path: Path, policy: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {
        "monitors": policy.get("monitors", {}),
        "apps": policy.get("apps", {}),
    }
    if policy.get("paused") is True:
        payload["paused"] = True
    staging = path.with_suffix(".json.tmp")
    staging.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(staging, path)


def toggle_paused(policy: dict[str, Any]) -> dict[str, Any]:
    next_policy: dict[str, Any] = {
        "monitors": dict(policy.get("monitors", {})),
        "apps": dict(policy.get("apps", {})),
    }
    if policy.get("paused") is not True:
        next_policy["paused"] = True
    return next_policy


def toggle_policy_monitor(policy: dict[str, Any], name: str) -> dict[str, Any]:
    monitors = dict(policy.get("monitors", {}))
    monitors[name] = not monitors.get(name, True)
    next_policy: dict[str, Any] = {
        "monitors": monitors,
        "apps": dict(policy.get("apps", {})),
    }
    if policy.get("paused") is True:
        next_policy["paused"] = True
    return next_policy


def toggle_policy_app(policy: dict[str, Any], class_name: str) -> dict[str, Any]:
    apps = dict(policy.get("apps", {}))
    apps[class_name] = not apps.get(class_name, True)
    next_policy: dict[str, Any] = {
        "monitors": dict(policy.get("monitors", {})),
        "apps": apps,
    }
    if policy.get("paused") is True:
        next_policy["paused"] = True
    return next_policy


def fit_aspect_rect(
    src_w: int,
    src_h: int,
    dst_w: int,
    dst_h: int,
) -> tuple[int, int, int, int]:
    if src_w <= 0 or src_h <= 0 or dst_w <= 0 or dst_h <= 0:
        return (0, 0, max(1, dst_w), max(1, dst_h))
    scale = min(dst_w / src_w, dst_h / src_h)
    w = max(1, min(dst_w, round(src_w * scale)))
    h = max(1, min(dst_h, round(src_h * scale)))
    x = (dst_w - w) // 2
    y = (dst_h - h) // 2
    return (x, y, w, h)


def map_cursor_position(
    cursor_x: int,
    cursor_y: int,
    mon_rect: tuple[int, int, int, int],
    dst_rect: tuple[int, int, int, int],
) -> tuple[int, int] | None:
    mx, my, mw, mh = mon_rect
    dx, dy, dw, dh = dst_rect
    if mw <= 0 or mh <= 0:
        return None
    if cursor_x < mx or cursor_x >= mx + mw or cursor_y < my or cursor_y >= my + mh:
        return None
    rx = dx + round((cursor_x - mx) * dw / mw)
    ry = dy + round((cursor_y - my) * dh / mh)
    return (rx, ry)


_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/itz4blitz/followcast/releases/latest"


def parse_semver(version: str) -> tuple[int, int, int] | None:
    match = _SEMVER_RE.match(version.strip())
    if match is None:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def is_newer_version(current: str, latest: str) -> bool:
    left = parse_semver(current)
    right = parse_semver(latest)
    if left is None or right is None:
        return False
    return right > left


def format_update_prompt(latest_version: str) -> str:
    clean = latest_version.strip()
    tag = clean if clean.startswith("v") else f"v{clean}"
    return f"A new version of Followcast is available ({tag}). Would you like to upgrade?"


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
    shell32 = ctypes.windll.shell32

    WS_OVERLAPPEDWINDOW = 0x00CF0000
    WS_VISIBLE = 0x10000000
    WM_DESTROY = 0x0002
    WM_PAINT = 0x000F
    WM_CLOSE = 0x0010
    WM_ERASEBKGND = 0x0014
    WM_TIMER = 0x0113
    WM_HOTKEY = 0x0312
    WM_APP = 0x8000
    WM_TRAYICON = WM_APP + 1
    WM_UPDATE_AVAILABLE = WM_APP + 2
    MB_YESNO = 0x00000004
    MB_ICONINFORMATION = 0x00000040
    MB_SETFOREGROUND = 0x00010000
    IDYES = 6
    WM_LBUTTONUP = 0x0202
    WM_RBUTTONUP = 0x0205
    WM_CONTEXTMENU = 0x007B
    TIMER_ID = 1
    HOTKEY_HIDE_ID = 1
    MOD_CONTROL = 0x0002
    MOD_SHIFT = 0x0004
    MOD_NOREPEAT = 0x4000
    VK_H = 0x48
    CURSOR_SHOWING = 0x00000001
    DI_NORMAL = 0x0003
    NIF_MESSAGE = 0x00000001
    NIF_ICON = 0x00000002
    NIF_TIP = 0x00000004
    NIM_ADD = 0x00000000
    NIM_MODIFY = 0x00000001
    NIM_DELETE = 0x00000002
    MF_STRING = 0x00000000
    MF_SEPARATOR = 0x00000800
    MF_GRAYED = 0x00000001
    MF_CHECKED = 0x00000008
    TPM_RIGHTBUTTON = 0x0002
    TPM_RETURNCMD = 0x0100
    SW_RESTORE = 9
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
    TRAY_LIVE_COLOR = rgb(0x22, 0xC5, 0x5E)
    TRAY_HIDDEN_COLOR = rgb(0xF5, 0x9E, 0x0B)
    TRAY_IDLE_COLOR = rgb(0x64, 0x74, 0x8B)

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

    class CURSORINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("flags", wintypes.DWORD),
            ("hCursor", wintypes.HANDLE),
            ("ptScreenPos", wintypes.POINT),
        ]

    class ICONINFO(ctypes.Structure):
        _fields_ = [
            ("fIcon", wintypes.BOOL),
            ("xHotspot", wintypes.DWORD),
            ("yHotspot", wintypes.DWORD),
            ("hbmMask", wintypes.HBITMAP),
            ("hbmColor", wintypes.HBITMAP),
        ]

    class NOTIFYICONDATAW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("hWnd", wintypes.HWND),
            ("uID", wintypes.UINT),
            ("uFlags", wintypes.UINT),
            ("uCallbackMessage", wintypes.UINT),
            ("hIcon", wintypes.HICON),
            ("szTip", wintypes.WCHAR * 64),
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
    user32.GetCursorInfo.argtypes = [ctypes.POINTER(CURSORINFO)]
    user32.GetCursorInfo.restype = wintypes.BOOL
    user32.GetIconInfo.argtypes = [wintypes.HICON, ctypes.POINTER(ICONINFO)]
    user32.GetIconInfo.restype = wintypes.BOOL
    user32.DrawIconEx.argtypes = [
        wintypes.HDC,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HICON,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
        wintypes.HBRUSH,
        wintypes.UINT,
    ]
    user32.DrawIconEx.restype = wintypes.BOOL
    user32.CreateIconIndirect.argtypes = [ctypes.POINTER(ICONINFO)]
    user32.CreateIconIndirect.restype = wintypes.HICON
    user32.DestroyIcon.argtypes = [wintypes.HICON]
    user32.DestroyIcon.restype = wintypes.BOOL
    user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
    user32.RegisterHotKey.restype = wintypes.BOOL
    user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.UnregisterHotKey.restype = wintypes.BOOL
    user32.CreatePopupMenu.argtypes = []
    user32.CreatePopupMenu.restype = wintypes.HMENU
    user32.DestroyMenu.argtypes = [wintypes.HMENU]
    user32.DestroyMenu.restype = wintypes.BOOL
    user32.AppendMenuW.argtypes = [wintypes.HMENU, wintypes.UINT, ctypes.c_size_t, wintypes.LPCWSTR]
    user32.AppendMenuW.restype = wintypes.BOOL
    user32.TrackPopupMenu.argtypes = [
        wintypes.HMENU,
        wintypes.UINT,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.HWND,
        ctypes.c_void_p,
    ]
    user32.TrackPopupMenu.restype = wintypes.BOOL
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
    user32.GetCursorPos.restype = wintypes.BOOL
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.ShowWindow.restype = wintypes.BOOL
    user32.MessageBoxW.argtypes = [
        wintypes.HWND,
        wintypes.LPCWSTR,
        wintypes.LPCWSTR,
        wintypes.UINT,
    ]
    user32.MessageBoxW.restype = ctypes.c_int
    gdi32.Ellipse.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int]
    gdi32.Ellipse.restype = wintypes.BOOL
    gdi32.CreatePen.argtypes = [ctypes.c_int, ctypes.c_int, wintypes.COLORREF]
    gdi32.CreatePen.restype = wintypes.HPEN
    shell32.Shell_NotifyIconW.argtypes = [wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW)]
    shell32.Shell_NotifyIconW.restype = wintypes.BOOL

    lock = threading.Lock()
    state: dict[str, Any] = {
        "output": None,
        "monitors": list_monitors(),
        "monitors_at": time.monotonic(),
        "tray_status": "idle",
        "available_update": None,
    }
    hwnd_box: list[int] = [0]
    privacy_file = runtime_state_path(os.environ, tempfile.gettempdir())
    policy_path = policy_file_path(os.environ, Path.home())

    def create_dot_icon(color: int) -> int:
        size = 16
        screen_dc = user32.GetDC(0)
        color_dc = gdi32.CreateCompatibleDC(screen_dc)
        mask_dc = gdi32.CreateCompatibleDC(screen_dc)
        color_bmp = gdi32.CreateCompatibleBitmap(screen_dc, size, size)
        mask_bmp = gdi32.CreateCompatibleBitmap(mask_dc, size, size)
        old_color = gdi32.SelectObject(color_dc, color_bmp)
        old_mask = gdi32.SelectObject(mask_dc, mask_bmp)
        try:
            black_brush = gdi32.CreateSolidBrush(rgb(0, 0, 0))
            white_brush = gdi32.CreateSolidBrush(rgb(255, 255, 255))
            dot_brush = gdi32.CreateSolidBrush(color)
            dot_pen = gdi32.CreatePen(0, 1, color)
            full_rect = wintypes.RECT(0, 0, size, size)
            user32.FillRect(color_dc, ctypes.byref(full_rect), black_brush)
            user32.FillRect(mask_dc, ctypes.byref(full_rect), white_brush)
            old_cb = gdi32.SelectObject(color_dc, dot_brush)
            old_cp = gdi32.SelectObject(color_dc, dot_pen)
            gdi32.Ellipse(color_dc, 2, 2, size - 2, size - 2)
            gdi32.SelectObject(color_dc, old_cb)
            gdi32.SelectObject(color_dc, old_cp)
            old_mb = gdi32.SelectObject(mask_dc, black_brush)
            gdi32.Ellipse(mask_dc, 2, 2, size - 2, size - 2)
            gdi32.SelectObject(mask_dc, old_mb)
            gdi32.DeleteObject(black_brush)
            gdi32.DeleteObject(white_brush)
            gdi32.DeleteObject(dot_brush)
            gdi32.DeleteObject(dot_pen)
            ii = ICONINFO()
            ii.fIcon = True
            ii.xHotspot = 0
            ii.yHotspot = 0
            ii.hbmMask = mask_bmp
            ii.hbmColor = color_bmp
            return int(user32.CreateIconIndirect(ctypes.byref(ii)) or 0)
        finally:
            gdi32.SelectObject(color_dc, old_color)
            gdi32.SelectObject(mask_dc, old_mask)
            gdi32.DeleteObject(color_bmp)
            gdi32.DeleteObject(mask_bmp)
            gdi32.DeleteDC(color_dc)
            gdi32.DeleteDC(mask_dc)
            user32.ReleaseDC(0, screen_dc)

    tray_icons = {
        "live": create_dot_icon(TRAY_LIVE_COLOR),
        "hidden": create_dot_icon(TRAY_HIDDEN_COLOR),
        "idle": create_dot_icon(TRAY_IDLE_COLOR),
    }

    def read_policy_disk() -> dict[str, Any]:
        if not policy_path.exists():
            return {"monitors": {}, "apps": {}}
        try:
            return load_policy(policy_path.read_text(encoding="utf-8"))
        except OSError:
            return {"monitors": {}, "apps": {}}

    def update_tray_status(hwnd: int, status_kind: str) -> None:
        if state["tray_status"] == status_kind:
            return
        state["tray_status"] = status_kind
        nid = NOTIFYICONDATAW()
        nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
        nid.hWnd = hwnd
        nid.uID = 1
        nid.uFlags = NIF_ICON | NIF_TIP
        nid.hIcon = tray_icons.get(status_kind, tray_icons["idle"])
        labels = {
            "live": "Followcast — Live",
            "hidden": "Followcast — Hidden",
            "idle": "Followcast — Idle",
        }
        nid.szTip = labels.get(status_kind, "Followcast")
        shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(nid))

    def launch_upgrade(hwnd: int) -> None:
        install_cmd = (
            "irm https://raw.githubusercontent.com/itz4blitz/followcast/master/install.ps1 | iex; "
            "Start-Process followcast.exe"
        )
        creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
        try:
            subprocess.Popen(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    install_cmd,
                ],
                creationflags=creationflags,
                close_fds=True,
            )
        except OSError:
            return
        user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)

    def prompt_for_update(hwnd: int) -> None:
        with lock:
            latest = state["available_update"]
        if not isinstance(latest, str) or latest == "":
            return
        answer = int(
            user32.MessageBoxW(
                hwnd,
                format_update_prompt(latest),
                "Followcast Update",
                MB_YESNO | MB_ICONINFORMATION | MB_SETFOREGROUND,
            )
        )
        if answer == IDYES:
            launch_upgrade(hwnd)

    def show_tray_menu(hwnd: int) -> None:
        menu = user32.CreatePopupMenu()
        if not menu:
            return
        try:
            policy = read_policy_disk()
            is_paused = policy.get("paused") is True
            status_label = {
                "live": "Followcast — Live",
                "hidden": "Followcast — Hidden",
                "idle": "Followcast — Idle",
            }.get(str(state["tray_status"]), "Followcast")
            user32.AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, status_label)
            with lock:
                available_update = state["available_update"]
            if isinstance(available_update, str) and available_update != "":
                tag = available_update if available_update.startswith("v") else f"v{available_update}"
                user32.AppendMenuW(menu, MF_STRING, 4, f"Upgrade to {tag}...")
            user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
            pause_text = "Resume Share (Ctrl+Shift+H)" if is_paused else "Hide Share (Ctrl+Shift+H)"
            user32.AppendMenuW(menu, MF_STRING, 1, pause_text)

            cmd_actions: dict[int, tuple[str, str]] = {}
            next_id = 100

            monitors = list_monitors_with_labels()
            if monitors:
                user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
                for mon in monitors:
                    name = str(mon.get("name", ""))
                    label = str(mon.get("label", name))
                    enabled = policy.get("monitors", {}).get(name, True)
                    flags = MF_STRING | (MF_CHECKED if enabled else 0)
                    user32.AppendMenuW(menu, flags, next_id, f"Monitor: {label}")
                    cmd_actions[next_id] = ("monitor", name)
                    next_id += 1

            clients = list_clients()
            seen_apps: set[str] = set()
            app_names: list[str] = []
            for client in clients:
                cls = str(client.get("class", ""))
                if cls == "" or cls == "followcast.surface" or cls in seen_apps:
                    continue
                seen_apps.add(cls)
                app_names.append(cls)
            if app_names:
                user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
                for cls in sorted(app_names, key=str.lower)[:12]:
                    enabled = policy.get("apps", {}).get(cls, True)
                    flags = MF_STRING | (MF_CHECKED if enabled else 0)
                    user32.AppendMenuW(menu, flags, next_id, f"App: {cls}")
                    cmd_actions[next_id] = ("app", cls)
                    next_id += 1

            user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
            user32.AppendMenuW(menu, MF_STRING, 2, "Show Followcast Window")
            user32.AppendMenuW(menu, MF_STRING, 3, "Quit Followcast")

            pt = wintypes.POINT()
            user32.GetCursorPos(ctypes.byref(pt))
            user32.SetForegroundWindow(hwnd)
            chosen = int(
                user32.TrackPopupMenu(
                    menu,
                    TPM_RETURNCMD | TPM_RIGHTBUTTON,
                    pt.x,
                    pt.y,
                    0,
                    hwnd,
                    None,
                )
            )
            if chosen == 1:
                save_policy_atomic(policy_path, toggle_paused(policy))
            elif chosen == 2:
                user32.ShowWindow(hwnd, SW_RESTORE)
                user32.SetForegroundWindow(hwnd)
            elif chosen == 3:
                user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
            elif chosen == 4:
                prompt_for_update(hwnd)
            elif chosen in cmd_actions:
                kind, target = cmd_actions[chosen]
                if kind == "monitor":
                    save_policy_atomic(policy_path, toggle_policy_monitor(policy, target))
                elif kind == "app":
                    save_policy_atomic(policy_path, toggle_policy_app(policy, target))
        finally:
            user32.DestroyMenu(menu)

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
                    update_tray_status(hwnd, "hidden")
                    draw_privacy_card(mem_dc, cw, ch, str(privacy["appLabel"]))
                else:
                    with lock:
                        output = state["output"]
                    rect = get_monitor_rect(output)
                    full = wintypes.RECT(0, 0, cw, ch)
                    user32.FillRect(mem_dc, ctypes.byref(full), bg_brush)
                    if rect is None:
                        update_tray_status(hwnd, "idle")
                    else:
                        update_tray_status(hwnd, "live")
                        mx, my, mw, mh = rect
                        dx, dy, dw, dh = fit_aspect_rect(mw, mh, cw, ch)
                        screen_dc = user32.GetDC(0)
                        try:
                            gdi32.SetStretchBltMode(mem_dc, HALFTONE)
                            gdi32.SetBrushOrgEx(mem_dc, 0, 0, None)
                            gdi32.StretchBlt(
                                mem_dc, dx, dy, dw, dh,
                                screen_dc, mx, my, mw, mh,
                                SRCCOPY,
                            )
                            ci = CURSORINFO()
                            ci.cbSize = ctypes.sizeof(CURSORINFO)
                            if (
                                user32.GetCursorInfo(ctypes.byref(ci))
                                and (ci.flags & CURSOR_SHOWING)
                                and ci.hCursor
                            ):
                                mapped = map_cursor_position(
                                    int(ci.ptScreenPos.x),
                                    int(ci.ptScreenPos.y),
                                    (mx, my, mw, mh),
                                    (dx, dy, dw, dh),
                                )
                                if mapped is not None:
                                    hot_x = 0
                                    hot_y = 0
                                    ii = ICONINFO()
                                    if user32.GetIconInfo(ci.hCursor, ctypes.byref(ii)):
                                        hot_x = int(ii.xHotspot)
                                        hot_y = int(ii.yHotspot)
                                        if ii.hbmMask:
                                            gdi32.DeleteObject(ii.hbmMask)
                                        if ii.hbmColor:
                                            gdi32.DeleteObject(ii.hbmColor)
                                    scale = min(dw / max(1, mw), dh / max(1, mh))
                                    cur_size = max(12, round(32 * scale))
                                    cx = mapped[0] - round(hot_x * scale)
                                    cy = mapped[1] - round(hot_y * scale)
                                    user32.DrawIconEx(
                                        mem_dc,
                                        cx,
                                        cy,
                                        ci.hCursor,
                                        cur_size,
                                        cur_size,
                                        0,
                                        None,
                                        DI_NORMAL,
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
        if msg == WM_HOTKEY and wparam == HOTKEY_HIDE_ID:
            save_policy_atomic(policy_path, toggle_paused(read_policy_disk()))
            return 0
        if msg == WM_TRAYICON:
            event_code = lparam & 0xFFFF
            if event_code in (WM_RBUTTONUP, WM_LBUTTONUP, WM_CONTEXTMENU):
                show_tray_menu(hwnd)
            return 0
        if msg == WM_UPDATE_AVAILABLE:
            prompt_for_update(hwnd)
            return 0
        if msg == WM_CLOSE:
            user32.DestroyWindow(hwnd)
            return 0
        if msg == WM_DESTROY:
            user32.KillTimer(hwnd, TIMER_ID)
            user32.UnregisterHotKey(hwnd, HOTKEY_HIDE_ID)
            nid = NOTIFYICONDATAW()
            nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
            nid.hWnd = hwnd
            nid.uID = 1
            shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
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
    user32.RegisterHotKey(hwnd, HOTKEY_HIDE_ID, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_H)

    nid = NOTIFYICONDATAW()
    nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
    nid.hWnd = hwnd
    nid.uID = 1
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
    nid.uCallbackMessage = WM_TRAYICON
    nid.hIcon = tray_icons["idle"]
    nid.szTip = "Followcast — Idle"
    shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid))

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

    def _check_for_updates() -> None:
        if os.environ.get("FOLLOWCAST_NO_UPDATE_CHECK") == "1":
            return
        current = os.environ.get("FOLLOWCAST_VERSION", "")
        if current == "":
            return
        try:
            req = urllib.request.Request(
                GITHUB_LATEST_RELEASE_URL,
                headers={"User-Agent": "followcast-updater"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            tag = data.get("tag_name") if isinstance(data, dict) else None
            if isinstance(tag, str) and is_newer_version(current, tag):
                with lock:
                    state["available_update"] = tag
                if hwnd_box[0]:
                    user32.PostMessageW(hwnd_box[0], WM_UPDATE_AVAILABLE, 0, 0)
        except Exception:
            return

    threading.Thread(target=_check_for_updates, daemon=True).start()

    msg = wintypes.MSG()
    try:
        while user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    finally:
        for icon in tray_icons.values():
            if icon:
                user32.DestroyIcon(icon)
        gdi32.DeleteObject(bg_brush)
        gdi32.DeleteObject(kicker_font)
        gdi32.DeleteObject(app_font)
        gdi32.DeleteObject(detail_font)
    return 0


if __name__ == "__main__":
    raise SystemExit(_run_surface())
