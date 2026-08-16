# Followcast Privacy Switchboard

Approved: the audience still sees the Followcast window. That window follows
the focused app only when **its monitor and its application are both on**.
Otherwise it shows a blurred privacy card branded **Followcast**.

## Audience view

| Focused thing                    | Monitor | App | Audience sees                              |
| -------------------------------- | ------- | --- | ------------------------------------------ |
| Allowed window                   | on      | on  | That window only (current crop)            |
| Denied window / tab-group member | on      | off | Privacy card                               |
| Any window on a muted monitor    | off     | *   | Privacy card                               |
| Followcast / privacy surface     | *       | *   | Hold last allowed or card (do not recurse) |

Browser tabs inside one window are one application. Hyprland group members
are separate applications and are gated individually.

## Policy

Default is **on** (shareable). Missing keys stay on.

```json
{
  "monitors": { "HDMI-A-1": false },
  "apps": { "slack": false, "1Password": false }
}
```

Stored at `$XDG_CONFIG_HOME/followcast/policy.json`. The daemon reloads it
on every geometry tick. The bar writes it through `followcast policy …`.

App identity is Hyprland `class` (stable across windows of that app).

## Privacy card

A mapped toplevel titled `Followcast Privacy` (class `followcast-privacy`).
Copy:

- Hidden by **Followcast**
- `<app title or class>`
- “This application is off in the Followcast privacy filter.”

The daemon retargets `wl-mirror` to that window’s region. The card file
updates when the blocked app changes so the name stays current.

## Bar

Omarchy bar plugin `followcast`.

- Chip: Followcast + live / hidden
- Panel: every monitor with an on/off switch
- Under an enabled monitor: every application currently on it, on/off
- Calls `followcast policy` / `followcast policy set-monitor` /
  `followcast policy set-app`

## CLI

```
followcast
followcast policy
followcast policy set-monitor <name> on|off
followcast policy set-app <class> on|off
followcast status
```

`--deny-class` still works and is treated as app-off (privacy card), not hold.

## Non-goals

- Blurring a denied app in-place on a full-monitor share
- Per-browser-tab gating
- Changing xdg-desktop-portal
