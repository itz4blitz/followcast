import unittest
from pathlib import Path

from win32_desktop import (
    build_client_snapshot,
    build_monitor_snapshot,
    format_hwnd,
    friendly_monitor_label,
    normalize_device_name,
    process_class_name,
)
from win32_surface import (
    fit_aspect_rect,
    format_update_prompt,
    is_newer_version,
    load_policy,
    map_cursor_position,
    parse_privacy_state,
    parse_semver,
    policy_file_path,
    resolve_monitor_rect,
    runtime_state_path,
    toggle_paused,
    toggle_policy_app,
    toggle_policy_monitor,
)


class Win32DesktopHelpersTest(unittest.TestCase):
    def test_normalizes_win32_device_name(self) -> None:
        self.assertEqual(normalize_device_name(r"\\.\DISPLAY1"), "DISPLAY1")
        self.assertEqual(normalize_device_name("DISPLAY2"), "DISPLAY2")

    def test_formats_hwnd_as_hex_address(self) -> None:
        self.assertEqual(format_hwnd(0x1A2B), "0x1a2b")

    def test_maps_followcast_surface_and_exe_names_to_class(self) -> None:
        self.assertEqual(
            process_class_name(r"C:\Python313\python.exe", "FollowcastSurface"),
            "followcast.surface",
        )
        self.assertEqual(
            process_class_name(r"C:\Program Files\VSCode\Code.exe", "Chrome_WidgetWin_1"),
            "Code",
        )
        self.assertEqual(process_class_name("", "CabinetWClass"), "CabinetWClass")

    def test_builds_monitor_snapshot_matching_schema(self) -> None:
        snap = build_monitor_snapshot(
            monitor_id=0,
            device_name=r"\\.\DISPLAY1",
            left=0,
            top=0,
            right=2560,
            bottom=1440,
            dpi=120,
            focused=True,
        )
        self.assertEqual(
            snap,
            {
                "id": 0,
                "name": "DISPLAY1",
                "x": 0,
                "y": 0,
                "width": 2560,
                "height": 1440,
                "scale": 1.25,
                "focused": True,
            },
        )

    def test_builds_client_snapshot_matching_schema(self) -> None:
        snap = build_client_snapshot(
            hwnd=0x20,
            class_name="Code",
            title="followcast",
            minimized=False,
            monitor_id=1,
            left=-1920,
            top=0,
            right=0,
            bottom=1080,
        )
        self.assertEqual(
            snap,
            {
                "address": "0x20",
                "class": "Code",
                "title": "followcast",
                "mapped": True,
                "hidden": False,
                "monitor": 1,
                "at": [-1920, 0],
                "size": [1920, 1080],
            },
        )


class Win32SurfaceHelpersTest(unittest.TestCase):
    def test_resolves_runtime_state_path_from_env(self) -> None:
        self.assertEqual(
            runtime_state_path({"XDG_RUNTIME_DIR": "/run/user/1000"}, "/tmp"),
            Path("/run/user/1000") / "followcast" / "privacy.json",
        )
        self.assertEqual(
            runtime_state_path({"LOCALAPPDATA": r"C:\Users\alice\AppData\Local"}, r"C:\Temp"),
            Path(r"C:\Users\alice\AppData\Local") / "followcast" / "privacy.json",
        )
        self.assertEqual(
            runtime_state_path({}, r"C:\Temp"),
            Path(r"C:\Temp") / "followcast" / "privacy.json",
        )

    def test_parses_privacy_state_safely(self) -> None:
        self.assertEqual(
            parse_privacy_state('{"visible": true, "appLabel": "Slack"}'),
            {"visible": True, "appLabel": "Slack"},
        )
        self.assertEqual(parse_privacy_state("{bad"), {})
        self.assertEqual(parse_privacy_state("[]"), {})

    def test_resolves_monitor_rect_by_output_name(self) -> None:
        monitors = [
            {"name": "DISPLAY1", "x": 0, "y": 0, "width": 2560, "height": 1440},
            {"name": "DISPLAY2", "x": 2560, "y": 0, "width": 1920, "height": 1080},
        ]
        self.assertEqual(resolve_monitor_rect(monitors, "DISPLAY2"), (2560, 0, 1920, 1080))
        self.assertIsNone(resolve_monitor_rect(monitors, "MISSING"))

    def test_fits_aspect_ratio_with_letterbox_and_pillarbox(self) -> None:
        # Exact 16:9 match
        self.assertEqual(fit_aspect_rect(1920, 1080, 1280, 720), (0, 0, 1280, 720))
        # Ultrawide 3440x1440 inside 1280x720 -> full width, letterboxed vertically
        x, y, w, h = fit_aspect_rect(3440, 1440, 1280, 720)
        self.assertEqual(x, 0)
        self.assertEqual(w, 1280)
        self.assertEqual(h, 536)
        self.assertEqual(y, 92)
        # Portrait 1080x1920 inside 1280x720 -> full height, pillarboxed horizontally
        x, y, w, h = fit_aspect_rect(1080, 1920, 1280, 720)
        self.assertEqual(y, 0)
        self.assertEqual(h, 720)
        self.assertEqual(w, 405)
        self.assertEqual(x, 437)

    def test_maps_cursor_position_into_scaled_destination_rect(self) -> None:
        mon = (1920, 0, 1920, 1080)
        dst = (0, 0, 1280, 720)
        self.assertEqual(map_cursor_position(1920 + 960, 540, mon, dst), (640, 360))
        self.assertIsNone(map_cursor_position(500, 500, mon, dst))
        self.assertIsNone(map_cursor_position(1920 + 1920, 540, mon, dst))

    def test_formats_friendly_monitor_labels(self) -> None:
        self.assertEqual(
            friendly_monitor_label(r"\\.\DISPLAY2", "Dell U2723QE"),
            "Dell U2723QE (DISPLAY2)",
        )
        self.assertEqual(
            friendly_monitor_label(r"\\.\DISPLAY1", "Generic PnP Monitor"),
            "DISPLAY1",
        )
        self.assertEqual(friendly_monitor_label("DISPLAY1", ""), "DISPLAY1")

    def test_policy_path_and_toggles(self) -> None:
        self.assertEqual(
            policy_file_path({"APPDATA": r"C:\Users\alice\AppData\Roaming"}, Path(r"C:\Users\alice")),
            Path(r"C:\Users\alice\AppData\Roaming") / "followcast" / "policy.json",
        )
        self.assertEqual(
            policy_file_path({"XDG_CONFIG_HOME": "/home/alice/.config"}, Path("/home/alice")),
            Path("/home/alice/.config") / "followcast" / "policy.json",
        )
        base = load_policy("{bad")
        self.assertEqual(base, {"monitors": {}, "apps": {}})
        p1 = toggle_paused(base)
        self.assertTrue(p1["paused"])
        p2 = toggle_paused(p1)
        self.assertNotIn("paused", p2)
        p3 = toggle_policy_monitor(base, "DISPLAY2")
        self.assertFalse(p3["monitors"]["DISPLAY2"])
        p4 = toggle_policy_monitor(p3, "DISPLAY2")
        self.assertTrue(p4["monitors"]["DISPLAY2"])
        p5 = toggle_policy_app(base, "Discord")
        self.assertFalse(p5["apps"]["Discord"])
        p6 = toggle_policy_app(p5, "Discord")
        self.assertTrue(p6["apps"]["Discord"])

    def test_semver_comparison_and_update_prompt(self) -> None:
        self.assertEqual(parse_semver("v0.6.1"), (0, 6, 1))
        self.assertIsNone(parse_semver("bad"))
        self.assertTrue(is_newer_version("0.6.1", "v0.6.2"))
        self.assertFalse(is_newer_version("0.6.2", "v0.6.1"))
        self.assertFalse(is_newer_version("0.6.1", "v0.6.1"))
        self.assertEqual(
            format_update_prompt("v0.7.0"),
            "A new version of Followcast is available (v0.7.0). Would you like to upgrade?",
        )


if __name__ == "__main__":
    unittest.main()
