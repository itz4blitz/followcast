#!/usr/bin/env python3
"""Windows desktop introspection and foreground focus hook for Followcast."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

FOLLOWCAST_SURFACE_CLASS = "FollowcastSurface"


def normalize_device_name(device: str) -> str:
    prefix = "\\\\.\\"
    if device.startswith(prefix):
        return device[len(prefix) :]
    return device


def format_hwnd(hwnd: int) -> str:
    return f"0x{hwnd:x}"


def process_class_name(exe_path: str, win32_class: str) -> str:
    if win32_class == FOLLOWCAST_SURFACE_CLASS:
        return "followcast.surface"
    if exe_path != "":
        stem = Path(exe_path.replace("\\", "/")).stem
        if stem != "":
            return stem
    return win32_class


def build_monitor_snapshot(
    monitor_id: int,
    device_name: str,
    left: int,
    top: int,
    right: int,
    bottom: int,
    dpi: int,
    focused: bool,
) -> dict[str, Any]:
    width = max(1, right - left)
    height = max(1, bottom - top)
    scale = round(dpi / 96.0, 4) if dpi > 0 else 1.0
    return {
        "id": monitor_id,
        "name": normalize_device_name(device_name),
        "x": left,
        "y": top,
        "width": width,
        "height": height,
        "scale": scale,
        "focused": focused,
    }


def build_client_snapshot(
    hwnd: int,
    class_name: str,
    title: str,
    minimized: bool,
    monitor_id: int,
    left: int,
    top: int,
    right: int,
    bottom: int,
) -> dict[str, Any]:
    return {
        "address": format_hwnd(hwnd),
        "class": class_name,
        "title": title,
        "mapped": not minimized,
        "hidden": minimized,
        "monitor": monitor_id,
        "at": [left, top],
        "size": [max(1, right - left), max(1, bottom - top)],
    }


def _enable_dpi_awareness() -> None:
    if sys.platform != "win32":
        return
    import ctypes

    user32 = ctypes.windll.user32
    try:
        # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
        user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except (AttributeError, OSError):
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except (AttributeError, OSError):
        pass
    try:
        user32.SetProcessDPIAware()
    except (AttributeError, OSError):
        pass


def _enumerate_win32_monitors() -> list[tuple[int, dict[str, Any]]]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    try:
        shcore = ctypes.windll.shcore
    except OSError:
        shcore = None

    class MONITORINFOEXW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("rcMonitor", wintypes.RECT),
            ("rcWork", wintypes.RECT),
            ("dwFlags", wintypes.DWORD),
            ("szDevice", wintypes.WCHAR * 32),
        ]

    user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(MONITORINFOEXW)]
    user32.GetMonitorInfoW.restype = wintypes.BOOL
    user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
    user32.MonitorFromWindow.restype = wintypes.HMONITOR
    user32.GetForegroundWindow.restype = wintypes.HWND

    fg_hwnd = int(user32.GetForegroundWindow() or 0)
    fg_mon = int(user32.MonitorFromWindow(fg_hwnd, 2) or 0) if fg_hwnd else 0

    raw: list[tuple[int, str, int, int, int, int, int, bool]] = []
    cb_type = ctypes.WINFUNCTYPE(
        wintypes.BOOL,
        wintypes.HMONITOR,
        wintypes.HDC,
        ctypes.POINTER(wintypes.RECT),
        wintypes.LPARAM,
    )

    def _callback(
        hmon: int,
        _hdc: int,
        _lprect: Any,
        _lparam: int,
    ) -> int:
        info = MONITORINFOEXW()
        info.cbSize = ctypes.sizeof(MONITORINFOEXW)
        if not user32.GetMonitorInfoW(hmon, ctypes.byref(info)):
            return 1
        dpi = 96
        if shcore is not None:
            dpi_x = wintypes.UINT(96)
            dpi_y = wintypes.UINT(96)
            try:
                if shcore.GetDpiForMonitor(wintypes.HMONITOR(hmon), 0, ctypes.byref(dpi_x), ctypes.byref(dpi_y)) == 0:
                    dpi = int(dpi_x.value)
            except (AttributeError, OSError):
                dpi = 96
        is_primary = bool(info.dwFlags & 1)
        focused = (hmon == fg_mon) if fg_mon else is_primary
        raw.append(
            (
                int(hmon),
                info.szDevice,
                int(info.rcMonitor.left),
                int(info.rcMonitor.top),
                int(info.rcMonitor.right),
                int(info.rcMonitor.bottom),
                dpi,
                focused,
            )
        )
        return 1

    user32.EnumDisplayMonitors(None, None, cb_type(_callback), 0)
    result: list[tuple[int, dict[str, Any]]] = []
    for idx, (hmon, device, left, top, right, bottom, dpi, focused) in enumerate(raw):
        snap = build_monitor_snapshot(idx, device, left, top, right, bottom, dpi, focused)
        result.append((hmon, snap))
    return result


def list_monitors() -> list[dict[str, Any]]:
    return [snap for _, snap in _enumerate_win32_monitors()]


def _query_process_exe(hwnd: int) -> str:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    pid = wintypes.DWORD(0)
    user32.GetWindowThreadProcessId(wintypes.HWND(hwnd), ctypes.byref(pid))
    if pid.value == 0:
        return ""
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if not handle:
        return ""
    try:
        buf_len = wintypes.DWORD(1024)
        buf = ctypes.create_unicode_buffer(buf_len.value)
        if kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(buf_len)):
            return buf.value
        return ""
    finally:
        kernel32.CloseHandle(handle)


def _is_cloaked(hwnd: int) -> bool:
    import ctypes
    from ctypes import wintypes

    try:
        dwmapi = ctypes.windll.dwmapi
    except OSError:
        return False
    DWMWA_CLOAKED = 14
    cloaked = wintypes.DWORD(0)
    hr = dwmapi.DwmGetWindowAttribute(
        wintypes.HWND(hwnd),
        DWMWA_CLOAKED,
        ctypes.byref(cloaked),
        ctypes.sizeof(cloaked),
    )
    return hr == 0 and cloaked.value != 0


def list_clients() -> list[dict[str, Any]]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    monitors = _enumerate_win32_monitors()
    mon_ids = {hmon: snap["id"] for hmon, snap in monitors}

    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.IsIconic.restype = wintypes.BOOL
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.restype = ctypes.c_int
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.restype = ctypes.c_int
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
    user32.MonitorFromWindow.restype = wintypes.HMONITOR

    clients: list[dict[str, Any]] = []
    cb_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def _callback(hwnd: int, _lparam: int) -> int:
        if not user32.IsWindowVisible(hwnd):
            return 1
        if _is_cloaked(hwnd):
            return 1
        title_len = user32.GetWindowTextLengthW(hwnd)
        class_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buf, 256)
        win32_class = class_buf.value
        if title_len <= 0 and win32_class != FOLLOWCAST_SURFACE_CLASS:
            return 1
        title_buf = ctypes.create_unicode_buffer(title_len + 1)
        if title_len > 0:
            user32.GetWindowTextW(hwnd, title_buf, title_len + 1)
        rect = wintypes.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return 1
        hmon = int(user32.MonitorFromWindow(hwnd, 2) or 0)
        mon_id = mon_ids.get(hmon, 0)
        exe_path = _query_process_exe(hwnd)
        class_name = process_class_name(exe_path, win32_class)
        clients.append(
            build_client_snapshot(
                hwnd=int(hwnd),
                class_name=class_name,
                title=title_buf.value,
                minimized=bool(user32.IsIconic(hwnd)),
                monitor_id=mon_id,
                left=int(rect.left),
                top=int(rect.top),
                right=int(rect.right),
                bottom=int(rect.bottom),
            )
        )
        return 1

    user32.EnumWindows(cb_type(_callback), 0)
    return clients


def get_active_window() -> dict[str, Any]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    user32.GetForegroundWindow.restype = wintypes.HWND
    hwnd = int(user32.GetForegroundWindow() or 0)
    if hwnd == 0:
        return {}
    return {"address": format_hwnd(hwnd)}


def _dispatch_command(command: str) -> Any:
    if command == "clients":
        return list_clients()
    if command == "monitors":
        return list_monitors()
    if command == "activewindow":
        return get_active_window()
    raise ValueError(f"unknown win32 command: {command}")


def serve_loop() -> None:
    for line in sys.stdin:
        command = line.strip()
        if command == "":
            continue
        payload = _dispatch_command(command)
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


def events_loop() -> None:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    EVENT_SYSTEM_FOREGROUND = 0x0003
    WINEVENT_OUTOFCONTEXT = 0x0000

    cb_type = ctypes.WINFUNCTYPE(
        None,
        wintypes.HANDLE,
        wintypes.DWORD,
        wintypes.HWND,
        wintypes.LONG,
        wintypes.LONG,
        wintypes.DWORD,
        wintypes.DWORD,
    )

    def _on_event(
        _hook: int,
        _event: int,
        hwnd: int,
        _id_object: int,
        _id_child: int,
        _thread: int,
        _ms: int,
    ) -> None:
        if hwnd:
            sys.stdout.write(f"activewindowv2>>{format_hwnd(int(hwnd))}\n")
            sys.stdout.flush()

    callback = cb_type(_on_event)
    user32.SetWinEventHook.argtypes = [
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HMODULE,
        cb_type,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
    ]
    user32.SetWinEventHook.restype = wintypes.HANDLE
    user32.UnhookWinEvent.argtypes = [wintypes.HANDLE]
    user32.UnhookWinEvent.restype = wintypes.BOOL
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
    hook = user32.SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        0,
        callback,
        0,
        0,
        WINEVENT_OUTOFCONTEXT,
    )
    msg = wintypes.MSG()
    try:
        while user32.GetMessageW(ctypes.byref(msg), 0, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    finally:
        if hook:
            user32.UnhookWinEvent(hook)


def main(argv: list[str]) -> int:
    _enable_dpi_awareness()
    if len(argv) < 2:
        sys.stderr.write("usage: win32_desktop.py <clients|monitors|activewindow|serve|events>\n")
        return 1
    command = argv[1]
    if command == "serve":
        serve_loop()
        return 0
    if command == "events":
        events_loop()
        return 0
    payload = _dispatch_command(command)
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
