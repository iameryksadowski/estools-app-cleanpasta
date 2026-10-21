import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const bin = join(root, '.build/debug/cleanpasta');
const run = (args: string[], input: string | Buffer = '') => spawnSync(bin, args, {
  input, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, CLEANPASTA_CONVERTER: join(root, 'Resources/convert.js') },
});

test('audit CLI: help, version, usage and empty input exit codes', () => {
  assert.match(run(['--help']).stdout, /Exit codes: 0 done, 1 usage or read error, 2 nothing to clean, 3/);
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['--version']).stdout.trim(), '1.1.1');
  for (const args of [['--unknown'], ['--print', 'xml'], ['--font-size', '73'], ['a', 'b'], ['/missing-file'], ['--repair', 'a']]) {
    assert.equal(run(args).status, 1, args.join(' '));
  }
  assert.equal(run(['--text']).status, 2);
});

test('audit CLI: invalid UTF-8 is a read error for stdin and file', () => {
  const invalid = Buffer.from([0x61, 0xff, 0x62]);
  assert.equal(run(['-', '--text'], invalid).status, 1);
  const dir = mkdtempSync(join(tmpdir(), 'cp-invalid-'));
  try {
    writeFileSync(join(dir, 'bad.txt'), invalid);
    assert.equal(run([join(dir, 'bad.txt')]).status, 1);
  } finally { rmSync(dir, { recursive: true }); }
});

test('audit CLI: 1 MB stdin and file preserve text and valid JSON', () => {
  const text = 'x'.repeat(1024 * 1024);
  const dir = mkdtempSync(join(tmpdir(), 'cp-large-'));
  try {
    const file = join(dir, 'large.txt');
    writeFileSync(file, text);
    for (const args of [['-', '--text'], [file]]) {
      const result = run([...args, '--print', 'json'], args[0] === '-' ? text : '');
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { html: '', text });
    }
  } finally { rmSync(dir, { recursive: true }); }
});
