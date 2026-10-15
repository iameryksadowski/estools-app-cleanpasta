#!/bin/sh
# Converter tests (unit + WebKit paste), then the CLI build and JavaScriptCore parity with the TypeScript converter.
set -eu
cd "$(dirname "$0")/.."
swift build --product cleanpaste >/dev/null
(cd converter && node --test "tests/**/*.test.ts")
exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/*.test.ts
