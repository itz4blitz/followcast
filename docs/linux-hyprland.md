# Followcast on Linux (Hyprland / Wayland)

On Linux with Hyprland, Followcast maps a single GTK4 source window on a headless
Hyprland output (`fc-dummy`) so Discord, Meet, or Zoom can capture it without the window
ever appearing on your physical monitors.

## Requirements

- **Node.js 20.19+**
- **Hyprland** (Wayland)
- `grim`, `python-gobject`, and `gtk4`

On Arch / Omarchy:

```bash
pacman -S grim python-gobject gtk4
```

## Install

```bash
gh release download --repo itz4blitz/followcast --pattern 'followcast-*.tgz'
npm install -g ./followcast-*.tgz
```

## Hyprland Configuration

Add the source window rule to `~/.config/hypr/hyprland.lua`:

```lua
-- One mapped source window on a headless output. Discord/Meet can capture it,
-- but it never appears on a physical monitor.
o.window({ title = "^Followcast$" }, {
  float = true,
  decorate = false,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_anim = true,
  monitor = "fc-dummy",
  no_initial_focus = true,
  no_focus = true,
  no_follow_mouse = true,
  render_unfocused = true,
  tag = "-default-opacity",
  opacity = "1 1",
  size = { 1280, 720 },
  move = { 0, 0 },
})
```

Muted apps paint the **Hidden by Followcast** page inside that same window. Do not add a
second Followcast Privacy window rule.

Reload Hyprland:

```bash
hyprctl reload
```

### Autostart

Create the headless output and start Followcast at login so the **Followcast** window is
already present in the share picker:

```lua
-- ~/.config/hypr/autostart.lua
o.exec_on_start("sh -c 'sleep 1 && hyprctl output create headless fc-dummy'")
o.exec_on_start("sh -c 'sleep 2 && followcast'")
```

## Omarchy Bar Plugin

On Omarchy, copy `omarchy-plugin/` to `~/.config/omarchy/plugins/blitz.followcast` and
add `blitz.followcast` to the bar in `~/.config/omarchy/shell.json`. The bar chip calls
`followcast status` and `followcast policy` to toggle monitors and apps.

## File Locations on Linux

- **Policy file**: `$XDG_CONFIG_HOME/followcast/policy.json` (fallback: `~/.config/followcast/policy.json`)
- **Runtime privacy card state**: `$XDG_RUNTIME_DIR/followcast/privacy.json` (fallback: `/tmp/followcast/privacy.json`)
