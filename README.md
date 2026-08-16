# Followcast

Share **one** window in Meet, Zoom, or Discord. Followcast always shows the
Hyprland app that has keyboard focus, including when that app is on another
monitor.

The portal cannot retarget a live share. Followcast is the dummy window you pick
once. A daemon retargets [`wl-mirror`](https://github.com/Ferdi265/wl-mirror)
to the focused window's slurp region.

Muted monitors or apps show the audience a branded **Hidden by Followcast**
card instead of the real window.

## Install

```bash
pacman -S wl-mirror python-gobject gtk4
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

o.window({ title = "^Followcast$" }, {
  float = true,
  no_initial_focus = true,
  no_focus = true,
  no_follow_mouse = true,
  size = { 1280, 720 },
})

-- Keep the privacy card off the desktop. wl-mirror still crops it.
o.window({ title = "^Followcast Privacy$" }, {
  float = true,
  workspace = "special:followcast silent",
  no_focus = true,
  no_initial_focus = true,
  no_follow_mouse = true,
  render_unfocused = true,
  size = { 1280, 720 },
})
```

Then `hyprctl reload`.

Start it when you want to share (do not leave it running otherwise):

```bash
followcast
```

Optional skip list for hall-of-mirrors call windows:

```bash
followcast --deny-class zoom --deny-class skype
```

## Use

1. Start Followcast. A window titled **Followcast** appears.
2. In the share picker, open **Windows** and pick **Followcast**.
3. Change focus as usual. The share follows the focused app only if that
   monitor and app are on in the policy.
4. Mute a monitor or app:

```bash
followcast policy set-monitor HDMI-A-1 off
followcast policy set-app slack off
followcast status
```

On Omarchy, copy `omarchy-plugin/` to `~/.config/omarchy/plugins/followcast`
and add `followcast` to the bar in `~/.config/omarchy/shell.json`. The chip
calls `followcast status` / `followcast policy`.

The privacy card is a hidden special-workspace window. You should not see
**Hidden by Followcast** on your desktop. The audience sees it only when a
muted app or monitor is focused.

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

Design: `docs/superpowers/specs/2026-08-16-followcast-design.md`

## License

Apache-2.0
