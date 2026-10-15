#!/bin/sh
# Bundles the converter (converter/src/convert.ts) into Resources/convert.js for
# JavaScriptCore - the app and the CLI run it from there.
set -eu
cd "$(dirname "$0")/.."
SRC="converter"
ESBUILD="$SRC/node_modules/.bin/esbuild"
[ -x "$ESBUILD" ] || { echo "Run pnpm install in $SRC first" >&2; exit 1; }
REV="$(git rev-parse --short HEAD)"
TMP="$(mktemp -d)"
cat > "$TMP/entry.ts" <<TS
import { cleanContent, cleanMarkdown, markdownBody, DEFAULT_OPTIONS } from "$(cd "$SRC" && pwd)/src/convert.ts";
(globalThis as unknown as { Cleanpasta: unknown }).Cleanpasta = { cleanContent, cleanMarkdown, markdownBody, DEFAULT_OPTIONS };
TS
"$ESBUILD" "$TMP/entry.ts" --bundle --format=iife --platform=browser --target=safari17 \
  --charset=utf8 --legal-comments=none --log-level=warning \
  --banner:js="/* ES Tools Cleanpasta converter - generated from converter/src/convert.ts (repo @$REV) by scripts/build-converter.sh. Do not edit. */" \
  --outfile=Resources/convert.js
rm -rf "$TMP"
echo "Resources/convert.js from converter/src/convert.ts @$REV ($(wc -c < Resources/convert.js | tr -d ' ') bytes)"
