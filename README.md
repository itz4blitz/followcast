# Followcast

Cross-platform screen-sharing source for **Linux (Hyprland / Wayland)** and **Windows (10/11)**.

Share **one** window titled **Followcast** in Meet, Zoom, Discord, or Teams. Followcast
always shows the **full display** that has keyboard focus and automatically follows when
focus moves to another monitor.

Video call share pickers cannot retarget a live screen share. Followcast is the single
source window you pick once; a lightweight daemon paints it with the currently focused
display and updates that feed as you move across monitors.

Muted monitors or apps show your audience a branded **Hidden by Followcast** privacy card
instead of the real display.

## Supported Platforms

| Platform                       | Status    | Backend                                                             | Guide                                            |
| ------------------------------ | --------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| **Linux (Hyprland / Wayland)** | Supported | `hyprctl` + socket2, GTK4 + `grim` on headless `fc-dummy`           | [docs/linux-hyprland.md](docs/linux-hyprland.md) |
| **Windows (10 / 11)**          | Supported | Native Win32 (`ctypes` GDI + `SetWinEventHook`, zero pip deps)      | [docs/windows.md](docs/windows.md)               |
| **macOS**                      | Planned   | Platform-agnostic domain ready for a Cocoa/ScreenCaptureKit adapter | [docs/architecture.md](docs/architecture.md)     |

## Install

Followcast is **not** on the npm registry. Install from a
[GitHub Release](https://github.com/itz4blitz/followcast/releases) tarball or build from
source.

### Windows (10 / 11)

Requirements: **Node.js 20.19+** and **Python 3.10+** on `PATH` (standard library only —
no extra `pip` packages needed).

```powershell
# From a GitHub Release tarball
gh release download --repo itz4blitz/followcast --pattern 'followcast-*.tgz'
npm install -g .\followcast-*.tgz

# Or from a local checkout
npm install
npm run build
npm link
```

See [docs/windows.md](docs/windows.md) for PowerShell tips, DPI notes, and capture picker
guidance.

### Linux (Hyprland / Wayland)

Requirements: **Node.js 20.19+**, `grim`, `python-gobject`, and `gtk4`.

```bash
pacman -S grim python-gobject gtk4
gh release download --repo itz4blitz/followcast --pattern 'followcast-*.tgz'
npm install -g ./followcast-*.tgz
```

Then add the `fc-dummy` headless output and Hyprland window rule described in
[docs/linux-hyprland.md](docs/linux-hyprland.md).

## Use

1. Start Followcast:

```bash
followcast
```

Optional skip list for hall-of-mirrors call windows:

```bash
followcast --deny-class zoom --deny-class skype
```

2. In Meet, Zoom, Discord, or Teams, open **Share Window** and choose **Followcast**.
3. Switch focus across monitors as usual. Followcast follows the focused display whenever
   both the monitor and active app are allowed by your policy. When a monitor or app is
   muted, the same **Followcast** window switches to the **Hidden by Followcast** card.
4. Inspect live state or toggle privacy rules from any terminal:

```bash
# Linux example
followcast policy set-monitor HDMI-A-1 off
followcast policy set-app slack off
followcast status

# Windows example
followcast policy set-monitor DISPLAY2 off
followcast policy set-app Slack off
followcast status
```

On Omarchy (Linux), you can also install the optional bar chip in `omarchy-plugin/` (see
[docs/linux-hyprland.md](docs/linux-hyprland.md)).

## Policy

Everything defaults to **on** (shareable).

- **Linux**: `$XDG_CONFIG_HOME/followcast/policy.json` (fallback: `~/.config/followcast/policy.json`)
- **Windows**: `%APPDATA%\followcast\policy.json` (fallback: `%USERPROFILE%\.config\followcast\policy.json`)

App identity:

- **Linux (Hyprland)**: Hyprland window `class` (browser tabs in one window are one app;
  Hyprland group members are separate apps).
- **Windows**: Process executable name without `.exe` (e.g., `Code`, `chrome`, `Discord`),
  falling back to the Win32 window class name.

## Documentation

- [Windows Guide](docs/windows.md) — setup, running on Windows 10/11, monitor & app names
- [Linux (Hyprland) Guide](docs/linux-hyprland.md) — headless `fc-dummy`, window rules, autostart, Omarchy plugin
- [Architecture](docs/architecture.md) — hexagonal ports/adapters design and adding new platforms

## Develop

```bash
npm install
npm run build
npm link
npm test
npm run test:python
npm run coverage
npm run mutation
npm run ci
```

## License

Apache-2.0
