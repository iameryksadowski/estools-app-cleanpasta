#!/usr/bin/env python3
"""check-text.py [PATH...] - report typographic dashes and quotes (only keyboard "-", " and ' are allowed).

Tests that check the conversion of these characters are skipped. Exit code 1 when anything is found.
"""
import pathlib
import sys

CHARS = {chr(c) for c in (0x2013, 0x2014, 0x201E, 0x201C, 0x201D, 0x201F, 0x2018, 0x2019, 0x201A, 0x201B, 0x00AB, 0x00BB, 0x2039, 0x203A)}
SUFFIXES = {".md", ".swift", ".sh", ".py", ".ts", ".json", ".plist", ".html", ".txt", ".svg"}
SKIP_PARTS = {".build", "node_modules", "dist", ".git", "fixtures"}
SKIP_FILES = {"convert.test.ts", "webkit-paste.test.ts", "parity.test.ts", "convert.js"}

paths = [pathlib.Path(a) for a in sys.argv[1:]] or [pathlib.Path(".")]
hits = 0
for root in paths:
    files = [root] if root.is_file() else [f for f in root.rglob("*") if f.is_file() and f.suffix in SUFFIXES]
    for f in files:
        if SKIP_PARTS & set(f.parts) or f.name in SKIP_FILES:
            continue
        for n, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if any(c in line for c in CHARS):
                hits += 1
                print(f"{f}:{n}: {line[:140]}")
print(f"-- {hits} line(s) with typographic dashes or quotes")
sys.exit(1 if hits else 0)
