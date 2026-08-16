#!/usr/bin/env python3
"""Layer-shell privacy surface. Not a shareable window. Hidden unless blocked."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_PRELOAD = "/usr/lib/libgtk4-layer-shell.so"
if os.path.isfile(_PRELOAD):
    _current = os.environ.get("LD_PRELOAD", "")
    _parts = [part for part in _current.split(":") if part != ""]
    if _PRELOAD not in _parts:
        os.environ["LD_PRELOAD"] = ":".join([_PRELOAD, *_parts])
        os.execv(sys.executable, [sys.executable, *sys.argv])

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("Gtk4LayerShell", "1.0")
from gi.repository import Gdk, GLib, Gtk, Gtk4LayerShell  # noqa: E402

if not Gtk4LayerShell.is_supported():
    sys.stderr.write(
        "followcast: gtk4-layer-shell is not supported; refusing to open a shareable privacy window\n"
    )
    raise SystemExit(1)

WIDTH = 480
HEIGHT = 270
MARGIN = 16


def state_path() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
    return Path(runtime) / "followcast" / "privacy.json"


class PrivacyWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application) -> None:
        super().__init__(application=app, title="Followcast Privacy")
        self.set_default_size(WIDTH, HEIGHT)
        self.set_decorated(False)
        Gtk4LayerShell.init_for_window(self)
        Gtk4LayerShell.set_namespace(self, "followcast-privacy")
        Gtk4LayerShell.set_layer(self, Gtk4LayerShell.Layer.OVERLAY)
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.BOTTOM, True)
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.RIGHT, True)
        Gtk4LayerShell.set_margin(self, Gtk4LayerShell.Edge.BOTTOM, MARGIN)
        Gtk4LayerShell.set_margin(self, Gtk4LayerShell.Edge.RIGHT, MARGIN)
        Gtk4LayerShell.set_keyboard_mode(self, Gtk4LayerShell.KeyboardMode.NONE)
        self._pin_last_monitor()
        self.modes = Gtk.Stack()
        self.modes.set_transition_type(Gtk.StackTransitionType.CROSSFADE)
        self.modes.set_transition_duration(120)
        privacy = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        privacy.set_margin_top(24)
        privacy.set_margin_bottom(24)
        privacy.set_margin_start(24)
        privacy.set_margin_end(24)
        privacy.set_valign(Gtk.Align.CENTER)
        privacy.set_halign(Gtk.Align.CENTER)
        self.kicker = Gtk.Label(label="Hidden by Followcast")
        self.kicker.add_css_class("kicker")
        self.app_name = Gtk.Label(label="Application")
        self.app_name.add_css_class("app")
        self.detail = Gtk.Label(label="This application is off in the Followcast privacy filter.")
        self.detail.add_css_class("detail")
        self.detail.set_wrap(True)
        privacy.append(self.kicker)
        privacy.append(self.app_name)
        privacy.append(self.detail)
        slide = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        slide.set_valign(Gtk.Align.FILL)
        slide.set_hexpand(True)
        self.slide_stack = Gtk.Stack()
        self.slide_stack.set_transition_duration(450)
        self.from_card, self.from_name = self._display_card("Display 1")
        self.to_card, self.to_name = self._display_card("Display 2")
        self.slide_stack.add_named(self.from_card, "from")
        self.slide_stack.add_named(self.to_card, "to")
        slide.append(self.slide_stack)
        self.modes.add_named(privacy, "privacy")
        self.modes.add_named(slide, "slide")
        self.set_child(self.modes)
        self._slide_key = ""
        css = Gtk.CssProvider()
        css.load_from_data(
            b"""
            window { background: #12141a; }
            .kicker { color: #9aa3b5; font-size: 14px; }
            .app { color: #f4f6fb; font-size: 22px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 13px; }
            .display-card { background: #1b1f2a; }
            .display-kicker { color: #8b93a7; font-size: 13px; letter-spacing: 1px; }
            .display-name { color: #f4f6fb; font-size: 36px; font-weight: 650; }
            .display-hint { color: #9aa3b5; font-size: 13px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.set_visible(False)
        GLib.timeout_add(80, self.refresh)

    def _display_card(self, label: str) -> tuple[Gtk.Box, Gtk.Label]:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        box.add_css_class("display-card")
        box.set_valign(Gtk.Align.CENTER)
        box.set_halign(Gtk.Align.CENTER)
        box.set_hexpand(True)
        box.set_vexpand(True)
        kicker = Gtk.Label(label="MOVED DISPLAY")
        kicker.add_css_class("display-kicker")
        name = Gtk.Label(label=label)
        name.add_css_class("display-name")
        hint = Gtk.Label(label="Followcast")
        hint.add_css_class("display-hint")
        box.append(kicker)
        box.append(name)
        box.append(hint)
        return box, name

    def _pin_last_monitor(self) -> None:
        display = Gdk.Display.get_default()
        if display is None:
            return
        monitors = display.get_monitors()
        wanted = last_hypr_connector()
        chosen = None
        for index in range(monitors.get_n_items()):
            monitor = monitors.get_item(index)
            if not isinstance(monitor, Gdk.Monitor):
                continue
            chosen = monitor
            if wanted is not None and monitor.get_connector() == wanted:
                break
        if chosen is not None:
            Gtk4LayerShell.set_monitor(self, chosen)

    def refresh(self) -> bool:
        path = state_path()
        visible = False
        if path.exists():
            try:
                data = json.loads(path.read_text())
            except json.JSONDecodeError:
                return True
            if data.get("visible") and data.get("kind") == "slide":
                self._play_slide(data)
                visible = True
            elif data.get("visible") and data.get("appLabel"):
                self._slide_key = ""
                self.app_name.set_text(str(data["appLabel"]))
                self.modes.set_visible_child_name("privacy")
                visible = True
            else:
                self._slide_key = ""
        else:
            self._slide_key = ""
        self.set_visible(visible)
        return True

    def _play_slide(self, data: dict[str, object]) -> None:
        direction = str(data.get("direction") or "right")
        from_label = str(data.get("fromLabel") or "Display 1")
        to_label = str(data.get("toLabel") or "Display 2")
        key = f"{direction}:{from_label}:{to_label}"
        self.modes.set_visible_child_name("slide")
        if key == self._slide_key:
            return
        self._slide_key = key
        self.from_name.set_text(from_label)
        self.to_name.set_text(to_label)
        transitions = {
            "right": Gtk.StackTransitionType.SLIDE_LEFT,
            "left": Gtk.StackTransitionType.SLIDE_RIGHT,
            "down": Gtk.StackTransitionType.SLIDE_UP,
            "up": Gtk.StackTransitionType.SLIDE_DOWN,
        }
        self.slide_stack.set_transition_type(transitions.get(direction, Gtk.StackTransitionType.SLIDE_LEFT))
        self.slide_stack.set_visible_child_name("from")
        GLib.idle_add(self.slide_stack.set_visible_child_name, "to")


def last_hypr_connector() -> str | None:
    try:
        import subprocess

        raw = subprocess.check_output(["hyprctl", "-j", "monitors"], text=True)
        monitors = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(monitors, list) or len(monitors) == 0:
        return None
    name = monitors[-1].get("name")
    return name if isinstance(name, str) else None


class PrivacyApp(Gtk.Application):
    def __init__(self) -> None:
        super().__init__(application_id="followcast.privacy")
        self.win: PrivacyWindow | None = None

    def do_activate(self) -> None:
        if self.win is None:
            self.win = PrivacyWindow(self)
            self.win.refresh()


if __name__ == "__main__":
    PrivacyApp().run()
