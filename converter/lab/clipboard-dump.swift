// Clipboard dump: saves every type on the clipboard to a folder, one file per type,
// plus types.txt with the list and sizes. Read only - the clipboard is not changed.
//
//   swift scripts/clipboard-dump.swift OUT_DIR

import AppKit

guard CommandLine.arguments.count > 1 else {
  FileHandle.standardError.write("usage: clipboard-dump OUT_DIR\n".data(using: .utf8)!)
  exit(1)
}
let out = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

let pasteboard = NSPasteboard.general
var summary = ["changeCount \(pasteboard.changeCount)"]
for (index, item) in (pasteboard.pasteboardItems ?? []).enumerated() {
  for type in item.types {
    let data = item.data(forType: type) ?? Data()
    summary.append("item \(index)  \(type.rawValue)  \(data.count) bytes")
    let safe = type.rawValue.replacingOccurrences(of: "[^A-Za-z0-9.-]", with: "_", options: .regularExpression)
    try? data.write(to: out.appendingPathComponent("\(index)-\(safe)"))
    // Web archives are binary plists; save the main resource HTML next to them.
    if type.rawValue == "Apple Web Archive pasteboard type" || type.rawValue == "com.apple.webarchive",
      let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
      let main = plist["WebMainResource"] as? [String: Any],
      let html = main["WebResourceData"] as? Data
    {
      try? html.write(to: out.appendingPathComponent("\(index)-\(safe).main.html"))
    }
  }
}
try? (summary.joined(separator: "\n") + "\n").write(
  to: out.appendingPathComponent("types.txt"), atomically: true, encoding: .utf8)
print(summary.joined(separator: "\n"))
