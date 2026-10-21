import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('audit: CLI installation preserves unrelated files and links, repairs its own dangling link', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-install-test-'));
  try {
    const harness = join(dir, 'main.swift');
    writeFileSync(harness, `
import Foundation
let fm = FileManager.default
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let helper = root.appendingPathComponent("Cleanpasta.app/Contents/Helpers/cleanpasta")
try fm.createDirectory(at: helper.deletingLastPathComponent(), withIntermediateDirectories: true)
try Data("helper".utf8).write(to: helper)
try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: helper.path)
let folder = root.appendingPathComponent("bin")
try fm.createDirectory(at: folder, withIntermediateDirectories: true)
let link = folder.appendingPathComponent("cleanpasta")
try Data("other tool".utf8).write(to: link)
do { try CLIInstallation.install(helper: helper, folder: folder); fatalError("overwrote unrelated file") } catch {}
precondition(try! String(contentsOf: link) == "other tool")
try fm.removeItem(at: link)
try fm.createSymbolicLink(atPath: link.path, withDestinationPath: "/other/tool")
do { try CLIInstallation.install(helper: helper, folder: folder); fatalError("overwrote unrelated link") } catch {}
precondition(try! fm.destinationOfSymbolicLink(atPath: link.path) == "/other/tool")
try fm.removeItem(at: link)
try fm.createSymbolicLink(atPath: link.path, withDestinationPath: root.appendingPathComponent("Clean Paste.app/Contents/Helpers/cleanpaste").path)
try CLIInstallation.install(helper: helper, folder: folder)
precondition(try! fm.destinationOfSymbolicLink(atPath: link.path) == helper.path)
try CLIInstallation.install(helper: helper, folder: folder)
let legacy = folder.appendingPathComponent("cleanpaste")
try fm.createSymbolicLink(atPath: legacy.path, withDestinationPath: helper.path)
try fm.removeItem(at: link)
try Data("another tool".utf8).write(to: link)
do { try CLIInstallation.migrate(legacyLinks: [legacy], helper: helper, folder: folder); fatalError("migration must fail") } catch {}
precondition((try? fm.destinationOfSymbolicLink(atPath: legacy.path)) != nil, "failed migration removed the old command")
try fm.removeItem(at: link)
try CLIInstallation.migrate(legacyLinks: [legacy], helper: helper, folder: folder)
precondition((try? fm.destinationOfSymbolicLink(atPath: legacy.path)) == nil)
precondition(try! fm.destinationOfSymbolicLink(atPath: link.path) == helper.path)
`);
    const binary = join(dir, 'test-install');
    execFileSync('xcrun', ['swiftc', '-module-cache-path', process.env.CLANG_MODULE_CACHE_PATH ?? join(dir, 'cache'), 'Sources/CleanpastaCore/CLIInstallation.swift', harness, '-o', binary], { timeout: 180000 });
    execFileSync(binary, [dir], { timeout: 10000 });
  } finally { rmSync(dir, { recursive: true }); }
});
