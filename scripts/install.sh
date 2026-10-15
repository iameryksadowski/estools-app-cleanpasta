#!/bin/sh
# ES Tools Cleanpasta installer: puts the latest version into Applications and opens it.
#   curl -fsSL https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/install.sh | sh
set -eu
URL="https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/Cleanpasta.zip"
DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
TMP="$(mktemp -d)"
echo "Downloading Cleanpasta..."
curl -fsSL "$URL" -o "$TMP/Cleanpasta.zip"
ditto -x -k "$TMP/Cleanpasta.zip" "$TMP"
osascript -e 'tell application id "com.eryksadowski.estools.cleanpaste" to quit' >/dev/null 2>&1 || true
rm -rf "$DEST/Cleanpasta.app"
ditto "$TMP/Cleanpasta.app" "$DEST/Cleanpasta.app"
rm -rf "$TMP"
open "$DEST/Cleanpasta.app"
echo "Cleanpasta is in $DEST and open - look for its icon in the menu bar."
echo "Gotowe: Cleanpasta jest w folderze $DEST i dziala - ikona jest w pasku menu u gory ekranu."
