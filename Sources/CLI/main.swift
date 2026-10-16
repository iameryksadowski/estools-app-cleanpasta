import AppKit
import CleanpastaCore

// cleanpasta - the ES Tools Cleanpasta command line tool. Same cleaning as the app
// and the Raycast extension; meant for people, scripts and AI assistants.

let version = "1.1.1"

let usage = """
cleanpasta \(version) - ES Tools Cleanpasta

Cleans formatted text: keeps bold, italic, links, lists, line breaks and non-breaking
spaces; drops backgrounds, colors and fonts; turns Markdown into formatted text and
typographic dashes and quotes into keyboard characters.

Usage:
  cleanpasta [FILE] [options]

Input: FILE, or standard input when piped, or the clipboard.
  --markdown          read the input as Markdown (default for .md files)
  --html              read the input as HTML (default for .html files)
  --text              read the input as plain text (Markdown detected automatically)
  --body              Markdown drafts: skip YAML front matter and notes after the first ---
  --json-input        the input is JSON {"html": ..., "text": ...}, like clipboard content

Output:
  --copy              put the result on the clipboard (HTML and plain text)
  --paste             put it on the clipboard and press Cmd+V in the frontmost app
                      (needs Accessibility access for the app running this command)
  --repair            clean the clipboard in place (same as Repair Clipboard in the app)
  --print FORMAT      html (default), text or json; with --copy, --paste or --repair
                      nothing is printed unless --print is given

Options:
  --keep-dashes       keep em and en dashes
  --keep-quotes       keep typographic quotes
  --font-size N       font size in px on every line (default: the app setting, 12);
                      0 leaves the size to the target app
  --version, --help

Exit codes: 0 done, 1 usage or read error, 2 nothing to clean, 3 no Accessibility access.

Examples:
  cleanpasta draft.md --body --copy       mail draft to the clipboard, ready for Cmd+V
  pbpaste | cleanpasta --text --print text
  cleanpasta --repair                     fix the clipboard, then paste anywhere
"""

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data("cleanpasta: \(message)\n".utf8))
    exit(code)
}

enum Kind { case auto, markdown, html, text, json }

var file: String?
var kind = Kind.auto
var body = false
var copy = false
var paste = false
var repair = false
var printFormat: String?
// Defaults follow the app's settings, so the CLI and the app clean the same way.
let appDefaults = UserDefaults(suiteName: "com.eryksadowski.estools.cleanpaste")
var options = CleanOptions(
    replaceDashes: appDefaults?.object(forKey: "replaceDashes") as? Bool ?? true,
    replaceQuotes: appDefaults?.object(forKey: "replaceQuotes") as? Bool ?? true,
    fontSize: appDefaults?.object(forKey: "fontSize") as? Int ?? 12
)

var args = Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
    let arg = args.removeFirst()
    switch arg {
    case "--help", "-h": print(usage); exit(0)
    case "--version", "-v": print(version); exit(0)
    case "--markdown", "--md": kind = .markdown
    case "--html": kind = .html
    case "--text": kind = .text
    case "--json-input": kind = .json
    case "--body": body = true
    case "--copy": copy = true
    case "--paste": paste = true
    case "--repair": repair = true
    case "--keep-dashes": options.replaceDashes = false
    case "--keep-quotes": options.replaceQuotes = false
    case "--print":
        guard let value = args.first, ["html", "text", "json"].contains(value) else { fail("--print needs html, text or json") }
        printFormat = args.removeFirst()
    case "--font-size":
        guard let value = args.first, let size = Int(value), size >= 0, size <= 72 else { fail("--font-size needs a number from 0 to 72") }
        args.removeFirst()
        options.fontSize = size
    default:
        if arg.hasPrefix("-") && arg != "-" { fail("unknown option \(arg) (see --help)") }
        if file != nil { fail("only one FILE") }
        file = arg
    }
}

let converter = Converter.shared
guard converter.isReady else { fail("converter not available: \(converter.loadError ?? "unknown")") }
if repair && file != nil { fail("--repair works on the clipboard, not on a FILE") }

// Read the input.
var html: String?
var text: String?
func assign(_ content: String) {
    switch kind {
    case .html: html = content
    case .json:
        guard let object = try? JSONSerialization.jsonObject(with: Data(content.utf8)) as? [String: Any] else { fail("--json-input needs a JSON object") }
        html = object["html"] as? String
        text = object["text"] as? String
    default: text = content
    }
}
if let file, file != "-" {
    guard let data = FileManager.default.contents(atPath: file), let content = String(data: data, encoding: .utf8) else {
        fail("cannot read \(file)")
    }
    let ext = (file as NSString).pathExtension.lowercased()
    if kind == .auto { kind = ["md", "markdown"].contains(ext) ? .markdown : ["html", "htm"].contains(ext) ? .html : .text }
    assign(content)
} else if !repair && (file == "-" || isatty(FileHandle.standardInput.fileDescriptor) == 0) {
    assign(String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self))
} else {
    let clipboard = Clipboard.read()
    switch kind {
    case .html: html = clipboard.html
    case .markdown, .text: text = clipboard.text
    case .auto, .json: html = clipboard.html; text = clipboard.text
    }
}

if body, let source = text { text = converter.markdownBody(source) }

// Clean.
let input: Converter.Input = kind == .markdown ? .markdown(text ?? "") : .content(html: html, text: text)
guard let result = converter.clean(input, options: options) else { fail("nothing to clean", code: 2) }

// Output.
func emit(_ format: String) {
    switch format {
    case "text":
        print(result.text, terminator: result.text.hasSuffix("\n") ? "" : "\n")
    case "json":
        let object = ["html": result.html, "text": result.text]
        if let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) {
            print(String(decoding: data, as: UTF8.self))
        }
    default:
        print(result.html.isEmpty ? result.text : result.html)
    }
}

if copy || paste || repair {
    Clipboard.write(html: result.html, text: result.text)
    if let printFormat { emit(printFormat) }
    if paste {
        var finished = false
        var pasted = false
        Clipboard.pasteIntoFrontmostApp { ok in
            pasted = ok
            finished = true
        }
        while !finished { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        if !pasted {
            fail("copied, but pasting needs Accessibility access (System Settings > Privacy & Security > Accessibility)", code: 3)
        }
    }
} else {
    emit(printFormat ?? "html")
}
exit(0)
