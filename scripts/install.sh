#!/bin/sh
# ES Tools Cleanpasta installer: puts the latest version into Applications and opens it.
#   curl -fsSL https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/install.sh | sh
set -eu
URL="https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/Cleanpasta.zip"
DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
trap 'exit 1' HUP INT TERM
echo "Downloading Cleanpasta..."
curl -fsSL "$URL" -o "$TMP/Cleanpasta.zip"
ditto -x -k "$TMP/Cleanpasta.zip" "$TMP"
# Validate the unpacked bundle before stopping or replacing the installed app.
[ -x "$TMP/Cleanpasta.app/Contents/MacOS/CleanpastaApp" ] &&
  [ -x "$TMP/Cleanpasta.app/Contents/Helpers/cleanpasta" ] &&
  [ -s "$TMP/Cleanpasta.app/Contents/Info.plist" ] || {
    echo "Downloaded archive does not contain a complete Cleanpasta.app" >&2
    exit 1
  }
codesign --verify --deep --strict "$TMP/Cleanpasta.app"
# Stage on the destination volume before touching the installed version.
STAGE="$(mktemp -d "$DEST/.cleanpasta.XXXXXX")"
BACKUP="$STAGE/previous.app"
rollback() {
  if [ -d "$BACKUP" ] && [ ! -e "$DEST/Cleanpasta.app" ]; then
    mv "$BACKUP" "$DEST/Cleanpasta.app" || {
      echo "Could not restore the previous app. Backup kept at $BACKUP" >&2
      rm -rf "$TMP"
      return 1
    }
  fi
  rm -rf "$STAGE" "$TMP"
}
trap rollback EXIT
ditto "$TMP/Cleanpasta.app" "$STAGE/Cleanpasta.app"
osascript -e 'tell application id "com.eryksadowski.estools.cleanpaste" to quit' >/dev/null 2>&1 || true
if [ -e "$DEST/Cleanpasta.app" ]; then
  mv "$DEST/Cleanpasta.app" "$BACKUP"
fi
mv "$STAGE/Cleanpasta.app" "$DEST/Cleanpasta.app"
open "$DEST/Cleanpasta.app"
echo "Cleanpasta is in $DEST and open - look for its icon in the menu bar."
echo "Gotowe: Cleanpasta jest w folderze $DEST i dziala - ikona jest w pasku menu u gory ekranu."
