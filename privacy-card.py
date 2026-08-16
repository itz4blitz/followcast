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
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        box.set_margin_top(24)
        box.set_margin_bottom(24)
        box.set_margin_start(24)
        box.set_margin_end(24)
        box.set_valign(Gtk.Align.CENTER)
        box.set_halign(Gtk.Align.CENTER)
        self.kicker = Gtk.Label(label="Hidden by Followcast")
        self.kicker.add_css_class("kicker")
        self.app_name = Gtk.Label(label="Application")
        self.app_name.add_css_class("app")
        self.detail = Gtk.Label(label="This application is off in the Followcast privacy filter.")
        self.detail.add_css_class("detail")
        self.detail.set_wrap(True)
        box.append(self.kicker)
        box.append(self.app_name)
        box.append(self.detail)
        self.set_child(box)
        css = Gtk.CssProvider()
        css.load_from_data(
            b"""
            window { background: #16181e; }
            .kicker { color: #9aa3b5; font-size: 14px; }
            .app { color: #f4f6fb; font-size: 22px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 13px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.set_visible(False)
        GLib.timeout_add(200, self.refresh)

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
            if data.get("visible") and data.get("appLabel"):
                self.app_name.set_text(str(data["appLabel"]))
                visible = True
        self.set_visible(visible)
        return True


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
