#!/usr/bin/env python3
"""Always-mapped Followcast privacy surface. Reads $XDG_RUNTIME_DIR/followcast/privacy.json."""

from __future__ import annotations

import json
import os
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
from gi.repository import GLib, Gtk  # noqa: E402


def state_path() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
    return Path(runtime) / "followcast" / "privacy.json"


class PrivacyWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application) -> None:
        super().__init__(application=app, title="Followcast Privacy")
        self.set_default_size(1280, 720)
        self.set_decorated(False)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=16)
        box.set_margin_top(80)
        box.set_margin_bottom(80)
        box.set_margin_start(80)
        box.set_margin_end(80)
        box.set_valign(Gtk.Align.CENTER)
        box.set_halign(Gtk.Align.CENTER)
        self.kicker = Gtk.Label(label="Hidden by Followcast")
        self.kicker.add_css_class("kicker")
        self.app_name = Gtk.Label(label="Application")
        self.app_name.add_css_class("app")
        self.detail = Gtk.Label(
            label="This application is off in the Followcast privacy filter."
        )
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
            .kicker { color: #9aa3b5; font-size: 22px; }
            .app { color: #f4f6fb; font-size: 42px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 18px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        GLib.timeout_add(200, self.refresh)

    def refresh(self) -> bool:
        path = state_path()
        if path.exists():
            try:
                data = json.loads(path.read_text())
            except json.JSONDecodeError:
                return True
            if data.get("visible") and data.get("appLabel"):
                self.app_name.set_text(str(data["appLabel"]))
        return True


class PrivacyApp(Gtk.Application):
    def __init__(self) -> None:
        super().__init__(application_id="followcast.privacy")

    def do_activate(self) -> None:
        win = PrivacyWindow(self)
        win.present()


if __name__ == "__main__":
    PrivacyApp().run()
