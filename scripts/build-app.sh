#!/bin/sh
# Builds dist/Cleanpasta.app (menu bar app + cleanpasta CLI + Sparkle), signs it, and
# packs dist/Cleanpasta-VERSION.zip and dist/Cleanpasta-VERSION.dmg.
# Signing: the "ES Tools Code Signing" certificate when it is in the keychain
# (scripts/setup-signing.sh), otherwise ad-hoc.
set -eu
cd "$(dirname "$0")/.."
# VERSION, BUILD and DIST can be overridden (e.g. a local update test)
VERSION="${VERSION:-$(sed -n 's/^## \[\([0-9][0-9.]*\)\].*/\1/p' CHANGELOG.md | head -1)}"
BUILD="${BUILD:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}"
DIST="${DIST:-dist}"
[ -n "$VERSION" ] || { echo "No version in CHANGELOG.md" >&2; exit 1; }
APP="$DIST/Cleanpasta.app"
IDENTITY="ES Tools Code Signing"
security find-certificate -c "$IDENTITY" >/dev/null 2>&1 || IDENTITY="-"
PUBLIC_KEY="$(cat Resources/sparkle-public-key.txt 2>/dev/null || true)"

echo "Building Cleanpasta $VERSION ($BUILD)"
# Universal binaries (Apple silicon + Intel): build both slices and join them.
# Each slice gets its own build folder: SPM cannot switch triples in one.
for arch in arm64 x86_64; do
  swift build -c release --triple $arch-apple-macosx14.0 --build-path .build/$arch >/dev/null 2>&1 || {
    swift build -c release --triple $arch-apple-macosx14.0 --build-path .build/$arch 2>&1 | grep -E "error" | grep -v PlatformPath >&2
    exit 1
  }
done
BIN="$(mktemp -d)"
for tool in CleanpastaApp cleanpasta; do
  lipo -create .build/arm64/release/$tool .build/x86_64/release/$tool -output "$BIN/$tool"
done

rm -rf "$APP"
mkdir -p "$DIST"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Helpers" "$APP/Contents/Frameworks"
cp "$BIN/CleanpastaApp" "$APP/Contents/MacOS/CleanpastaApp"
cp "$BIN/cleanpasta" "$APP/Contents/Helpers/cleanpasta"
cp Resources/convert.js Resources/AppIcon.icns Resources/AppIcon-dark.png Resources/MenuBarIcon.png Resources/MenuBarIcon@2x.png Resources/estools-wordmark-dark.png Resources/estools-wordmark-light.png Resources/SadowskiWordmark-white.png "$APP/Contents/Resources/"
sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD/" -e "s|__SU_PUBLIC_ED_KEY__|$PUBLIC_KEY|" Resources/Info.plist > "$APP/Contents/Info.plist"
if [ -z "$PUBLIC_KEY" ]; then
  # no update key yet: leave the updater off in this build
  /usr/libexec/PlistBuddy -c "Delete :SUPublicEDKey" -c "Delete :SUFeedURL" "$APP/Contents/Info.plist"
fi
SPARKLE="$(find .build/arm64/artifacts -path '*macos-arm64_x86_64/Sparkle.framework' -maxdepth 6 | head -1)"
ditto "$SPARKLE" "$APP/Contents/Frameworks/Sparkle.framework"
# Not sandboxed: Sparkle's XPC services are not needed.
rm -rf "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/XPCServices" "$APP/Contents/Frameworks/Sparkle.framework/XPCServices"

sign() { codesign --force --timestamp=none --sign "$IDENTITY" "$@"; }
sign "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app"
sign "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/Autoupdate"
sign "$APP/Contents/Frameworks/Sparkle.framework"
sign --identifier com.eryksadowski.estools.cleanpaste.cli "$APP/Contents/Helpers/cleanpasta"
sign "$APP"
codesign --verify --deep --strict "$APP"
echo "Signed with: $IDENTITY"

ZIP="$DIST/Cleanpasta-$VERSION.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

DMG="$DIST/Cleanpasta-$VERSION.dmg"
STAGE="$(mktemp -d)/Cleanpasta"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Cleanpasta.app"
ln -s /Applications "$STAGE/Applications"
cp "docs/guide/Cleanpasta-instalacja.pdf" "$STAGE/Jak zainstalować.pdf" 2>/dev/null || cp docs/instalacja.md "$STAGE/Jak zainstalowac.txt"
rm -f "$DMG"
hdiutil create -quiet -volname "Cleanpasta $VERSION" -srcfolder "$STAGE" -format UDZO -ov "$DMG"
# A build lying around must not take over cleanpasta:// links from the installed app.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$APP" 2>/dev/null || true
echo "$APP"
echo "$ZIP"
echo "$DMG"
