#!/usr/bin/env python3
"""Report whether a meeting app is consuming a PipeWire video share."""

from __future__ import annotations

import json
import subprocess
import sys

CONSUMERS = (
    "brave",
    "chromium",
    "chrome",
    "firefox",
    "discord",
    "zoom",
    "slack",
    "meet",
    "xdg-desktop-portal",
    "screencast",
    "wl-mirror",
)


def props_of(obj: object) -> dict[str, object]:
    if not isinstance(obj, dict):
        return {}
    info = obj.get("info")
    if not isinstance(info, dict):
        return {}
    props = info.get("props")
    return props if isinstance(props, dict) else {}


def blob(props: dict[str, object]) -> str:
    parts: list[str] = []
    for key in (
        "application.name",
        "application.process.binary",
        "node.name",
        "node.description",
        "media.class",
    ):
        value = props.get(key)
        if isinstance(value, str):
            parts.append(value.lower())
    return " ".join(parts)


def is_video(props: dict[str, object]) -> bool:
    media = props.get("media.class")
    if not isinstance(media, str):
        return False
    return "video" in media.lower()


def is_consumer(props: dict[str, object]) -> bool:
    text = blob(props)
    return any(token in text for token in CONSUMERS)


def main() -> int:
    try:
        raw = subprocess.check_output(["pw-dump"], text=True)
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError, subprocess.CalledProcessError):
        print(json.dumps({"sharing": False}))
        return 0
    if not isinstance(data, list):
        print(json.dumps({"sharing": False}))
        return 0

    nodes: dict[int, dict[str, object]] = {}
    for obj in data:
        if not isinstance(obj, dict):
            continue
        kind = obj.get("type")
        if not isinstance(kind, str) or not kind.endswith("Node"):
            continue
        ident = obj.get("id")
        if isinstance(ident, int):
            nodes[ident] = props_of(obj)

    sharing = False
    for obj in data:
        if not isinstance(obj, dict):
            continue
        kind = obj.get("type")
        if not isinstance(kind, str) or not kind.endswith("Link"):
            continue
        info = obj.get("info")
        if not isinstance(info, dict):
            continue
        out_id = info.get("output-node-id")
        in_id = info.get("input-node-id")
        if not isinstance(out_id, int) or not isinstance(in_id, int):
            continue
        src = nodes.get(out_id)
        dst = nodes.get(in_id)
        if src is None or dst is None:
            continue
        if (is_video(src) or is_video(dst)) and (is_consumer(src) or is_consumer(dst)):
            sharing = True
            break

    print(json.dumps({"sharing": sharing}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
