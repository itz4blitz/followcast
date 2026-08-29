import unittest

from capture_argv import (
    destination_output,
    grim_live_argv,
    initial_slide_key,
    native_pixel_size,
    parse_stream_output,
    stdin_line_iter,
)


class ParseStreamOutputTest(unittest.TestCase):
    def test_reads_an_output_only_stream_line(self) -> None:
        self.assertEqual(parse_stream_output("--output 'HDMI-A-1'"), "HDMI-A-1")

    def test_reads_the_named_output_from_a_slurp_region_line(self) -> None:
        self.assertEqual(
            parse_stream_output("--region '1600,0 1600x900 HDMI-A-1'"),
            "HDMI-A-1",
        )

    def test_ignores_a_global_box_that_would_cover_the_neighbor(self) -> None:
        # DP-1 is 1600 logical px wide; 2560x1440 at 0,0 also covers HDMI + DP-3.
        self.assertEqual(parse_stream_output("--region '0,0 2560x1440 DP-1'"), "DP-1")


class DestinationOutputTest(unittest.TestCase):
    def test_uses_the_slide_destination_so_live_does_not_stay_on_the_old_monitor(self) -> None:
        self.assertEqual(
            destination_output({"kind": "slide", "fromOutput": "DP-1", "toOutput": "HDMI-A-1"}),
            "HDMI-A-1",
        )

    def test_ignores_a_slide_without_a_destination(self) -> None:
        self.assertIsNone(destination_output({"kind": "slide", "fromOutput": "DP-1"}))
        self.assertIsNone(destination_output({"kind": "slide", "toOutput": ""}))


class InitialSlideKeyTest(unittest.TestCase):
    def test_starts_empty_so_the_first_slide_is_not_an_attribute_error(self) -> None:
        self.assertEqual(initial_slide_key(), "")


class StdinLineIterTest(unittest.TestCase):
    def test_yields_a_short_line_without_waiting_for_an_8kb_pipe_buffer(self) -> None:
        import os

        read_fd, write_fd = os.pipe()
        os.write(write_fd, b"--output 'HDMI-A-1'\n")
        os.close(write_fd)
        lines = list(stdin_line_iter(read_fd))
        os.close(read_fd)
        self.assertEqual(lines, ["--output 'HDMI-A-1'\n"])


class NativePixelSizeTest(unittest.TestCase):
    def test_uses_the_wayland_buffer_so_a_1_33_scale_output_is_filled(self) -> None:
        self.assertEqual(native_pixel_size(1707, 960), (1707, 960))

    def test_falls_back_to_the_share_surface_when_the_buffer_is_unknown(self) -> None:
        self.assertEqual(native_pixel_size(0, 0), (1280, 720))


class GrimLiveArgvTest(unittest.TestCase):
    def test_captures_the_named_output_instead_of_a_global_rectangle(self) -> None:
        self.assertEqual(grim_live_argv("DP-1"), ["grim", "-o", "DP-1", "-"])

    def test_never_passes_global_geometry(self) -> None:
        argv = grim_live_argv("HDMI-A-1")
        self.assertNotIn("-g", argv)
        self.assertEqual(argv, ["grim", "-o", "HDMI-A-1", "-"])


if __name__ == "__main__":
    unittest.main()
