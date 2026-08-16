#!/usr/bin/env python3
"""Followcast share surface. Off-screen dummy Discord captures. Not a desktop overlay."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import Gdk, GdkPixbuf, GLib, Gtk  # noqa: E402

WIDTH = 1280
HEIGHT = 720
REGION_LINE = re.compile(
    r"--region\s+'?(?P<x>-?\d+),(?P<y>-?\d+)\s+(?P<w>\d+)x(?P<h>\d+)(?:\s+(?P<output>\S+?))?'?\s*$"
)


def state_path() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
    return Path(runtime) / "followcast" / "privacy.json"


class FollowcastWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application) -> None:
        super().__init__(application=app, title="Followcast")
        self.set_default_size(WIDTH, HEIGHT)
        self.set_decorated(False)
        self.region: tuple[int, int, int, int] | None = None
        self._slide_key = ""
        self.modes = Gtk.Stack()
        self.live = Gtk.Picture()
        self.live.set_content_fit(Gtk.ContentFit.CONTAIN)
        privacy = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        privacy.set_valign(Gtk.Align.CENTER)
        privacy.set_halign(Gtk.Align.CENTER)
        self.kicker = Gtk.Label(label="Hidden by Followcast")
        self.kicker.add_css_class("kicker")
        self.app_name = Gtk.Label(label="Application")
        self.app_name.add_css_class("app")
        self.detail = Gtk.Label(label="This application is off in the Followcast privacy filter.")
        self.detail.add_css_class("detail")
        privacy.append(self.kicker)
        privacy.append(self.app_name)
        privacy.append(self.detail)
        slide = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.slide_stack = Gtk.Stack()
        self.slide_stack.set_transition_duration(450)
        self.from_card, self.from_name = self._display_card("Display 1")
        self.to_card, self.to_name = self._display_card("Display 2")
        self.slide_stack.add_named(self.from_card, "from")
        self.slide_stack.add_named(self.to_card, "to")
        slide.append(self.slide_stack)
        self.modes.add_named(self.live, "live")
        self.modes.add_named(privacy, "privacy")
        self.modes.add_named(slide, "slide")
        self.set_child(self.modes)
        css = Gtk.CssProvider()
        css.load_from_data(
            b"""
            window { background: #12141a; }
            .kicker { color: #9aa3b5; font-size: 18px; }
            .app { color: #f4f6fb; font-size: 36px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 16px; }
            .display-card { background: #1b1f2a; }
            .display-kicker { color: #8b93a7; font-size: 16px; letter-spacing: 2px; }
            .display-name { color: #f4f6fb; font-size: 64px; font-weight: 650; }
            .display-hint { color: #9aa3b5; font-size: 18px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.present()
        GLib.timeout_add(80, self.tick)
        threading.Thread(target=self._read_stdin, daemon=True).start()

    def _display_card(self, label: str) -> tuple[Gtk.Box, Gtk.Label]:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
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

    def _read_stdin(self) -> None:
        for raw in sys.stdin:
            match = REGION_LINE.search(raw.strip())
            if match is None:
                continue
            region = (
                int(match.group("x")),
                int(match.group("y")),
                int(match.group("w")),
                int(match.group("h")),
            )
            GLib.idle_add(self._set_region, region)

    def _set_region(self, region: tuple[int, int, int, int]) -> bool:
        self.region = region
        return False

    def tick(self) -> bool:
        path = state_path()
        data: dict[str, object] = {}
        if path.exists():
            try:
                parsed = json.loads(path.read_text())
            except json.JSONDecodeError:
                parsed = {}
            if isinstance(parsed, dict):
                data = parsed
        if data.get("visible") and data.get("kind") == "slide":
            self._play_slide(data)
            return True
        if data.get("visible") and data.get("appLabel"):
            self._slide_key = ""
            self.app_name.set_text(str(data["appLabel"]))
            self.modes.set_visible_child_name("privacy")
            return True
        self._slide_key = ""
        self.modes.set_visible_child_name("live")
        self._grab()
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
        self.slide_stack.set_transition_type(
            transitions.get(direction, Gtk.StackTransitionType.SLIDE_LEFT)
        )
        self.slide_stack.set_visible_child_name("from")
        GLib.idle_add(self.slide_stack.set_visible_child_name, "to")

    def _grab(self) -> None:
        if self.region is None:
            return
        x, y, width, height = self.region
        try:
            png = subprocess.check_output(
                ["grim", "-g", f"{x},{y} {width}x{height}", "-"],
                timeout=0.4,
            )
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return
        loader = GdkPixbuf.PixbufLoader.new_with_type("png")
        try:
            loader.write(png)
            loader.close()
        except GLib.Error:
            return
        pixbuf = loader.get_pixbuf()
        if pixbuf is not None:
            texture = Gdk.Texture.new_for_pixbuf(pixbuf)
            self.live.set_paintable(texture)


class FollowcastApp(Gtk.Application):
    def __init__(self) -> None:
        super().__init__(application_id="followcast.surface")
        self.win: FollowcastWindow | None = None

    def do_activate(self) -> None:
        if self.win is None:
            self.win = FollowcastWindow(self)


if __name__ == "__main__":
    FollowcastApp().run()
