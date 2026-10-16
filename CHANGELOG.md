# ES Tools Cleanpasta Changelog

Until 1.0.1 the app was called ES Tools Clean Paste.

## [1.1.1] - 2026-10-16

### Fixed

- **Slack: no more double blank lines.** After a bullet list (most visibly one with a single point) Slack added a second empty line. Bullet lists are no longer wrapped in an extra block, so every gap is one blank line; Apple Mail pastes the result exactly as before.

## [1.1.0] - 2026-10-15

### Changed

- **New name: Cleanpasta.** The app, its menu, the command line tool (`cleanpasta`), the links (`cleanpasta://`) and the repository (`estools-app-cleanpasta`) carry the new name. An installed Clean Paste updates in place: on the first launch it renames itself to Cleanpasta.app, moves the command line tool link and keeps the settings, shortcuts and the Accessibility permission. Old `estools-clean-paste://` links still work.
- **Numbered points are pasted as plain paragraphs** ("1. ...") without an indent, with a blank line after each, so the numbering stays exactly as written. Only bullet points become a list, right below a line that ends with a colon. A greeting on the first line gets its own paragraph.
- **Raycast** has its own section in Settings: turn on Raycast commands to add Paste Clean, Repair Clipboard, Settings and About to Raycast (one import step in Raycast); turn them off to see how to remove them.

### Added

- Every shortcut has a button that removes it; a command without a shortcut still works from the menu bar icon.
- The cleaning logic now lives in this repository (`converter/`, with its unit tests and paste tests in the WebKit editor used by Apple Mail).

## [1.0.1] - 2026-10-01

### Added

- **About Clean Paste** in the menu bar menu: the tool, its version and build, ES Tools, the author (Eryk Sadowski) and links to the source code, changelog and license.
- **Add to Raycast** in Settings > General: saves Paste Clean, Repair Clipboard, Settings and About as Raycast Quicklinks ("Clean Paste for Raycast.json" in Downloads) and opens Raycast for its Import Quicklinks command; give them Raycast hotkeys if you like.
- `estools-clean-paste://about` link.
- The menu bar menu shows the installed version at the bottom, so you can see at a glance that an update went through.

### Changed

- After an update that takes away the Accessibility permission, Clean Paste opens its settings with the one-click way back.
- A paste started from a link (Raycast, scripts) waits a moment longer, so the launcher can close and the target app comes back first.

## [1.0.0] - 2026-09-29

### Added

- Menu bar app: **Paste Clean** cleans the clipboard and pastes it into the app you are in; **Repair Clipboard** cleans it in place for a manual Cmd+V. Both with global shortcuts (Paste Clean: Control+Option+Command+V).
- Keeps bold, italic, underline, links, line breaks, non-breaking spaces, lists and simple tables; drops backgrounds, colors and fonts. Markdown becomes formatted text. Em and en dashes become "-", typographic quotes become " and '.
- Settings: shortcuts, dashes, quotes, font size (12 px by default, like Apple Mail), open at login, confirmation, updates, Accessibility status. The Dock icon shows only while the settings window is open.
- `cleanpaste` command line tool for Terminal, scripts and AI assistants, installed from the settings.
- In-app updates with the changelog, after the user agrees.
- `estools-clean-paste://paste`, `://repair` and `://settings` links for Raycast and scripts.
