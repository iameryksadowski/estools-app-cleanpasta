import Foundation

/// File operations shared by settings and rename migration. Paths are explicit so
/// failures can be tested without changing the user's command line installation.
public enum CLIInstallation {
    public static func install(helper: URL, folder: URL) throws {
        let fm = FileManager.default
        guard fm.isExecutableFile(atPath: helper.path) else {
            throw CocoaError(.fileNoSuchFile)
        }
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let link = folder.appendingPathComponent("cleanpasta")
        if let destination = try? fm.destinationOfSymbolicLink(atPath: link.path) {
            if destination == helper.path { return }
            let target = URL(fileURLWithPath: destination, relativeTo: folder).standardizedFileURL
            let parts = target.pathComponents
            guard parts.count >= 4,
                  ["Cleanpasta.app", "Clean Paste.app"].contains(parts[parts.count - 4]),
                  Array(parts.suffix(3).prefix(2)) == ["Contents", "Helpers"],
                  ["cleanpasta", "cleanpaste"].contains(target.lastPathComponent) else {
                throw CocoaError(.fileWriteFileExists)
            }
            // Create first, then replace atomically, so a failed install keeps the old link.
            let temporary = folder.appendingPathComponent(".cleanpasta-" + UUID().uuidString)
            defer { try? fm.removeItem(at: temporary) }
            try fm.createSymbolicLink(at: temporary, withDestinationURL: helper)
            guard rename(temporary.path, link.path) == 0 else {
                throw CocoaError(.fileWriteUnknown)
            }
        } else {
            // Creating a symlink fails if a regular file already exists. Never delete it.
            try fm.createSymbolicLink(at: link, withDestinationURL: helper)
        }
    }
    /// Migration keeps the old command available until the new command is installed.
    public static func migrate(legacyLinks: [URL], helper: URL, folder: URL) throws {
        try install(helper: helper, folder: folder)
        for link in legacyLinks { try FileManager.default.removeItem(at: link) }
    }

}
