#!/usr/bin/env python3
"""Followcast share surface. Off-screen dummy Discord captures. Not a desktop overlay."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from pathlib import Path

from capture_argv import destination_output, grim_live_argv, parse_stream_output

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import GdkPixbuf, GLib, Gtk  # noqa: E402

WIDTH = 1280
HEIGHT = 720


def state_path() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
    return Path(runtime) / "followcast" / "privacy.json"


class FollowcastWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application) -> None:
        super().__init__(application=app, title="Followcast")
        self.set_default_size(WIDTH, HEIGHT)
        self.set_size_request(WIDTH, HEIGHT)
        self.set_decorated(False)
        self.output: str | None = None
        self._slide_key = ""
        self.modes = Gtk.Stack()
        self.live = Gtk.Picture()
        self.live.set_content_fit(Gtk.ContentFit.FILL)
        self.live.set_can_shrink(True)
        self.live.set_hexpand(True)
        self.live.set_vexpand(True)
        self.live.set_size_request(WIDTH, HEIGHT)
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
        self.modes.set_hexpand(True)
        self.modes.set_vexpand(True)
        self.modes.set_size_request(WIDTH, HEIGHT)
        self.slide_stack = Gtk.Stack()
        self.slide_stack.set_transition_duration(450)
        self.slide_stack.set_hexpand(True)
        self.slide_stack.set_vexpand(True)
        self.from_shot = self._slide_page()
        self.to_shot = self._slide_page()
        self.slide_stack.add_named(self.from_shot, "from")
        self.slide_stack.add_named(self.to_shot, "to")
        self.modes.add_named(self.live, "live")
        self.modes.add_named(privacy, "privacy")
        self.modes.add_named(self.slide_stack, "slide")
        self.set_child(self.modes)
        css = Gtk.CssProvider()
        css.load_from_data(
            b"""
            window { background: #12141a; }
            .kicker { color: #9aa3b5; font-size: 18px; }
            .app { color: #f4f6fb; font-size: 36px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 16px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.present()
        GLib.timeout_add(80, self.tick)
        threading.Thread(target=self._read_stdin, daemon=True).start()

    def _slide_page(self) -> Gtk.Picture:
        picture = Gtk.Picture()
        picture.set_content_fit(Gtk.ContentFit.FILL)
        picture.set_can_shrink(True)
        picture.set_hexpand(True)
        picture.set_vexpand(True)
        picture.set_size_request(WIDTH, HEIGHT)
        return picture

    def _read_stdin(self) -> None:
        for raw in sys.stdin:
            output = parse_stream_output(raw)
            if output is None:
                continue
            GLib.idle_add(self._set_output, output)

    def _set_output(self, output: str) -> bool:
        self.output = output
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
        from_output = str(data.get("fromOutput") or "")
        to_output = str(data.get("toOutput") or "")
        key = f"{direction}:{from_output}:{to_output}"
        if key == self._slide_key:
            self.modes.set_visible_child_name("slide")
            return
        if from_output == "" or to_output == "":
            return
        dest = destination_output(data)
        if dest is not None:
            self.output = dest
        from_pix = self._grab_output(from_output)
        to_pix = self._grab_output(to_output)
        if from_pix is None or to_pix is None:
            return
        self._slide_key = key
        self.from_shot.set_pixbuf(from_pix)
        self.to_shot.set_pixbuf(to_pix)
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
        self.modes.set_visible_child_name("slide")
        GLib.idle_add(self.slide_stack.set_visible_child_name, "to")

    def _grab(self) -> None:
        if self.output is None:
            return
        pixbuf = self._grab_output(self.output)
        if pixbuf is not None:
            self.live.set_pixbuf(pixbuf)

    def _grab_output(self, output: str) -> GdkPixbuf.Pixbuf | None:
        return self._png_to_pixbuf(grim_live_argv(output))

    def _png_to_pixbuf(self, argv: list[str]) -> GdkPixbuf.Pixbuf | None:
        try:
            png = subprocess.check_output(argv, timeout=0.5)
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None
        loader = GdkPixbuf.PixbufLoader.new_with_type("png")
        try:
            loader.write(png)
            loader.close()
        except GLib.Error:
            return None
        pixbuf = loader.get_pixbuf()
        if pixbuf is None:
            return None
        if pixbuf.get_width() != WIDTH or pixbuf.get_height() != HEIGHT:
            pixbuf = pixbuf.scale_simple(WIDTH, HEIGHT, GdkPixbuf.InterpType.BILINEAR)
        if pixbuf is None:
            return None
        self.queue_draw()
        return pixbuf


class FollowcastApp(Gtk.Application):
    def __init__(self) -> None:
        super().__init__(application_id="followcast.surface")
        self.win: FollowcastWindow | None = None

    def do_activate(self) -> None:
        if self.win is None:
            self.win = FollowcastWindow(self)


if __name__ == "__main__":
    FollowcastApp().run()
