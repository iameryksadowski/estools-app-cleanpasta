import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('audit: unsigned build override never reads the keychain; release refuses ad-hoc signing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-sign-test-'));
  try {
    const security = join(dir, 'security');
    writeFileSync(security, '#!/bin/sh\necho touched >&2\nexit 1\n', { mode: 0o755 });
    const script = readFileSync('scripts/build-app.sh', 'utf8');
    // Exercise only signing preflight. Never build, sign or query a real keychain.
    const preflight = script.slice(script.indexOf('IDENTITY='), script.indexOf('PUBLIC_KEY='));
    const run = (extra: Record<string, string>) => spawnSync('sh', ['-c', 'set -eu\n' + preflight + '\nprintf "%s" "$IDENTITY"'], {
      env: { ...process.env, PATH: dir + ':' + process.env.PATH, CODE_SIGN_IDENTITY: '-', ...extra }, encoding: 'utf8', timeout: 10000,
    });
    const unsigned = run({});
    assert.equal(unsigned.status, 0);
    assert.equal(unsigned.stdout, '-');
    assert.equal(unsigned.stderr, '');
    assert.equal(run({ REQUIRE_SIGNING: '1' }).status, 1);
  } finally { rmSync(dir, { recursive: true }); }
});

test('audit: failed installer extraction preserves the installed app', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-installer-test-'));
  try {
    const dest = join(dir, 'Applications');
    const bin = join(dir, 'bin');
    mkdirSync(join(dest, 'Cleanpasta.app'), { recursive: true });
    writeFileSync(join(dest, 'Cleanpasta.app', 'marker'), 'installed');
    mkdirSync(bin);
    for (const [name, body] of Object.entries({ curl: 'exit 0', ditto: 'exit 0', osascript: 'exit 0', open: 'exit 0' })) {
      writeFileSync(join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    }
    const script = readFileSync('scripts/install.sh', 'utf8').replace('DEST="/Applications"', `DEST="${dest}"`);
    const file = join(dir, 'install.sh');
    writeFileSync(file, script);
    const result = spawnSync('sh', [file], { env: { ...process.env, PATH: bin + ':' + process.env.PATH, TMPDIR: dir }, timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(dest, 'Cleanpasta.app', 'marker')), true);
  } finally { rmSync(dir, { recursive: true }); }
});

test('audit: installer stages before replacement and rolls back a failed final move', () => {
  for (const failure of ['stage', 'move', 'rollback', 'none']) {
    const dir = mkdtempSync(join(tmpdir(), 'cp-installer-transaction-'));
    try {
      const dest = join(dir, 'Applications');
      const bin = join(dir, 'bin');
      mkdirSync(join(dest, 'Cleanpasta.app'), { recursive: true });
      writeFileSync(join(dest, 'Cleanpasta.app', 'marker'), 'old');
      mkdirSync(bin);
      const mocks = {
        curl: 'exit 0', osascript: 'exit 0', open: 'exit 0', codesign: 'exit 0',
        ditto: `if [ "$1" = "-x" ]; then
  mkdir -p "$4/Cleanpasta.app/Contents/MacOS" "$4/Cleanpasta.app/Contents/Helpers"
  printf tool > "$4/Cleanpasta.app/Contents/MacOS/CleanpastaApp"
  printf tool > "$4/Cleanpasta.app/Contents/Helpers/cleanpasta"
  chmod +x "$4/Cleanpasta.app/Contents/MacOS/CleanpastaApp" "$4/Cleanpasta.app/Contents/Helpers/cleanpasta"
  printf plist > "$4/Cleanpasta.app/Contents/Info.plist"
  printf new > "$4/Cleanpasta.app/marker"
else
  [ "$FAIL_INSTALL" != "stage" ] || exit 1
  /bin/cp -R "$1" "$2"
fi`,
        mv: `if [ "$FAIL_INSTALL" = "rollback" ] && [ "$2" = "$INSTALL_DEST/Cleanpasta.app" ]; then exit 1; fi
if [ "$FAIL_INSTALL" = "move" ] && [ "$2" = "$INSTALL_DEST/Cleanpasta.app" ]; then
  case "$1" in */.cleanpasta.*/Cleanpasta.app) exit 1;; esac
fi
exec /bin/mv "$@"`,
      };
      for (const [name, body] of Object.entries(mocks)) {
        writeFileSync(join(bin, name), '#!/bin/sh\nset -eu\n' + body + '\n', { mode: 0o755 });
      }
      const script = readFileSync('scripts/install.sh', 'utf8').replace('DEST="/Applications"', `DEST="${dest}"`);
      const file = join(dir, 'install.sh');
      writeFileSync(file, script);
      const result = spawnSync('sh', [file], { env: { ...process.env, PATH: bin + ':' + process.env.PATH, TMPDIR: dir, FAIL_INSTALL: failure, INSTALL_DEST: dest }, timeout: 10000 });
      if (failure === 'rollback') {
        const stage = readdirSync(dest).find((name) => name.startsWith('.cleanpasta.'));
        assert.ok(stage, 'failed rollback must preserve the backup directory');
        assert.equal(readFileSync(join(dest, stage, 'previous.app', 'marker'), 'utf8'), 'old');
      } else {
        assert.equal(readFileSync(join(dest, 'Cleanpasta.app', 'marker'), 'utf8'), failure === 'none' ? 'new' : 'old', result.stderr?.toString());
      }
      assert.equal(result.status === 0, failure === 'none');
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test('audit: a failed release build reports the original error without retrying', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-build-failure-'));
  try {
    writeFileSync(join(dir, 'swift'), '#!/bin/sh\necho call >> "$CALL_LOG"\necho "fatal: synthetic compiler failure" >&2\nexit 42\n', { mode: 0o755 });
    const script = readFileSync('scripts/build-app.sh', 'utf8');
    const build = script.slice(script.indexOf('# Universal binaries'), script.indexOf('BIN="$(mktemp'));
    const result = spawnSync('sh', ['-c', 'set -eu\n' + build], { env: { ...process.env, PATH: dir + ':' + process.env.PATH, CALL_LOG: join(dir, 'calls') }, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fatal: synthetic compiler failure/);
    assert.equal(readFileSync(join(dir, 'calls'), 'utf8'), 'call\n');
  } finally { rmSync(dir, { recursive: true }); }
});
