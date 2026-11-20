#!/usr/bin/env sh
# Followcast installer for Linux (x64)
# Usage: curl -fsSL https://raw.githubusercontent.com/itz4blitz/followcast/master/install.sh | sh
set -eu

REPO="itz4blitz/followcast"
ASSET="followcast-linux-x64.tar.gz"
VERSION="${VERSION:-latest}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${INSTALL_DIR:-$DATA_HOME/followcast}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/$REPO/releases/latest/download/$ASSET"
else
  case "$VERSION" in
    v*) TAG="$VERSION" ;;
    *) TAG="v$VERSION" ;;
  esac
  URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
fi

TMP_TAR="$(mktemp)"
trap 'rm -f "$TMP_TAR"' EXIT

echo "Downloading Followcast ($ASSET)..."
curl -fsSL "$URL" -o "$TMP_TAR"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
tar -xzf "$TMP_TAR" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/followcast"
ln -sf "$INSTALL_DIR/followcast" "$BIN_DIR/followcast"

if [ -d "$HOME/.config/omarchy" ] && [ -d "$INSTALL_DIR/omarchy-plugin" ]; then
  PLUGIN_DIR="$HOME/.config/omarchy/plugins/blitz.followcast"
  mkdir -p "$PLUGIN_DIR"
  cp -r "$INSTALL_DIR/omarchy-plugin/"* "$PLUGIN_DIR/"
  echo "Installed Omarchy bar plugin to $PLUGIN_DIR"
fi

echo "Installed Followcast to $INSTALL_DIR"
echo "Linked binary at $BIN_DIR/followcast"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to your PATH to run 'followcast' directly." ;;
esac
