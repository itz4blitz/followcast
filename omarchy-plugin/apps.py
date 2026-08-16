#!/usr/bin/env python3
"""Index XDG desktop entries so Followcast can show app names and icons."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

BROWSER_BINS = {"brave", "chromium", "chrome", "google-chrome", "firefox", "vivaldi", "opera"}
VERSION_SUFFIX = re.compile(r"\s*\([^)]*\d[^)]*\)\s*$")


def desktop_dirs() -> list[Path]:
    dirs: list[Path] = []
    data_home = os.environ.get("XDG_DATA_HOME")
    home = os.environ.get("HOME")
    if data_home:
        dirs.append(Path(data_home) / "applications")
    elif home:
        dirs.append(Path(home) / ".local/share/applications")
    data_dirs = os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share")
    for raw in data_dirs.split(":"):
        if raw:
            dirs.append(Path(raw) / "applications")
    seen: set[str] = set()
    unique: list[Path] = []
    for path in dirs:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def parse_desktop(path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    section = ""
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return fields
    for line in lines:
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if section != "Desktop Entry" or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {"Name", "Icon", "StartupWMClass", "Exec", "NoDisplay", "Hidden"} and key not in fields:
            fields[key] = value.strip()
    return fields


def exec_basename(command: str) -> str:
    token = command.strip()
    if not token:
        return ""
    if token.startswith('"'):
        end = token.find('"', 1)
        token = token[1:end] if end > 0 else token.strip('"')
    else:
        token = token.split()[0]
    return Path(token).name


def clean_name(name: str) -> str:
    return VERSION_SUFFIX.sub("", name).strip() or name


def add_key(
    index: dict[str, dict[str, str | int]],
    key: str,
    name: str,
    icon: str,
    priority: int,
) -> None:
    cleaned = key.strip().lower()
    if cleaned == "":
        return
    current = index.get(cleaned)
    if current is not None and int(current["_p"]) <= priority:
        return
    index[cleaned] = {"name": name, "icon": icon, "_p": priority}


def index_desktops() -> dict[str, dict[str, str]]:
    index: dict[str, dict[str, str]] = {}
    for directory in desktop_dirs():
        if not directory.is_dir():
            continue
        for path in directory.glob("*.desktop"):
            fields = parse_desktop(path)
            if fields.get("NoDisplay") == "true" or fields.get("Hidden") == "true":
                continue
            name = clean_name(fields.get("Name", "").strip())
            if name == "":
                continue
            icon = fields.get("Icon", "").strip()
            desktop_id = path.stem
            add_key(index, desktop_id, name, icon, 0)
            if "." in desktop_id:
                add_key(index, desktop_id.split(".")[-1], name, icon, 2)
            add_key(index, fields.get("StartupWMClass", ""), name, icon, 1)
            add_key(index, icon, name, icon, 3)
            binary = exec_basename(fields.get("Exec", ""))
            if binary.lower() not in BROWSER_BINS:
                add_key(index, binary, name, icon, 4)
            add_key(index, name, name, icon, 5)
    public: dict[str, dict[str, str]] = {}
    for key, value in index.items():
        public[key] = {"name": str(value["name"]), "icon": str(value["icon"])}
    return public


def main() -> None:
    print(json.dumps({"apps": index_desktops()}, separators=(",", ":")))


if __name__ == "__main__":
    main()
