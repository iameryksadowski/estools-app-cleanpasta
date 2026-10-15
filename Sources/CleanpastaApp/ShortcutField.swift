import AppKit
import Carbon.HIToolbox
import SwiftUI

/// A shortcut field: click it, press the keys. Esc cancels, Delete clears.
struct ShortcutField: NSViewRepresentable {
    @Binding var shortcut: Shortcut?

    func makeNSView(context: Context) -> RecorderView {
        let view = RecorderView()
        view.onChange = { shortcut = $0 }
        view.shortcut = shortcut
        return view
    }

    func updateNSView(_ view: RecorderView, context: Context) {
        view.onChange = { shortcut = $0 }
        if !view.isRecording { view.shortcut = shortcut }
    }
}

/// A shortcut field with a button that removes the shortcut (no shortcut is fine:
/// the command still works from the menu bar icon).
struct ShortcutRow: View {
    @Binding var shortcut: Shortcut?

    var body: some View {
        HStack(spacing: 6) {
            ShortcutField(shortcut: $shortcut).frame(width: 150, height: 24)
            Button {
                shortcut = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Remove the shortcut")
            .opacity(shortcut == nil ? 0 : 1)
            .disabled(shortcut == nil)
            .accessibilityLabel("Remove the shortcut")
        }
    }
}

final class RecorderView: NSView {
    var onChange: ((Shortcut?) -> Void)?
    var shortcut: Shortcut? { didSet { needsDisplay = true } }
    private(set) var isRecording = false { didSet { needsDisplay = true } }

    override var intrinsicContentSize: NSSize { NSSize(width: 150, height: 24) }
    override var acceptsFirstResponder: Bool { true }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        isRecording = true
        HotKeys.shared.paused = true
    }

    override func resignFirstResponder() -> Bool {
        stopRecording()
        return true
    }

    private func stopRecording() {
        isRecording = false
        HotKeys.shared.paused = false
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard isRecording else { return false }
        keyDown(with: event)
        return true
    }

    override func keyDown(with event: NSEvent) {
        guard isRecording else {
            super.keyDown(with: event)
            return
        }
        let code = Int(event.keyCode)
        let flags = event.modifierFlags.intersection([.command, .option, .control, .shift])
        if code == kVK_Escape && flags.isEmpty {
            stopRecording()
            return
        }
        if (code == kVK_Delete || code == kVK_ForwardDelete) && flags.isEmpty {
            shortcut = nil
            onChange?(nil)
            stopRecording()
            return
        }
        // A global shortcut needs Command, Option or Control, otherwise it would take
        // over normal typing.
        guard !flags.intersection([.command, .option, .control]).isEmpty else {
            NSSound.beep()
            return
        }
        let key = RecorderView.label(for: event)
        let recorded = Shortcut(keyCode: UInt32(event.keyCode), modifiers: flags.rawValue, key: key)
        shortcut = recorded
        onChange?(recorded)
        stopRecording()
        window?.makeFirstResponder(nil)
    }

    private static func label(for event: NSEvent) -> String {
        switch Int(event.keyCode) {
        case kVK_Space: return "Space"
        case kVK_Return: return "Return"
        case kVK_Tab: return "Tab"
        case kVK_LeftArrow: return "←"
        case kVK_RightArrow: return "→"
        case kVK_UpArrow: return "↑"
        case kVK_DownArrow: return "↓"
        default:
            let chars = event.charactersIgnoringModifiers?.uppercased() ?? ""
            return chars.isEmpty ? "Key \(event.keyCode)" : chars
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6)
        (isRecording ? NSColor.controlAccentColor.withAlphaComponent(0.12) : NSColor.controlBackgroundColor).setFill()
        path.fill()
        (isRecording ? NSColor.controlAccentColor : NSColor.separatorColor).setStroke()
        path.lineWidth = 1
        path.stroke()

        let text: String
        let color: NSColor
        if isRecording {
            text = "Type a shortcut"
            color = .secondaryLabelColor
        } else if let shortcut {
            text = shortcut.display
            color = .labelColor
        } else {
            text = "Click to record"
            color = .tertiaryLabelColor
        }
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: shortcut != nil && !isRecording ? .medium : .regular),
            .foregroundColor: color,
        ]
        let size = text.size(withAttributes: attributes)
        text.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2), withAttributes: attributes)
    }
}
