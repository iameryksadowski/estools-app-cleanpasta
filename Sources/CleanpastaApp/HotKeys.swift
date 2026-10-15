import AppKit
import Carbon.HIToolbox

/// System-wide hotkeys through the Carbon hotkey API: works without Accessibility
/// access and without a Dock icon.
final class HotKeys {
    static let shared = HotKeys()

    enum Action: UInt32 {
        case pasteClean = 1
        case repairClipboard = 2
    }

    private var refs: [UInt32: EventHotKeyRef] = [:]
    private var handlers: [UInt32: () -> Void] = [:]
    private var handlerInstalled = false
    /// While a shortcut field is recording, hotkeys are paused so the keys can be captured.
    var paused = false {
        didSet { onPauseChange?(paused) }
    }
    var onPauseChange: ((Bool) -> Void)?

    @discardableResult
    func register(_ action: Action, shortcut: Shortcut?, handler: @escaping () -> Void) -> Bool {
        unregister(action)
        guard let shortcut else { return true }
        installHandler()
        var ref: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x4553_4350), id: action.rawValue) // "ESCP"
        let status = RegisterEventHotKey(shortcut.keyCode, shortcut.carbonModifiers, id, GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref else { return false }
        refs[action.rawValue] = ref
        handlers[action.rawValue] = handler
        return true
    }

    func unregister(_ action: Action) {
        if let ref = refs.removeValue(forKey: action.rawValue) {
            UnregisterEventHotKey(ref)
        }
        handlers[action.rawValue] = nil
    }

    private func installHandler() {
        guard !handlerInstalled else { return }
        handlerInstalled = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            DispatchQueue.main.async {
                let center = HotKeys.shared
                if !center.paused { center.handlers[id.id]?() }
            }
            return noErr
        }, 1, &spec, nil, nil)
    }
}
