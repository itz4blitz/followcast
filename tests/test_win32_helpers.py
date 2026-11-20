import unittest
from pathlib import Path

from win32_desktop import (
    build_client_snapshot,
    build_monitor_snapshot,
    format_hwnd,
    normalize_device_name,
    process_class_name,
)
from win32_surface import parse_privacy_state, resolve_monitor_rect, runtime_state_path


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


if __name__ == "__main__":
    unittest.main()
