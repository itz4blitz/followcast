#!/usr/bin/env python3
"""Followcast share surface. Off-screen dummy Discord captures. Not a desktop overlay."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time
from queue import Queue
from pathlib import Path

from capture_argv import (
    destination_output,
    grim_live_argv,
    initial_slide_key,
    parse_stream_output,
    stdin_line_iter,
)

import gi

gi.require_version("Gdk", "4.0")
gi.require_version("GdkWayland", "4.0")
gi.require_version("Gtk", "4.0")
gi.require_version("Graphene", "1.0")
from gi.repository import Gdk, GdkWayland, GLib, Graphene, Gtk  # noqa: E402

WIDTH = 1280
HEIGHT = 720


def state_path() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/tmp")
    return Path(runtime) / "followcast" / "privacy.json"


def shot_view() -> Gtk.Picture:
    picture = Gtk.Picture()
    picture.set_hexpand(True)
    picture.set_vexpand(True)
    picture.set_can_shrink(True)
    picture.set_content_fit(Gtk.ContentFit.FILL)
    picture.set_size_request(WIDTH, HEIGHT)
    return picture


def show_texture(picture: Gtk.Picture, texture: Gdk.Texture) -> None:
    picture.set_content_fit(Gtk.ContentFit.FILL)
    picture.set_paintable(texture)


class FollowcastWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application) -> None:
        super().__init__(application=app, title=os.environ.get("FOLLOWCAST_TITLE", "Followcast"))
        self.set_default_size(WIDTH, HEIGHT)
        self.set_decorated(False)
        self.output: str | None = None
        self._slide_key = initial_slide_key()
        self._clock_held = False
        self._frame_n = 0
        self._capture_output: str | None = None
        self._capture_lock = threading.Lock()
        self._frames: Queue[bytes] = Queue(maxsize=2)
        self.live = shot_view()
        privacy = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        privacy.set_valign(Gtk.Align.CENTER)
        privacy.set_halign(Gtk.Align.CENTER)
        privacy.add_css_class("fc-live")
        self.kicker = Gtk.Label(label="Hidden by Followcast")
        self.kicker.add_css_class("kicker")
        self.app_name = Gtk.Label(label="Application")
        self.app_name.add_css_class("app")
        self.detail = Gtk.Label(label="This application is off in the Followcast privacy filter.")
        self.detail.add_css_class("detail")
        privacy.append(self.kicker)
        privacy.append(self.app_name)
        privacy.append(self.detail)
        self.privacy = privacy
        self.slide_stack = Gtk.Stack()
        self.slide_stack.set_transition_duration(450)
        self.slide_stack.set_hexpand(True)
        self.slide_stack.set_vexpand(True)
        self.slide_stack.add_css_class("fc-live")
        self.from_shot = shot_view()
        self.to_shot = shot_view()
        self.slide_stack.add_named(self.from_shot, "from")
        self.slide_stack.add_named(self.to_shot, "to")
        self.set_child(self.live)
        css = Gtk.CssProvider()
        # Undecorated Gtk.Window CSS does not paint on Hyprland.
        css.load_from_data(
            b"""
            .fc-live { background: #12141a; }
            .kicker { color: #9aa3b5; font-size: 18px; }
            .app { color: #f4f6fb; font-size: 36px; font-weight: 600; }
            .detail { color: #c5cddb; font-size: 16px; }
            """
        )
        Gtk.StyleContext.add_provider_for_display(
            self.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.present()
        self.connect("close-request", self._refuse_close)
        self.add_tick_callback(self._on_frame)
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR1, self._dump_canvas)
        GLib.idle_add(self._hold_frame_clock)
        GLib.timeout_add(80, self.tick)
        threading.Thread(target=self._read_stdin, daemon=True).start()
        threading.Thread(target=self._capture_loop, daemon=True).start()

    def _refuse_close(self, _window: Gtk.Window) -> bool:
        return True

    def _read_stdin(self) -> None:
        for raw in stdin_line_iter(sys.stdin.fileno()):
            output = parse_stream_output(raw)
            if output is None:
                continue
            GLib.idle_add(self._set_output, output)

    def _set_output(self, output: str) -> bool:
        with self._capture_lock:
            self.output = output
            self._capture_output = output
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
            self._kick_render()
            return True
        if data.get("visible") and data.get("appLabel"):
            self._slide_key = ""
            self.app_name.set_text(str(data["appLabel"]))
            self.set_child(self.privacy)
            self._kick_render()
            return True
        self._slide_key = ""
        self.set_child(self.live)
        self._kick_render()
        return True

    def _play_slide(self, data: dict[str, object]) -> None:
        to_output = str(data.get("toOutput") or "")
        key = f"feed:{to_output}"
        if key == self._slide_key:
            return
        if to_output == "":
            return
        dest = destination_output(data)
        if dest is not None:
            self.output = dest
        self._slide_key = key
        self.set_child(self.live)

    def _grab(self) -> None:
        if self.output is None:
            return
        try:
            png = self._frames.get_nowait()
        except Exception:
            return
        folder = state_path().parent
        self._frame_n += 1
        path = folder / f"live-{self._frame_n % 2}.png"
        try:
            path.write_bytes(png)
        except OSError:
            return
        # Load the texture synchronously before asking Wayland to commit. An
        # asynchronous set_filename can leave the share-picker snapshot blank.
        try:
            texture = Gdk.Texture.new_from_filename(str(path))
        except GLib.Error:
            return
        show_texture(self.live, texture)
        self._kick_render()

    def _capture_loop(self) -> None:
        while True:
            with self._capture_lock:
                output = self._capture_output
            if output is not None:
                try:
                    png = subprocess.check_output(grim_live_argv(output), timeout=1.0)
                    try:
                        self._frames.put_nowait(png)
                    except Exception:
                        try:
                            self._frames.get_nowait()
                            self._frames.put_nowait(png)
                        except Exception:
                            pass
                    GLib.idle_add(self._grab)
                except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
                    pass
            time.sleep(0.08)

    def _hold_frame_clock(self) -> bool:
        # Parked unfocused surfaces stop the GTK frame clock, so queue_draw never commits.
        if self._clock_held:
            return False
        clock = self.get_frame_clock()
        if clock is None:
            return True
        clock.begin_updating()
        self._clock_held = True
        return False

    def _on_frame(self, _widget: Gtk.Widget, _clock: Gdk.FrameClock) -> bool:
        self._commit_surface()
        return True

    def _commit_surface(self) -> None:
        native = self.get_native()
        if native is None:
            return
        surface = native.get_surface()
        if surface is None:
            return
        surface.queue_render()
        if isinstance(surface, GdkWayland.WaylandSurface):
            surface.force_next_commit()

    def _kick_render(self) -> None:
        self._hold_frame_clock()
        self.live.queue_draw()
        self.queue_draw()
        clock = self.get_frame_clock()
        if clock is not None:
            clock.request_phase(Gdk.FrameClockPhase.PAINT)
        self._commit_surface()

    def _dump_canvas(self) -> bool:
        native = self.get_native()
        width = max(self.live.get_width(), 1)
        height = max(self.live.get_height(), 1)
        shot = self.live.get_paintable()
        note = (
            f"output={self.output} clock={self._clock_held} "
            f"win={self.get_width()}x{self.get_height()} "
            f"live={width}x{height} shot={shot is not None} "
            f"surface={native.get_surface() is not None if native is not None else False}\n"
        )
        try:
            Path("/tmp/fc-widget.txt").write_text(note)
        except OSError:
            pass
        if isinstance(shot, Gdk.Texture):
            try:
                shot.save_to_png("/tmp/fc-shot.png")
            except GLib.Error:
                pass
        if native is None:
            return True
        renderer = native.get_renderer()
        snapshot = Gtk.Snapshot()
        Gtk.WidgetPaintable.new(self).snapshot(snapshot, float(width), float(height))
        node = snapshot.to_node()
        if node is None or renderer is None:
            try:
                Path("/tmp/fc-widget.txt").write_text(note + "no-node\n")
            except OSError:
                pass
            return True
        try:
            rendered = renderer.render_texture(node, None)
            rendered.save_to_png("/tmp/fc-widget.png")
        except GLib.Error as error:
            try:
                Path("/tmp/fc-widget.txt").write_text(note + f"render {error}\n")
            except OSError:
                pass
        return True

    def _grab_output(self, output: str) -> Gdk.Texture | None:
        path = self._grab_to_file(output)
        if path is None:
            return None
        try:
            return Gdk.Texture.new_from_filename(str(path))
        except GLib.Error:
            return None

    def _grab_to_file(self, output: str) -> Path | None:
        folder = state_path().parent
        self._frame_n += 1
        path = folder / f"live-{self._frame_n % 2}.png"
        try:
            folder.mkdir(parents=True, exist_ok=True)
            png = subprocess.check_output(grim_live_argv(output), timeout=2.0)
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None
        try:
            path.write_bytes(png)
            Path("/tmp/fc-live-grim.png").write_bytes(png)
        except OSError:
            return None
        return path


class FollowcastApp(Gtk.Application):
    def __init__(self) -> None:
        super().__init__(application_id="followcast.surface")
        self.win: FollowcastWindow | None = None

    def do_activate(self) -> None:
        if self.win is None:
            self.win = FollowcastWindow(self)


if __name__ == "__main__":
    FollowcastApp().run()
