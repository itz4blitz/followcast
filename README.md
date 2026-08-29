# Followcast

Share **one** window in Meet, Zoom, or Discord. Followcast always shows the
**full display** that has keyboard focus, including the bar and window chrome,
and follows when that focus moves to another monitor.

The portal cannot retarget a live share. Followcast is the single source window
you pick once. A daemon paints it with the current focused display and updates
that feed when focus moves. The source lives on a headless Hyprland output, so
you do not see it on any physical monitor.

Muted monitors or apps show the audience a branded **Hidden by Followcast**
card instead of the real window.

## Install

Followcast is **not** on the npm registry. Install the CLI tarball from a
[GitHub Release](https://github.com/itz4blitz/followcast/releases).

Needs Node 20+ and `grim` + `python-gobject` + `gtk4`.

```bash
pacman -S grim python-gobject gtk4
gh release download --repo itz4blitz/followcast --pattern 'followcast-*.tgz'
npm install -g ./followcast-*.tgz
```

`npm install -g` puts `followcast` on your PATH. The unreleased tree in this
checkout paints a GTK4 window from `grim` captures of the focused output.

Add the source rule to `~/.config/hypr/hyprland.lua`:

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

Muted apps paint the **Hidden by Followcast** page inside that same
window. Do not add a second Followcast Privacy window rule.

Then `hyprctl reload`.

Run it at login so the **Followcast** window is already in the share picker:

```lua
-- ~/.config/hypr/autostart.lua
o.exec_on_start("sh -c 'sleep 1 && hyprctl output create headless fc-dummy'")
o.exec_on_start("sh -c 'sleep 2 && followcast'")
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
3. Change focus as usual. The share follows the focused display only if that
   monitor and app are on in the policy. Crossing monitors plays a short
   direct cut to the new display. When an app is muted, the same window shows
   the **Hidden by Followcast** card.
4. Mute a monitor or app:

```bash
followcast policy set-monitor HDMI-A-1 off
followcast policy set-app slack off
followcast status
```

On Omarchy, copy `omarchy-plugin/` to `~/.config/omarchy/plugins/blitz.followcast`
and add `blitz.followcast` to the bar in `~/.config/omarchy/shell.json`. The chip
calls `followcast status` / `followcast policy`.

You should not see a Followcast app window. The dummy is mapped on the
headless `fc-dummy` output so Discord can capture it without exposing it on
your desktop. When something is muted, the same dummy shows the **Hidden by
Followcast** page; the bar chip is the control.

## Policy

Default is on (shareable). Stored at `$XDG_CONFIG_HOME/followcast/policy.json`
(or `~/.config/followcast/policy.json`).

App identity is the Hyprland window class. Browser tabs in one window are one
app. Hyprland group members are separate apps.

## Develop

```bash
npm install
npm run build
npm link
npm test
npm run coverage
npm run mutation
npm run ci
```

## License

Apache-2.0
