import AppKit
import ApplicationServices

/// Reads rich text from the macOS clipboard, writes the clean version back and
/// presses Cmd+V in the frontmost app.
public enum Clipboard {
    public struct Content {
        public var html: String?
        public var text: String?
        public init(html: String?, text: String?) {
            self.html = html
            self.text = text
        }
        /// True when there is text to clean (an image or a file alone is not).
        public var hasText: Bool { !(html ?? "").isEmpty || !(text ?? "").isEmpty }
    }

    private static let webArchive = NSPasteboard.PasteboardType("com.apple.webarchive")

    /// Rich text in order of preference: HTML, the HTML inside a web archive (Safari,
    /// Mail, Notes), RTF converted to HTML (TextEdit, Pages); plus plain text.
    public static func read() -> Content {
        let pasteboard = NSPasteboard.general
        var html = pasteboard.string(forType: .html)
        if html == nil, let data = pasteboard.data(forType: webArchive) {
            html = htmlFromWebArchive(data)
        }
        if html == nil, let rtf = pasteboard.data(forType: .rtf) ?? pasteboard.data(forType: .rtfd) {
            html = htmlFromRTF(rtf)
        }
        return Content(html: html, text: pasteboard.string(forType: .string))
    }

    private static func htmlFromWebArchive(_ data: Data) -> String? {
        guard
            let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
            let main = plist["WebMainResource"] as? [String: Any],
            let resource = main["WebResourceData"] as? Data
        else { return nil }
        return String(data: resource, encoding: .utf8) ?? String(data: resource, encoding: .isoLatin1)
    }

    private static func htmlFromRTF(_ data: Data) -> String? {
        let attributed = NSAttributedString(rtf: data, documentAttributes: nil) ?? NSAttributedString(rtfd: data, documentAttributes: nil)
        guard let attributed else { return nil }
        let range = NSRange(location: 0, length: attributed.length)
        guard let out = try? attributed.data(from: range, documentAttributes: [.documentType: NSAttributedString.DocumentType.html]) else {
            return nil
        }
        return String(data: out, encoding: .utf8)
    }

    /// Puts HTML (when there is any) and plain text on the clipboard as one item.
    public static func write(html: String, text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        let item = NSPasteboardItem()
        if !html.isEmpty {
            item.setString(html, forType: .html)
        }
        item.setString(text, forType: .string)
        pasteboard.writeObjects([item])
    }

    public static var canPaste: Bool { AXIsProcessTrusted() }

    /// Presses Cmd+V in the frontmost app. Waits until Shift, Control and Option are
    /// released first: a hotkey still held down would turn Cmd+V into another command,
    /// e.g. Mail's Paste and Match Style, which drops bold, italic and lists.
    public static func pasteIntoFrontmostApp(completion: @escaping (Bool) -> Void) {
        guard canPaste else {
            completion(false)
            return
        }
        let held: NSEvent.ModifierFlags = [.shift, .control, .option, .command]
        let deadline = Date().addingTimeInterval(1.5)
        func attempt() {
            if !NSEvent.modifierFlags.intersection(held).isEmpty && Date() < deadline {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { attempt() }
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                let source = CGEventSource(stateID: .combinedSessionState)
                for down in [true, false] {
                    let event = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: down) // 9 = V
                    event?.flags = .maskCommand
                    event?.post(tap: .cghidEventTap)
                }
                completion(true)
            }
        }
        attempt()
    }
}
