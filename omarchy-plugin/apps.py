#!/usr/bin/env python3
"""Index XDG desktop entries so Followcast can show app names and icons."""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

BROWSER_BINS = {"brave", "chromium", "chrome", "google-chrome", "firefox", "vivaldi", "opera"}
VERSION_SUFFIX = re.compile(r"\s*\([^)]*\d[^)]*\)\s*$")
NON_SLUG = re.compile(r"[^a-z0-9]+")
DASH_CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png"
DASH_TREE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json"
ALIASES = {
    "brave-desktop": "brave",
    "brave-browser": "brave",
    "spotify-client": "spotify",
    "org.telegram.desktop": "telegram",
    "org.mozilla.thunderbird": "thunderbird",
    "org.mozilla.firefox": "firefox",
    "omarchy-discord": "discord",
}


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


def slugify(value: str) -> str:
    return NON_SLUG.sub("-", value.strip().lower()).strip("-")


def cache_path() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    home = os.environ.get("HOME")
    root = Path(base) if base else Path(home or "/tmp") / ".cache"
    return root / "followcast" / "dashboard-icons.json"


def dashboard_slugs() -> set[str]:
    path = cache_path()
    try:
        if path.exists() and path.stat().st_mtime > time.time() - 86400:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                return {str(item) for item in raw}
    except (OSError, json.JSONDecodeError):
        pass
    try:
        from urllib.request import urlopen

        with urlopen(DASH_TREE, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        png = payload.get("png") if isinstance(payload, dict) else []
        slugs = {
            name[:-4] if name.endswith(".png") else name
            for name in png
            if isinstance(name, str) and not name.endswith("-dark") and not name.endswith("-light")
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(sorted(slugs)), encoding="utf-8")
        return slugs
    except (OSError, json.JSONDecodeError, TimeoutError, ValueError):
        return {
            "brave",
            "telegram",
            "slack",
            "spotify",
            "thunderbird",
            "discord",
            "firefox",
            "1password",
            "code",
        }


def dash_icon(name: str, icon: str, keys: list[str], slugs: set[str]) -> str:
    candidates = [ALIASES.get(slugify(icon), slugify(icon)), slugify(name)]
    for key in keys:
        candidates.append(ALIASES.get(key, key))
        candidates.append(slugify(key))
    for candidate in candidates:
        if candidate in slugs:
            return f"{DASH_CDN}/{candidate}.png"
    return ""


def index_desktops() -> dict[str, dict[str, str]]:
    index: dict[str, dict[str, str | int]] = {}
    slugs = dashboard_slugs()
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
            keys = [desktop_id]
            add_key(index, desktop_id, name, icon, 0)
            if "." in desktop_id:
                tail = desktop_id.split(".")[-1]
                keys.append(tail)
                add_key(index, tail, name, icon, 2)
            wmclass = fields.get("StartupWMClass", "")
            keys.append(wmclass)
            add_key(index, wmclass, name, icon, 1)
            add_key(index, icon, name, icon, 3)
            binary = exec_basename(fields.get("Exec", ""))
            if binary.lower() not in BROWSER_BINS:
                keys.append(binary)
                add_key(index, binary, name, icon, 4)
            keys.append(name)
            add_key(index, name, name, icon, 5)
            dash = dash_icon(name, icon, [key.lower() for key in keys], slugs)
            if dash:
                for key in keys:
                    cleaned = key.strip().lower()
                    if cleaned in index:
                        index[cleaned]["icon"] = dash
    public: dict[str, dict[str, str]] = {}
    for key, value in index.items():
        public[key] = {"name": str(value["name"]), "icon": str(value["icon"])}
    return public


def main() -> None:
    print(json.dumps({"apps": index_desktops()}, separators=(",", ":")))


if __name__ == "__main__":
    main()
