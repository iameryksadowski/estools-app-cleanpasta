import AppKit
import SwiftUI

/// "About Cleanpasta": the tool, ES Tools, the author and the version, in one window.
final class AboutWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let updater: Updater

    init(updater: Updater) {
        self.updater = updater
    }

    func show() {
        DockIcon.show("about")
        if window == nil {
            let hosting = NSHostingController(rootView: AboutView(updater: updater))
            let window = NSWindow(contentViewController: hosting)
            window.title = "About Cleanpasta"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.delegate = self
            window.center()
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowWillClose(_ notification: Notification) {
        DockIcon.hide("about")
    }
}

enum Links {
    static let website = URL(string: "https://eryksadowski.com")!
    static let repository = URL(string: "https://github.com/iameryksadowski/estools-app-cleanpasta")!
    static let releases = URL(string: "https://github.com/iameryksadowski/estools-app-cleanpasta/releases")!
    static let license = URL(string: "https://github.com/iameryksadowski/estools-app-cleanpasta/blob/main/LICENSE")!
    static let email = URL(string: "mailto:iam@eryksadowski.com?subject=Clean%20Paste")!
}

struct AboutView: View {
    let updater: Updater
    @Environment(\.colorScheme) private var colorScheme

    private var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev" }
    private var build: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "-" }
    private let accent = Color(red: 0.063, green: 0.725, blue: 0.506)       // #10B981
    private let accentText = Color(red: 0.020, green: 0.588, blue: 0.412)   // #059669

    private func image(_ name: String) -> NSImage? {
        Bundle.main.url(forResource: name, withExtension: "png").flatMap { NSImage(contentsOf: $0) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // The tool
            VStack(spacing: 10) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 96, height: 96)
                Text("ES Tools Cleanpasta")
                    .font(.system(size: 20, weight: .semibold))
                Text("Version \(version) (\(build))")
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                Text("Paste formatted text without backgrounds, colors and fonts. Bold, lists, links and line breaks stay; Markdown becomes formatted text; dashes and quotes become keyboard characters.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 8)
                HStack(spacing: 10) {
                    Button("Check for Updates") { updater.checkForUpdates() }
                    Button("What's New") { NSWorkspace.shared.open(Links.releases) }
                }
                .padding(.top, 4)
            }
            .padding(.top, 22)
            .padding(.bottom, 18)

            Divider()

            // ES Tools
            VStack(alignment: .leading, spacing: 8) {
                if let wordmark = image(colorScheme == .dark ? "ESToolsWordmark-light" : "ESToolsWordmark-dark") {
                    Image(nsImage: wordmark)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 22)
                        .accessibilityLabel("ES Tools")
                }
                Text("Small, focused tools for creative and development work. Each tool does one job well, looks and behaves like the others, and updates itself. Open source, MIT license.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 14) {
                    Link("Source code", destination: Links.repository)
                    Link("Changelog", destination: Links.releases)
                    Link("License", destination: Links.license)
                }
                .font(.callout)
                .foregroundStyle(accentText)
                .tint(accentText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.vertical, 16)

            // The author: the dark author card of the Eryk Sadowski brand
            VStack(alignment: .leading, spacing: 10) {
                if let wordmark = image("SadowskiWordmark-white") {
                    Image(nsImage: wordmark)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 16)
                        .accessibilityLabel("SADOWSKI")
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Eryk Sadowski")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(white: 0.98))
                    Text("IT & Creative Director · author of ES Tools")
                        .font(.callout)
                        .foregroundStyle(Color(red: 0.631, green: 0.631, blue: 0.667)) // #A1A1AA
                }
                HStack(spacing: 14) {
                    Link("eryksadowski.com", destination: Links.website)
                    Link("iam@eryksadowski.com", destination: Links.email)
                }
                .font(.callout)
                .foregroundStyle(accent)
                .tint(accent)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color(red: 0.039, green: 0.039, blue: 0.039))) // #0A0A0A
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0.153, green: 0.153, blue: 0.165), lineWidth: 1)) // #27272A
            .padding(.horizontal, 22)

            HStack {
                Text("© 2026 Eryk Sadowski")
                Spacer()
                HStack(spacing: 5) {
                    Circle().fill(accent).frame(width: 6, height: 6)
                    Text("ES Tools by Eryk Sadowski")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
        }
        .frame(width: 440)
    }
}
