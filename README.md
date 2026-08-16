# Followcast

Share **one** window in Meet, Zoom, or Discord. Followcast always shows the
**full display** that has keyboard focus, including the bar and window chrome,
and follows when that focus moves to another monitor.

The portal cannot retarget a live share. Followcast is the dummy window you pick
once. A daemon retargets [`wl-mirror`](https://github.com/Ferdi265/wl-mirror)
to the focused window's slurp region.

Muted monitors or apps show the audience a branded **Hidden by Followcast**
card instead of the real window.

## Install

```bash
pacman -S wl-mirror python-gobject gtk4 gtk4-layer-shell
git clone https://github.com/itz4blitz/followcast.git
cd followcast
npm install
npm run build
npm link
```

`npm link` puts `followcast` on your PATH.

Add to `~/.config/hypr/hyprland.lua`:

```lua
hl.permission({ binary = "/usr/bin/wl-mirror", type = "screencopy", mode = "allow" })

-- One shareable window. Discord stays on "loading" if the dummy is
-- fully off-screen or on a special workspace. Clip two pixels onto
-- the last monitor so the portal gets frames.
o.window({ class = "^at\\.yrlf\\.wl_mirror$", title = "^Followcast$" }, {
  float = true,
  decorate = false,
  border_size = 0,
  rounding = 0,
  no_shadow = true,
  no_anim = true,
  monitor = "DP-3",
  no_initial_focus = true,
  no_focus = true,
  no_follow_mouse = true,
  render_unfocused = true,
  size = { 1280, 720 },
  move = { 1438, 808 },
})
```

Do **not** add a window rule for a Followcast Privacy app. The blocked
card is a layer-shell overlay, not a shareable window.

Then `hyprctl reload`.

Run it at login so the **Followcast** window is already in the share picker:

```lua
-- ~/.config/hypr/autostart.lua
o.launch_on_start("followcast")
```

Or start it by hand:

```bash
followcast
```

Optional skip list for hall-of-mirrors call windows:

```bash
followcast --deny-class zoom --deny-class skype
```

## Use

1. A window titled **Followcast** is already running after login.
2. In the share picker, open **Windows** and pick **Followcast**. There
   is only that one Followcast entry.
3. Change focus as usual. The share follows the focused app only if that
   monitor and app are on in the policy. Crossing monitors plays a short
   Display 1 → Display 2 slide so viewers can tell you moved screens.
   When an app is muted, the same window shows the **Hidden by Followcast**
   card.
4. Mute a monitor or app:

```bash
followcast policy set-monitor HDMI-A-1 off
followcast policy set-app slack off
followcast status
```

On Omarchy, copy `omarchy-plugin/` to `~/.config/omarchy/plugins/blitz.followcast`
and add `blitz.followcast` to the bar in `~/.config/omarchy/shell.json`. The chip
calls `followcast status` / `followcast policy`.

You should not see a Followcast app window. The dummy hangs mostly off
the last monitor so Discord can still get frames. When something is
muted, a small **Hidden by Followcast** card is composited so the dummy
has pixels to show; the bar chip is the control.

## Policy

Default is on (shareable). Stored at `$XDG_CONFIG_HOME/followcast/policy.json`
(or `~/.config/followcast/policy.json`).

App identity is the Hyprland window class. Browser tabs in one window are one
app. Hyprland group members are separate apps.

## Develop

```bash
npm test
npm run coverage
npm run mutation
npm run ci
```

## License

Apache-2.0
