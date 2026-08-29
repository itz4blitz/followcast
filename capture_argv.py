"""Build grim argv. Global -g boxes span neighboring outputs on this layout."""

from __future__ import annotations

import re

REGION_LINE = re.compile(
    r"--region\s+'?(?P<x>-?\d+),(?P<y>-?\d+)\s+(?P<w>\d+)x(?P<h>\d+)(?:\s+(?P<output>\S+?))?'?\s*$"
)
OUTPUT_LINE = re.compile(r"--output\s+'?(?P<output>\S+?)'?\s*$")


def parse_stream_output(line: str) -> str | None:
    stripped = line.strip()
    named = OUTPUT_LINE.search(stripped)
    if named is not None:
        output = named.group("output")
        if output is not None and output != "":
            return output
    match = REGION_LINE.search(stripped)
    if match is None:
        return None
    output = match.group("output")
    if output is None or output == "":
        return None
    return output


def destination_output(slide: dict[str, object]) -> str | None:
    to_output = slide.get("toOutput")
    if not isinstance(to_output, str) or to_output == "":
        return None
    return to_output


def initial_slide_key() -> str:
    return ""


def stdin_line_iter(fd: int):
    """Read stdin line-buffered. A pipe's default 8KiB block buffer would stall retargets."""
    import os

    with os.fdopen(fd, "r", buffering=1, closefd=False) as handle:
        while True:
            line = handle.readline()
            if line == "":
                return
            yield line


def native_pixel_size(surface_width: int, surface_height: int) -> tuple[int, int]:
    """Scale grim into the Wayland buffer so GDK_SCALE=1 cannot leave a neighbor strip."""
    if surface_width < 1 or surface_height < 1:
        return (1280, 720)
    return (surface_width, surface_height)


def grim_live_argv(output: str) -> list[str]:
    return ["grim", "-o", output, "-"]
