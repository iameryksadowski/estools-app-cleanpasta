import AppKit
import Carbon.HIToolbox
import CleanpastaCore

/// A global keyboard shortcut: a key code plus modifiers, with the key's label for display.
struct Shortcut: Codable, Equatable {
    var keyCode: UInt32
    var modifiers: UInt // NSEvent.ModifierFlags raw value (device independent part)
    var key: String

    var flags: NSEvent.ModifierFlags { NSEvent.ModifierFlags(rawValue: modifiers) }

    var carbonModifiers: UInt32 {
        var value: UInt32 = 0
        if flags.contains(.command) { value |= UInt32(cmdKey) }
        if flags.contains(.option) { value |= UInt32(optionKey) }
        if flags.contains(.control) { value |= UInt32(controlKey) }
        if flags.contains(.shift) { value |= UInt32(shiftKey) }
        return value
    }

    /// e.g. "⌃⌥⌘V", in the order macOS menus use.
    var display: String {
        var text = ""
        if flags.contains(.control) { text += "⌃" }
        if flags.contains(.option) { text += "⌥" }
        if flags.contains(.shift) { text += "⇧" }
        if flags.contains(.command) { text += "⌘" }
        return text + key
    }

    /// Key equivalent for NSMenuItem (lowercase letter) and its modifier mask.
    var menuKey: String { key.count == 1 ? key.lowercased() : "" }

    static let defaultPasteClean = Shortcut(
        keyCode: UInt32(kVK_ANSI_V),
        modifiers: NSEvent.ModifierFlags([.control, .option, .command]).rawValue,
        key: "V"
    )
}

/// Settings, stored in UserDefaults.
final class Preferences: ObservableObject {
    static let shared = Preferences()
    private let defaults = UserDefaults.standard

    /// Font size choices: the Apple Mail default first, 0 = keep the target app's size.
    static let fontSizes: [(value: Int, title: String)] = [
        (12, "12 px (Apple Mail default)"),
        (11, "11 px"),
        (13, "13 px"),
        (14, "14 px"),
        (16, "16 px"),
        (0, "Keep the size of the target app"),
    ]

    @Published var replaceDashes: Bool { didSet { defaults.set(replaceDashes, forKey: "replaceDashes") } }
    @Published var replaceQuotes: Bool { didSet { defaults.set(replaceQuotes, forKey: "replaceQuotes") } }
    @Published var fontSize: Int { didSet { defaults.set(fontSize, forKey: "fontSize") } }
    @Published var pasteCleanShortcut: Shortcut? { didSet { save(pasteCleanShortcut, key: "pasteCleanShortcut") } }
    @Published var repairShortcut: Shortcut? { didSet { save(repairShortcut, key: "repairShortcut") } }
    @Published var showFeedback: Bool { didSet { defaults.set(showFeedback, forKey: "showFeedback") } }

    /// True when a shortcut could not be registered (another app already uses it).
    @Published var shortcutConflict = false

    var cleanOptions: CleanOptions {
        CleanOptions(replaceDashes: replaceDashes, replaceQuotes: replaceQuotes, fontSize: fontSize)
    }

    private init() {
        defaults.register(defaults: [
            "replaceDashes": true,
            "replaceQuotes": true,
            "fontSize": 12,
            "showFeedback": true,
        ])
        replaceDashes = defaults.bool(forKey: "replaceDashes")
        replaceQuotes = defaults.bool(forKey: "replaceQuotes")
        fontSize = defaults.integer(forKey: "fontSize")
        showFeedback = defaults.bool(forKey: "showFeedback")
        if defaults.object(forKey: "pasteCleanShortcut") == nil {
            pasteCleanShortcut = Shortcut.defaultPasteClean
        } else {
            pasteCleanShortcut = Preferences.load(defaults, key: "pasteCleanShortcut")
        }
        repairShortcut = Preferences.load(defaults, key: "repairShortcut")
    }

    private func save(_ shortcut: Shortcut?, key: String) {
        // An empty Data value means "no shortcut", so a cleared default stays cleared.
        let data = shortcut.flatMap { try? JSONEncoder().encode($0) } ?? Data()
        defaults.set(data, forKey: key)
    }

    private static func load(_ defaults: UserDefaults, key: String) -> Shortcut? {
        guard let data = defaults.data(forKey: key), !data.isEmpty else { return nil }
        return try? JSONDecoder().decode(Shortcut.self, from: data)
    }

    var isFirstLaunch: Bool {
        get { !defaults.bool(forKey: "launchedBefore") }
        set { defaults.set(!newValue, forKey: "launchedBefore") }
    }
}
