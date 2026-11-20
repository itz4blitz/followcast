# Followcast — WidBar Widget (Windows 11)

Windows 11 taskbar widget for [WidBar](https://apps.microsoft.com/detail/9PKLDNM83TP9) that mirrors the Omarchy bar chip:

- **Taskbar chip**: Followcast icon + live status dot (`Live`, `Hidden`, or `Idle`).
- **Flyout switchboard**: toggle individual monitors (`DISPLAY1`, `DISPLAY2`, …) and open applications on or off via `followcast policy`.
- **Settings**: optional custom `followcast.exe` path override (auto-detects `followcast.exe` on `PATH` by default).

## Requirements

- Windows 11 (x64) with Developer Mode enabled
- [WidBar](https://apps.microsoft.com/detail/9PKLDNM83TP9) installed
- .NET 10 SDK (`%LOCALAPPDATA%\Microsoft\dotnet` or on `PATH`)
- `followcast` installed (either `followcast.exe` from GitHub Releases or `npm link`)

## Install / Deploy

```powershell
cd widbar-plugin
.\deploy.ps1
```

Then open WidBar and add **Followcast** to your taskbar.
