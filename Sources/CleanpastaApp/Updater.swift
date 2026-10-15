import AppKit
import Sparkle

/// In-app updates through Sparkle: once a day the app reads appcast.xml from the latest
/// GitHub release; a new version shows its changelog and installs after the user agrees.
/// Updates are verified with an EdDSA signature; no Apple developer account is involved.
final class Updater: NSObject, SPUUpdaterDelegate, SPUStandardUserDriverDelegate {
    private var controller: SPUStandardUpdaterController?

    /// Only inside the built app: a bare binary has no feed URL or public key.
    var isAvailable: Bool {
        Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil && Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") != nil
    }

    func start() {
        guard isAvailable else { return }
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: self)
    }

    var automaticallyChecks: Bool {
        get { controller?.updater.automaticallyChecksForUpdates ?? false }
        set { controller?.updater.automaticallyChecksForUpdates = newValue }
    }

    var lastCheck: Date? { controller?.updater.lastUpdateCheckDate }

    func checkForUpdates() {
        guard let controller else {
            let alert = NSAlert()
            alert.messageText = "Updates are not available in this build"
            alert.informativeText = "Install Cleanpasta from its release page to get updates."
            alert.runModal()
            return
        }
        DockIcon.show("update")
        controller.checkForUpdates(nil)
    }

    // A menu bar app: reminders come as a gentle alert, the Dock icon appears while
    // the update window is open.
    var supportsGentleScheduledUpdateReminders: Bool { true }

    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        DockIcon.show("update")
    }

    func standardUserDriverWillFinishUpdateSession() {
        DockIcon.hide("update")
    }
}
