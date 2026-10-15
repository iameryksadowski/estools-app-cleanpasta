import Foundation
import JavaScriptCore

/// Cleaning options, the same as the Raycast extension's preferences.
public struct CleanOptions: Equatable {
    /// Replace em dashes, en dashes and similar with a plain hyphen "-".
    public var replaceDashes: Bool
    /// Replace typographic quotes and the curly apostrophe with " and '.
    public var replaceQuotes: Bool
    /// Font size in px on every line (Apple Mail writes 12); 0 keeps the target app's size.
    public var fontSize: Int

    public init(replaceDashes: Bool = true, replaceQuotes: Bool = true, fontSize: Int = 12) {
        self.replaceDashes = replaceDashes
        self.replaceQuotes = replaceQuotes
        self.fontSize = fontSize
    }
}

/// Clean content: HTML for rich text apps and the same content as plain text.
public struct CleanResult: Equatable {
    /// Clean HTML, or "" when the result is a single line of plain text.
    public let html: String
    public let text: String
}

/// Runs the converter shared with the Raycast extension (Resources/convert.js, built
/// from src/lib/convert.ts) in JavaScriptCore, so every ES Tools Cleanpasta product
/// cleans text the same way.
public final class Converter {
    public static let shared = Converter()

    public enum Input {
        /// Clipboard-like content: rich HTML wins, plain text is read as Markdown only
        /// when it clearly is Markdown (the same rule as the Raycast extension).
        case content(html: String?, text: String?)
        /// Markdown source, e.g. a draft written by an AI assistant.
        case markdown(String)
    }

    private let context: JSContext
    private let api: JSValue?
    public private(set) var loadError: String?

    private init() {
        context = JSContext()
        var lastError: String?
        context.exceptionHandler = { _, exception in
            lastError = exception?.toString()
        }
        if let url = Converter.scriptURL(), let source = try? String(contentsOf: url, encoding: .utf8) {
            context.evaluateScript(source, withSourceURL: url)
        } else {
            lastError = "convert.js not found"
        }
        let api = context.objectForKeyedSubscript("Cleanpasta")
        self.api = (api?.isObject ?? false) ? api : nil
        loadError = self.api == nil ? (lastError ?? "converter did not load") : nil
    }

    public var isReady: Bool { api != nil }

    /// convert.js: CLEANPASTA_CONVERTER, the app's Resources, the Resources folder next
    /// to a helper binary (Contents/Helpers -> Contents/Resources), or the package
    /// sources during development.
    static func scriptURL() -> URL? {
        let fm = FileManager.default
        var candidates: [URL] = []
        if let path = ProcessInfo.processInfo.environment["CLEANPASTA_CONVERTER"] {
            candidates.append(URL(fileURLWithPath: path))
        }
        if let url = Bundle.main.url(forResource: "convert", withExtension: "js") {
            candidates.append(url)
        }
        let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        candidates.append(executable.deletingLastPathComponent().appendingPathComponent("../Resources/convert.js").standardized)
        candidates.append(URL(fileURLWithPath: #filePath).appendingPathComponent("../../../Resources/convert.js").standardized)
        return candidates.first { fm.fileExists(atPath: $0.path) }
    }

    public func clean(_ input: Input, options: CleanOptions = CleanOptions()) -> CleanResult? {
        guard let api else { return nil }
        let jsOptions: [String: Any] = [
            "replaceDashes": options.replaceDashes,
            "replaceQuotes": options.replaceQuotes,
            "fontSize": options.fontSize,
        ]
        let value: JSValue?
        switch input {
        case let .content(html, text):
            var content: [String: Any] = [:]
            if let html, !html.isEmpty { content["html"] = html }
            if let text, !text.isEmpty { content["text"] = text }
            if content.isEmpty { return nil }
            value = api.forProperty("cleanContent")?.call(withArguments: [content, jsOptions])
        case let .markdown(source):
            if source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
            value = api.forProperty("cleanMarkdown")?.call(withArguments: [source, jsOptions])
        }
        guard let value, value.isObject else { return nil }
        let html = value.forProperty("html")?.toString() ?? ""
        let text = value.forProperty("text")?.toString() ?? ""
        if html.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
        return CleanResult(html: html, text: text)
    }

    /// Body of a Markdown draft: without YAML front matter, up to the first "---" rule.
    public func markdownBody(_ markdown: String) -> String {
        api?.forProperty("markdownBody")?.call(withArguments: [markdown])?.toString() ?? markdown
    }
}
