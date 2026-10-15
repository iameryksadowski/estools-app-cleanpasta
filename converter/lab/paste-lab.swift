// Paste lab: pastes into an offscreen WebKit editor - the engine behind the Apple Mail
// compose window - and prints the HTML the editor ends up with.
//
//   swift scripts/paste-lab.swift [paste|match|plain|wk]
//       pastes the current clipboard (read only, never written)
//   swift scripts/paste-lab.swift [paste|match|plain|wk] --html FILE [--text FILE]
//       pastes the given content from a private pasteboard; the clipboard is untouched
//       (wk can only paste from the clipboard: it is saved first and restored after)
//
// Modes:
//   paste  Edit > Paste, Cmd+V in Mail (legacy WebKit, WebHTMLView)
//   match  Edit > Paste and Match Style, Cmd+Option+Shift+V in Mail
//   plain  paste as plain text
//   wk     Edit > Paste in WKWebView (the modern WebKit editor)
//
// --png FILE also saves a picture of the editor after the paste.

import AppKit
import WebKit

var mode = "paste"
var htmlFile: String?
var textFile: String?
var pngFile: String?
var args = Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
  let arg = args.removeFirst()
  switch arg {
  case "--html": htmlFile = args.isEmpty ? nil : args.removeFirst()
  case "--text": textFile = args.isEmpty ? nil : args.removeFirst()
  case "--png": pngFile = args.isEmpty ? nil : args.removeFirst()
  default: mode = arg
  }
}

// The user's clipboard while wk mode borrows it.
var savedClipboard: [NSPasteboardItem]?

func restoreClipboard() {
  guard let saved = savedClipboard else { return }
  NSPasteboard.general.clearContents()
  NSPasteboard.general.writeObjects(saved)
  savedClipboard = nil
}

func fail(_ message: String) -> Never {
  restoreClipboard()
  FileHandle.standardError.write("paste-lab: \(message)\n".data(using: .utf8)!)
  exit(1)
}

func finish(_ html: String) -> Never {
  restoreClipboard()
  print(html)
  exit(0)
}

// Content to paste: a private pasteboard with the same types the extension writes,
// or the general clipboard.
let pasteboard: NSPasteboard
if let htmlFile {
  if mode == "wk" {
    savedClipboard = NSPasteboard.general.pasteboardItems?.map { item in
      let copy = NSPasteboardItem()
      for type in item.types {
        if let data = item.data(forType: type) { copy.setData(data, forType: type) }
      }
      return copy
    }
    pasteboard = NSPasteboard.general
  } else {
    pasteboard = NSPasteboard(name: NSPasteboard.Name("tools.eryksadowski.clean-paste.lab"))
  }
  pasteboard.clearContents()
  guard let html = try? String(contentsOfFile: htmlFile, encoding: .utf8) else { fail("cannot read \(htmlFile)") }
  pasteboard.setString(html, forType: .html)
  if let textFile, let text = try? String(contentsOfFile: textFile, encoding: .utf8) {
    pasteboard.setString(text, forType: .string)
  }
} else {
  pasteboard = NSPasteboard.general
}

// Mail's compose body: default font from the Mail settings, editable document.
let page = """
  <!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family: 'Helvetica Neue'; font-size: 12px; word-wrap: break-word; margin: 12px 16px; background: #fff; color: #000;"><div><br></div></body></html>
  """

final class LegacyLab: NSObject, WebFrameLoadDelegate {
  let webView = WebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
  let window = NSWindow(
    contentRect: NSRect(x: -3000, y: -3000, width: 800, height: 600), styleMask: [.titled], backing: .buffered,
    defer: false)

  func start() {
    webView.frameLoadDelegate = self
    webView.isEditable = true
    window.contentView = webView
    webView.mainFrame.loadHTMLString(page, baseURL: nil)
  }

  func webView(_ sender: WebView!, didFinishLoadFor frame: WebFrame!) {
    guard frame == sender.mainFrame else { return }
    window.makeFirstResponder(webView.mainFrame.frameView.documentView)
    _ = webView.stringByEvaluatingJavaScript(
      from:
        "var r=document.createRange();r.setStart(document.body.firstChild,0);var s=getSelection();s.removeAllRanges();s.addRange(r);"
    )
    if pasteboard == NSPasteboard.general && mode == "paste" {
      webView.paste(nil)
    } else if pasteboard == NSPasteboard.general && mode == "plain" {
      webView.pasteAsPlainText(nil)
    } else {
      insert(allowPlainText: true, plainOnly: mode == "plain", matchStyle: mode == "match")
    }
    if let pngFile { snapshot(to: pngFile) }
    finish(webView.stringByEvaluatingJavaScript(from: "document.body.innerHTML") ?? "")
  }

  func snapshot(to path: String) {
    let height = Double(webView.stringByEvaluatingJavaScript(from: "document.body.scrollHeight") ?? "") ?? 600
    let size = NSSize(width: 800, height: min(max(height + 24, 200), 4000))
    window.setContentSize(size)
    webView.frame = NSRect(origin: .zero, size: size)
    webView.layoutSubtreeIfNeeded()
    guard let rep = webView.bitmapImageRepForCachingDisplay(in: webView.bounds) else { return }
    webView.cacheDisplay(in: webView.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
  }

  // The path WebHTMLView takes for paste: build a fragment from the pasteboard, then
  // replace the selection with it (matchStyle = YES for Paste and Match Style).
  func insert(allowPlainText: Bool, plainOnly: Bool, matchStyle: Bool) {
    guard let docView: NSObject = webView.mainFrame.frameView.documentView,
      let range = webView.selectedDOMRange
    else { fail("no editable selection") }
    var fragment: DOMDocumentFragment?
    if plainOnly {
      let text = pasteboard.string(forType: .string) ?? ""
      fragment = webView.mainFrame.domDocument.createDocumentFragment()
      let lines = text.components(separatedBy: "\n")
      for line in lines {
        let div = webView.mainFrame.domDocument.createElement("div")!
        div.appendChild(line.isEmpty ? webView.mainFrame.domDocument.createElement("br") : webView.mainFrame.domDocument.createTextNode(line))
        fragment?.appendChild(div)
      }
    } else {
      let getFragment = NSSelectorFromString("_documentFragmentFromPasteboard:inContext:allowPlainText:")
      typealias FragmentFn = @convention(c) (AnyObject, Selector, NSPasteboard, DOMRange, Bool) -> DOMDocumentFragment?
      let fragmentFn = unsafeBitCast(docView.method(for: getFragment), to: FragmentFn.self)
      fragment = fragmentFn(docView, getFragment, pasteboard, range, allowPlainText)
    }
    guard let fragment else { fail("nothing readable on the pasteboard") }
    let replace = NSSelectorFromString("_replaceSelectionWithFragment:selectReplacement:smartReplace:matchStyle:")
    typealias ReplaceFn = @convention(c) (AnyObject, Selector, DOMDocumentFragment, Bool, Bool, Bool) -> Void
    let replaceFn = unsafeBitCast(webView.mainFrame.method(for: replace), to: ReplaceFn.self)
    replaceFn(webView.mainFrame, replace, fragment, false, false, matchStyle)
  }
}

final class ModernLab: NSObject, WKNavigationDelegate {
  let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
  let window = NSWindow(
    contentRect: NSRect(x: -3000, y: -3000, width: 800, height: 600), styleMask: [.titled], backing: .buffered,
    defer: false)

  func start() {
    webView.navigationDelegate = self
    window.contentView = webView
    webView.loadHTMLString(page.replacingOccurrences(of: "<body ", with: "<body contenteditable=\"true\" "), baseURL: nil)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    window.makeFirstResponder(webView)
    webView.evaluateJavaScript(
      "document.body.focus();var r=document.createRange();r.setStart(document.body.firstChild,0);var s=getSelection();s.removeAllRanges();s.addRange(r);"
    ) { _, _ in
      NSApp.sendAction(NSSelectorFromString("paste:"), to: webView, from: nil)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        webView.evaluateJavaScript("document.body.innerHTML") { result, _ in finish(result as? String ?? "") }
      }
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let lab: AnyObject
if mode == "wk" {
  let modern = ModernLab()
  modern.start()
  lab = modern
} else {
  let legacy = LegacyLab()
  legacy.start()
  lab = legacy
}
DispatchQueue.main.asyncAfter(deadline: .now() + 10) { fail("timed out") }
withExtendedLifetime(lab) { app.run() }
