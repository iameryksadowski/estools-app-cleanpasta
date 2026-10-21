import AppKit
import ServiceManagement
import SwiftUI
import CleanpastaCore

/// The settings window. While it is open the app has a Dock icon; closing it puts the
/// app back into the menu bar only.
final class SettingsWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let updater: Updater

    init(updater: Updater) {
        self.updater = updater
    }

    func show() {
        DockIcon.show("settings")
        if window == nil {
            let hosting = NSHostingController(rootView: SettingsView(updater: updater))
            let window = NSWindow(contentViewController: hosting)
            window.title = "Cleanpasta"
            window.styleMask = [.titled, .closable, .miniaturizable]
            window.isReleasedWhenClosed = false
            window.delegate = self
            window.center()
            window.setFrameAutosaveName("SettingsWindow")
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowWillClose(_ notification: Notification) {
        DockIcon.hide("settings")
    }
}

struct SettingsView: View {
    @ObservedObject private var preferences = Preferences.shared
    let updater: Updater
    @State private var trusted = AXIsProcessTrusted()
    @State private var openAtLogin = SMAppService.mainApp.status == .enabled
    @State private var loginError: String?
    @State private var autoUpdates = false
    @State private var cliStatus = CommandLineTool.status()
    @State private var raycastNote: String?
    @AppStorage("raycastEnabled") private var raycastEnabled = false
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var version: String {
        let info = Bundle.main.infoDictionary
        return info?["CFBundleShortVersionString"] as? String ?? "dev"
    }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .frame(width: 56, height: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Cleanpasta").font(.title2.weight(.semibold))
                        Text("Paste formatted text without backgrounds, colors and fonts. Bold, lists, links and line breaks stay.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 4)
            }

            if !trusted {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("One step left: allow Accessibility", systemImage: "hand.raised")
                            .font(.headline)
                        Text("Cleanpasta presses Cmd+V for you, and macOS asks for your permission. Click the button, turn on Cleanpasta in the list and come back here. After an update, if Cleanpasta is already on, turn it off and on again.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Allow Accessibility") { Permissions.requestAccessibility() }
                            .buttonStyle(.borderedProminent)
                            .tint(Color(red: 0.020, green: 0.588, blue: 0.412))
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                LabeledContent {
                    ShortcutRow(shortcut: $preferences.pasteCleanShortcut)
                } label: {
                    Text("Paste Clean")
                    Text("Cleans the clipboard and pastes it into the app you are in.")
                }
                LabeledContent {
                    ShortcutRow(shortcut: $preferences.repairShortcut)
                } label: {
                    Text("Repair Clipboard")
                    Text("Keeps the text and removes backgrounds, colors and fonts. Then paste with Cmd+V yourself.")
                }
                if preferences.shortcutConflict {
                    Label("Another app already uses one of these shortcuts. Pick a different one.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.callout)
                }
            } header: {
                Text("Shortcuts")
            } footer: {
                Text("Click a field and press the keys. The x removes a shortcut - both commands always work from the menu bar icon, with or without one.")
                    .foregroundStyle(.secondary)
            }

            Section("Formatting") {
                Toggle(isOn: $preferences.replaceDashes) {
                    Text("Replace em and en dashes")
                    Text("Long dashes become a plain hyphen \"-\".")
                }
                Toggle(isOn: $preferences.replaceQuotes) {
                    Text("Replace typographic quotes")
                    Text("Curly and angle quotes, and the curly apostrophe, become \" and '.")
                }
                Picker(selection: $preferences.fontSize) {
                    ForEach(Preferences.fontSizes, id: \.value) { size in
                        Text(size.title).tag(size.value)
                    }
                } label: {
                    Text("Font size")
                    Text("Size of the pasted text. Without a size, Mail and Notes paste at 16 px.")
                }
            }

            Section("General") {
                Toggle(isOn: $openAtLogin) {
                    Text("Open at login")
                    if let loginError {
                        Text(loginError).foregroundStyle(.orange)
                    }
                }
                .onChange(of: openAtLogin) { _, enabled in setOpenAtLogin(enabled) }
                Toggle(isOn: $preferences.showFeedback) {
                    Text("Show a confirmation")
                    Text("A short note on screen after Repair Clipboard.")
                }
                LabeledContent {
                    if cliStatus.installed {
                        Text(cliStatus.path).font(.system(.callout, design: .monospaced)).foregroundStyle(.secondary)
                    } else {
                        Button("Install") { cliStatus = CommandLineTool.install() }
                    }
                } label: {
                    Text("Command line tool")
                    Text(cliStatus.note ?? "cleanpasta for Terminal, scripts and AI assistants. See cleanpasta --help.")
                }
            }

            Section {
                if RaycastIntegration.isInstalled {
                    Toggle(isOn: $raycastEnabled) {
                        Text("Raycast commands")
                        Text("Paste Clean, Repair Clipboard, Settings and About as commands in Raycast, so you can run them from Raycast or give them Raycast hotkeys.")
                    }
                    .onChange(of: raycastEnabled) { _, enabled in
                        raycastNote = enabled ? RaycastIntegration.enable() : RaycastIntegration.disable()
                    }
                    if let raycastNote {
                        Text(raycastNote)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                } else {
                    LabeledContent("Raycast commands") {
                        Text("Raycast is not installed").foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("Raycast")
            } footer: {
                Text("Other launchers and scripts can use the links cleanpasta://paste, cleanpasta://repair, cleanpasta://settings and cleanpasta://about.")
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            Section("Updates") {
                Toggle("Check for updates automatically", isOn: $autoUpdates)
                    .onChange(of: autoUpdates) { _, value in updater.automaticallyChecks = value }
                    .disabled(!updater.isAvailable)
                LabeledContent("Version \(version)") {
                    Button("Check Now") { updater.checkForUpdates() }
                }
            }

            Section {
                LabeledContent("Accessibility") {
                    if trusted {
                        Label("Allowed", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    } else {
                        Button("Open Settings") { Permissions.requestAccessibility() }
                    }
                }
            } header: {
                Text("Permission")
            } footer: {
                HStack {
                    Text("ES Tools by Eryk Sadowski")
                    Spacer()
                    Link("eryksadowski.com", destination: URL(string: "https://eryksadowski.com")!)
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
            }
        }
        .formStyle(.grouped)
        // fits a 13-inch screen; the form scrolls
        .frame(width: 520, height: 660)
        .onAppear {
            autoUpdates = updater.automaticallyChecks
            cliStatus = CommandLineTool.status()
        }
        .onReceive(timer) { _ in
            trusted = AXIsProcessTrusted()
        }
    }

    private func setOpenAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            loginError = nil
        } catch {
            loginError = "Could not change it: \(error.localizedDescription)"
        }
        openAtLogin = SMAppService.mainApp.status == .enabled
    }
}

/// Links Contents/Helpers/cleanpasta into a folder on the PATH, without an admin password.
enum CommandLineTool {
    struct Status {
        var installed: Bool
        var path: String
        var note: String?
    }

    static var helper: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/cleanpasta") }

    static var candidateFolders: [URL] {
        ["/opt/homebrew/bin", "/usr/local/bin"].map { URL(fileURLWithPath: $0) }
            + [FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin")]
    }

    /// Homebrew's folder is on the PATH and writable without a password; ~/.local/bin otherwise.
    static var targetFolder: URL {
        let fm = FileManager.default
        for folder in ["/opt/homebrew/bin", "/usr/local/bin"] where fm.isWritableFile(atPath: folder) {
            return URL(fileURLWithPath: folder)
        }
        return fm.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin")
    }

    static func status() -> Status {
        let link = targetFolder.appendingPathComponent("cleanpasta")
        let destination = try? FileManager.default.destinationOfSymbolicLink(atPath: link.path)
        return Status(installed: destination == helper.path, path: link.path.replacingOccurrences(of: NSHomeDirectory(), with: "~"))
    }

    static func install() -> Status {
        let fm = FileManager.default
        guard fm.fileExists(atPath: helper.path) else {
            return Status(installed: false, path: "", note: "The command line tool is missing from this build.")
        }
        let folder = targetFolder
        do {
            try CLIInstallation.install(helper: helper, folder: folder)
        } catch {
            return Status(installed: false, path: "", note: "Could not install: \(error.localizedDescription)")
        }
        var result = status()
        if folder.path.hasSuffix("/.local/bin") {
            result.note = "Installed. Add ~/.local/bin to your PATH to use cleanpasta in Terminal."
        }
        return result
    }
}

/// Raycast commands = Raycast Quicklinks that call Cleanpasta through its links
/// (cleanpasta://...). Raycast has no public way to add them from outside, so Cleanpasta
/// writes a file for Raycast's Import Quicklinks command and opens Raycast.
enum RaycastIntegration {
    static var raycastURL: URL? { NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.raycast.macos") }
    static var isInstalled: Bool { raycastURL != nil }

    static let quicklinks: [[String: String]] = [
        ["name": "Cleanpasta: Paste Clean", "link": "cleanpasta://paste"],
        ["name": "Cleanpasta: Repair Clipboard", "link": "cleanpasta://repair"],
        ["name": "Cleanpasta: Settings", "link": "cleanpasta://settings"],
        ["name": "Cleanpasta: About", "link": "cleanpasta://about"],
    ]

    static var fileURL: URL {
        FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0].appendingPathComponent("Cleanpasta for Raycast.json")
    }

    /// Writes the import file to Downloads, opens Raycast and returns the next steps.
    static func enable() -> String {
        do {
            let data = try JSONSerialization.data(withJSONObject: quicklinks, options: [.prettyPrinted, .withoutEscapingSlashes])
            try data.write(to: fileURL, options: .atomic)
        } catch {
            return "Could not write the file for Raycast: \(error.localizedDescription)"
        }
        if let raycastURL {
            NSWorkspace.shared.openApplication(at: raycastURL, configuration: NSWorkspace.OpenConfiguration())
        }
        return "One step in Raycast: type Import Quicklinks, press Return and pick \"Cleanpasta for Raycast.json\" in Downloads. The commands start with \"Cleanpasta:\". Hotkeys for them: Raycast Settings > Extensions > Quicklinks."
    }

    /// Removes the import file and returns how to remove the commands from Raycast.
    static func disable() -> String {
        try? FileManager.default.removeItem(at: fileURL)
        return "To remove the commands: in Raycast type Search Quicklinks, select a \"Cleanpasta:\" command, press Cmd+K and choose Delete Quicklink; repeat for each of them."
    }
}
