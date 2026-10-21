# Cleanpasta on Windows

Status: implementation preview on `feature/windows`, targeting `development`; architecture proposed on 2026-10-21, pending Eryk's acceptance. No release is published by this work.

## Architecture decision

Keep one repository per ES Tools product and one shared development/release history. Platform feature branches are temporary integration branches, never separate maintained products. The native Swift macOS app stays at the repository root. Windows lives in `windows/`, using Tauri 2 and Rust; the Windows webview renders settings only. Clipboard text is converted in Rust's embedded JS engine, not in the settings webview.

`converter/src/convert.ts` remains the only converter source. Its committed `Resources/convert.js` bundle is embedded directly with `include_str!` by `windows/crates/cleanpasta-core`, with no copied implementation or Node runtime on the user's machine. macOS executes the same bundle in JavaScriptCore. Both the Tauri app and `cleanpasta.exe` call this core. `cleanpasta-platform` owns clipboard access, preferences, SendInput and per-user PATH setup.

Choose `rquickjs` (QuickJS) over Boa for this implementation: it runs the existing bundle unchanged, including lookbehind and Unicode property escapes, and exposes memory, stack and execution interruption controls. The 18-case parity matrix passes against the TypeScript oracle. This is evidence for the current converter, not a claim about every JavaScript feature. The tradeoff is an embedded C engine and a C compiler at build time; Boa would give a Rust implementation but would still need equivalent compatibility and performance verification. Each conversion gets a fresh context, a 64 MiB JS heap budget, a 2 MiB JS stack budget and a three-second execution deadline. No filesystem, Node, shell or network bindings are exposed to converter JS. Input is serialized as JSON, never interpolated as executable code. [Runtime controls](https://docs.rs/rquickjs/0.12.2/rquickjs/struct.Runtime.html).

## Building and verification

Use a current stable Rust toolchain, Node 24 and pnpm for development. Windows builds require the MSVC C++ tools, Windows SDK and WebView2 runtime. The installer can bootstrap WebView2. Target x64 Windows 10/11; validate Windows 11 first. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

Run from the repository root (PowerShell examples):

```powershell
cd converter
pnpm install --frozen-lockfile --ignore-scripts
cd ..
node windows/scripts/generate-parity.mjs --check
cargo test --manifest-path windows/Cargo.toml --locked -p cleanpasta-core -p cleanpasta-platform -p cleanpasta-cli
cargo build --manifest-path windows/Cargo.toml --locked --release -p cleanpasta-cli
New-Item -ItemType Directory -Force windows/app/binaries
Copy-Item windows/target/release/cleanpasta.exe windows/app/binaries/cleanpasta.exe
cd windows/app
pnpm dlx @tauri-apps/cli@2 build --bundles nsis -- --locked
```

Wrap local commands in your terminal's timeout mechanism; CI sets explicit step and job timeouts. On macOS, for example, use `perl -e 'alarm 600; exec @ARGV' cargo test --manifest-path windows/Cargo.toml --locked`. `cargo check --manifest-path windows/Cargo.toml --locked -p cleanpasta-app` checks the Tauri app on macOS; clipboard and injection functions there are explicit Windows-only stubs. Do not distribute this Tauri build as a replacement for the native macOS app.

The NSIS installer and standalone CLI are uploaded together as `cleanpasta-windows-x64-preview` in the Windows workflow. The installer uses current-user mode. Nothing is published to GitHub Releases automatically. Installers from this workflow have no Authenticode certificate and are intended for an agreed manual test only.

### Parity proof

`windows/scripts/generate-parity.mjs` reads the actual `variants` and `contents` declarations in `tests/parity.test.ts`, loads those same fixture files and calls the TypeScript source. It writes expected HTML and plain text for all 18 cases, including draft-body extraction. The checked-in oracle lets `cargo test` run without Node. CI regenerates it in check mode to detect drift, then Rust compares both strings exactly after execution in QuickJS. The core embeds the committed bundle, so a stale bundle fails parity against an updated oracle. After a converter change, rebuild the shared bundle using the existing workflow and regenerate the oracle. Do not edit generated expectations by hand. CLI tests additionally check file extensions, stdin, help, aliases, font bounds, JSON input, body extraction and exit codes.

## Clipboard, shortcuts and focus

Windows reads `CF_UNICODETEXT` and `HTML Format` (CF_HTML), and writes both under a single clipboard lock. HTML fragment byte offsets are bounds-checked before UTF-8 decoding; malformed HTML falls back to text. Unicode output uses Windows line endings. RTF-only and web-archive-only clipboard sources are not supported yet. Images and files are left unchanged; Paste Clean still sends Ctrl+V for unsupported clipboard content.

Default Paste Clean: `Ctrl+Alt+Shift+V`; Repair Clipboard has no default. This combination does not appear in Microsoft's standard Windows shortcut list, unlike Ctrl+Shift+V (plain-text paste) and Win+V (clipboard history). This is a documentation-based check, not a guarantee on an individual PC: PowerToys, graphics drivers, launchers and other apps may reserve it. AltGr can also behave like Ctrl+Alt on international layouts. Registration failure opens settings and reports the conflict; the tray menu remains available. Recording a replacement or clearing a shortcut is supported. [Windows shortcuts](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows), [Tauri global shortcuts](https://v2.tauri.app/plugin/global-shortcut/).

Paste Clean waits up to three seconds for Ctrl, Alt, Shift and Win to be released before sending Ctrl+V using SendInput. A partial SendInput failure sends key-up events to avoid stuck Ctrl. The nonfocusable, topmost HUD never activates a window. Tray clicks capture the destination window and attempt to restore it before pasting; Windows focus restrictions can refuse this, in which case the clipboard remains ready for manual Ctrl+V. Tray focus restoration, multiple monitors, layouts and elevated target apps require manual Windows verification. Injection success means Windows accepted the events, not proof that a particular editor inserted the content. [SendInput and UIPI restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).

Deep links: `cleanpasta://paste`, `cleanpasta://repair`, `cleanpasta://settings`, `cleanpasta://about`. The installer registers the scheme. Single-instance handling delivers links to the existing process. Links select a fixed action and cannot provide text, settings, executable paths or commands. Test links with the installed app, not an unregistered development binary. [Deep links](https://v2.tauri.app/plugin/deep-linking/).

## Preferences and CLI

App and CLI share `%APPDATA%\estools-cleanpasta\settings.json`. Formatting defaults are replace dashes, replace quotes and 12 px. The CLI implements the flags in `Sources/CLI/main.swift`, including `--json-input`, `--md`, `--body`, explicit `--print` with copying, and exit codes 0/1/2/3. Windows code 3 means clipboard prepared but simulated paste failed; it is the Windows equivalent of the macOS Accessibility failure. The Windows help describes Ctrl+V and Windows permissions.

Settings > General > Install to user PATH copies the bundled CLI to `%LOCALAPPDATA%\ES Tools\Cleanpasta\bin\cleanpasta.exe` and appends that directory to the current user's PATH, preserving existing environment variable references. It uses HKCU only and broadcasts the environment change. Open a new terminal afterwards. Reinstall the CLI from settings after app updates to refresh this standalone copy. Uninstalling the preview does not remove this optional copy or its user PATH entry; remove that entry and folder manually if no longer needed. No administrator access or system PATH edits are needed.

Autostart uses Tauri's per-user autostart integration. Closing settings hides the window and leaves the tray process running; Quit exits it. The settings webview loads bundled Geist fonts, starts light, and offers a persistent dark-mode switch. Icons derive from `design/icon-1024.png` and the existing dark asset; the tray follows the OS theme. No telemetry is present.

## Updates and keys

Preview builds intentionally set `createUpdaterArtifacts: false` and use the conspicuous public-key placeholder `REPLACE_WITH_ERYKS_ED25519_PUBLIC_KEY`. Checks and installation are blocked while this placeholder remains. Do not use the macOS Sparkle key for Windows. No private key is generated or committed here.

Eryk generates the Tauri Ed25519/minisign key pair himself on a trusted machine, for example `pnpm dlx @tauri-apps/cli@2 signer generate -w <private-path>`. Back up the private key and password in 1Password. Commit only the public key to `windows/app/tauri.conf.json`. For a future release, enable `bundle.createUpdaterArtifacts`, supply `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` through the release environment/secrets, then build. Keep signing secrets out of logs and artifacts. See [Tauri updater signing and manifests](https://v2.tauri.app/plugin/updater/).

Publish an HTTPS `windows-latest.json` asset with `version`, `notes`, `pub_date` and `platforms.windows-x86_64` containing the installer URL and `.sig` contents. The configured endpoint points to that asset in this repository's latest release. Coordinate the manifest with native macOS releases, or replace the endpoint before the first Windows release so that a later macOS-only latest release does not hide the manifest. Never replace the public key without an update migration plan for existing installs.

Checks run manually or daily when enabled; they show version and changelog without installing. Install Update is an explicit action; Rust rechecks the selected version, downloads and verifies the signature, installs and restarts. Tampered signatures and version changes must fail. Signed update installation cannot be verified until Eryk provides keys and an actual update feed. Update signatures protect the update channel; they do not establish Windows publisher trust.

## Windows code signing: decision for Eryk

Unsigned downloads can trigger SmartScreen and unknown-publisher warnings; enterprise policies may block them completely. A self-signed certificate does not establish public trust. Do not disable SmartScreen or change enterprise policy for this preview. If a trusted tester's policy permits it, they can inspect the source/artifact provenance and consciously approve the specific installer. [Windows signing guidance](https://v2.tauri.app/distribute/sign/windows/).

Options checked on 2026-10-21, prices in USD before applicable taxes:

| Option | Indicative cost | Decision considerations |
| --- | --- | --- |
| Azure Artifact Signing (formerly Trusted Signing) | Basic $9.99/month, includes up to 5,000 signatures | Managed service, no USB token; verify identity, region and eligibility for Eryk in Poland before choosing. Disable/avoid paid overage. |
| OV code-signing certificate | SSL.com lists $129/year for one year, plus eligible key storage; its token option adds $379 and cloud signing has a separate subscription | Organization validation and hardware/cloud key requirements; a new certificate still builds SmartScreen reputation. |
| Unsigned preview | $0 | Appropriate only for explicitly agreed testing; warnings and policy blocks remain. |

Sources: [Microsoft service and price](https://azure.microsoft.com/en-us/products/artifact-signing), [SSL.com OV price and key storage](https://www.ssl.com/products/software-integrity/code-signing/ov/). Prices and eligibility can change; request a final quote only if Eryk chooses to proceed. Recommendation: keep the test build unsigned, then evaluate Azure eligibility and fixed cost for public distribution; OV is a fallback if Azure is unsuitable. No subscription, credit purchase or certificate purchase is authorized or performed. Configure Tauri's Windows signing command/certificate and timestamping only after Eryk decides. Authenticode-sign both app and CLI as well as the installer for a public release.

## Manual Windows acceptance checklist

1. Download the artifact from the successful CI run, inspect its origin, and install as a standard user on Windows 11 with WebView2; record SmartScreen behavior. Verify installation and removal without elevation.
2. Copy rich HTML from a rendered chat and VS Code Markdown. Use Paste Clean in Outlook, Gmail, Word, Slack and Notepad; check bold, links, bullets, numbering, non-breaking spaces and no source background/color/font. Check Polish text and Unicode punctuation.
3. Hold shortcut modifiers, then release them. Confirm one Ctrl+V insertion in the original editor and no accidental Paste and Match Style. Repeat through the tray, on multiple monitors and with images/files. Check HUD does not steal focus.
4. Run Repair Clipboard, paste manually and verify both HTML and Unicode formats. Test empty clipboard and an app temporarily holding the clipboard open. Check user-facing errors can be copied.
5. Save formatting and shortcuts, restart and confirm persistence. Deliberately register a conflicting shortcut and check the error and rollback. Test Polish AltGr, light/dark OS tray icons and the UI theme switch.
6. Enable autostart, sign out/in, confirm exactly one tray instance, then disable it. Close settings, reopen from tray, open About, then Quit.
7. Install the CLI to user PATH. Open a new PowerShell terminal, run `cleanpasta --help`, `cleanpasta draft.md --body --copy`, pipe text with `--print json`, use `--repair`, and check exit codes. Verify UTF-8 text on stdout. Compare CLI and app settings.
8. Invoke all four `cleanpasta://` links while running and while stopped. Confirm single-instance behavior. Test `--paste` into a normal editor and an elevated editor; verify the manual-paste fallback.
9. With Eryk's future signed feed, check changelog and explicit installation, restart, reject a tampered signature, test an unavailable server and confirm automatic checks never install silently.

## Differences from macOS and remaining gates

Native Swift/SwiftUI, JavaScriptCore, NSPasteboard, CGEvent, SMAppService and Sparkle remain unchanged. Windows uses WebView2/Tauri, QuickJS, CF_HTML/Unicode, SendInput, per-user autostart and Tauri's updater. Windows has no macOS Accessibility prompt; UIPI and focus rules still apply. RTF/web archives, native Raycast integration and automatic refresh/removal of an optional CLI copy are outside this preview. Architecture acceptance, manual Windows behavior, Windows publisher signing and the updater key/feed remain Eryk's decisions before release.
