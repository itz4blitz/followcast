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

You should not see Followcast on your monitors. Both the dummy window and
the privacy card live on a hidden special workspace. The audience sees
them when you pick **Followcast** in the share picker. The bar chip is
the only on-screen control.

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
