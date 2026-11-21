# Followcast on Windows

Followcast runs natively on **Windows 10 and Windows 11** using Node.js and Python 3's
standard library (`ctypes` + Win32 APIs). No third-party Python packages or external
capture binaries are required.

## Requirements

- **Node.js 20.19+** (`node -v`)
- **Python 3.10+** available as `python` on `PATH` (`python --version`)

## Install & Build

From a local clone:

```powershell
npm install
npm run build
npm link
```

> **PowerShell note**: If PowerShell blocks `npm.ps1` due to execution policy, use
> `npm.cmd` (e.g., `npm.cmd install`, `npm.cmd run build`, `npm.cmd test`) or run from
> Command Prompt / Git Bash.

Or run directly without linking globally:

```powershell
node dist/cli.js
node dist/cli.js status
node dist/cli.js policy
```

## Running Followcast

1. Start the daemon:

```powershell
followcast
```

2. A native window titled **Followcast** opens. In Discord, Google Meet, Zoom, Microsoft
   Teams, or OBS, choose **Share Window -> Followcast**.
3. Keep the **Followcast** window **unminimized** (it can sit behind other windows—Windows
   Graphics Capture continues capturing occluded windows, whereas minimized windows stop
   painting).
4. Move focus between your monitors as normal. Followcast updates the **Followcast**
   window to mirror whichever display currently has keyboard focus.

## Privacy Policy & Status

Monitor names on Windows match the normalized Win32 display device names (`DISPLAY1`,
`DISPLAY2`, etc.). App identities match the executable stem (for example `Code`,
`chrome`, `Discord`, `WindowsTerminal`).

Check your active monitors, apps, and current decision:

```powershell
followcast status
```

Mute a monitor or app (shows the **Hidden by Followcast** card immediately):

```powershell
followcast policy set-monitor DISPLAY2 off
followcast policy set-app Discord off
followcast policy
```

Re-enable:

```powershell
followcast policy set-monitor DISPLAY2 on
followcast policy set-app Discord on
```

### File Locations on Windows

- **Policy file**: `%APPDATA%\followcast\policy.json` (or `$XDG_CONFIG_HOME/followcast/policy.json` if set)
- **Runtime privacy card state**: `%LOCALAPPDATA%\followcast\privacy.json` (fallback: `%TEMP%\followcast\privacy.json`)

## System Tray Switchboard & Hotkey

When running on Windows, Followcast adds a **system tray icon** (green = Live, amber = Hidden/Paused, gray = Idle):

- **Click or right-click the tray icon** to hide/resume sharing, toggle individual monitors (with friendly display names), toggle open apps, show the window, or quit.
- Press **`Ctrl+Shift+H`** anywhere to instantly toggle the **Hidden by Followcast** privacy card.
- You can also control it from any terminal: `followcast hide`, `followcast resume`, `followcast toggle`, `followcast stop`.

## WidBar Taskbar Widget (Windows 11)

Followcast ships a native Windows 11 [WidBar](https://apps.microsoft.com/detail/9PKLDNM83TP9)
widget in `widbar-plugin/` — the Windows counterpart to `omarchy-plugin/`.

```powershell
cd widbar-plugin
.\deploy.ps1
```

Then add **Followcast** to your WidBar taskbar to see `Live` / `Hidden` / `Idle` status
and toggle monitors or apps with a click. See [widbar-plugin/README.md](../widbar-plugin/README.md).

## How the Windows Backend Works

- **`win32_desktop.py`**:
  - Enables Per-Monitor DPI Awareness v2 so physical monitor coordinates and scale factors
    match accurately across mixed-DPI multi-monitor setups.
  - Enumerates monitors (`EnumDisplayMonitors` / `GetMonitorInfoW` / `GetDpiForMonitor`)
    and visible non-cloaked top-level windows (`EnumWindows` / `DwmGetWindowAttribute`).
  - Tracks foreground focus changes immediately via `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`
    in `events` mode and serves low-latency JSON queries over stdio in `serve` mode.
- **`win32_surface.py`**:
  - Registers a native Win32 window (`FollowcastSurface` class, titled `Followcast`), a system tray icon with right-click switchboard, and a global `Ctrl+Shift+H` privacy hotkey.
  - Captures the focused monitor via double-buffered Win32 GDI `StretchBlt` (`HALFTONE`) with aspect-ratio-preserving letterboxing/pillarboxing and live mouse cursor compositing (`GetCursorInfo` + `DrawIconEx`).
  - Renders the branded **Hidden by Followcast** card natively when a monitor, app, or manual pause is active.
