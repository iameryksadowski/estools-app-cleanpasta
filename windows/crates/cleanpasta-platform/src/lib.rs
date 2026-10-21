use cleanpasta_core::{Content, Options};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Default)]
pub struct ClipboardContent {
    pub html: Option<String>,
    pub text: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    #[serde(flatten)]
    pub options: Options,
    pub paste_shortcut: String,
    pub repair_shortcut: String,
    pub show_feedback: bool,
    pub auto_updates: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            options: Options::default(),
            paste_shortcut: "Ctrl+Alt+Shift+V".into(),
            repair_shortcut: String::new(),
            show_feedback: true,
            auto_updates: false,
        }
    }
}
pub fn settings_path() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("estools-cleanpasta")
        .join("settings.json")
}
pub fn settings() -> Result<Settings> {
    match std::fs::read(settings_path()) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("Cannot read settings: {e}"))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(e.to_string()),
    }
}
pub fn save_settings(settings: &Settings) -> Result<()> {
    let path = settings_path();
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, serde_json::to_vec_pretty(settings).unwrap())
        .map_err(|e| e.to_string())?;
    std::fs::rename(&temp, path).map_err(|e| e.to_string())
}
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;
#[cfg(not(windows))]
pub fn read_clipboard() -> Result<ClipboardContent> {
    Err("Clipboard is available in the Windows build only".into())
}
#[cfg(not(windows))]
pub fn write_clipboard(_: &Content) -> Result<()> {
    Err("Clipboard is available in the Windows build only".into())
}
#[cfg(not(windows))]
pub fn paste() -> Result<()> {
    Err("SendInput is available in the Windows build only".into())
}
#[cfg(not(windows))]
pub fn install_cli(_: &std::path::Path) -> Result<String> {
    Err("PATH installation is available on Windows only".into())
}

// CF_HTML offsets are byte offsets into untrusted UTF-8 clipboard data.
pub fn html_fragment(bytes: &[u8]) -> Option<String> {
    let header = std::str::from_utf8(bytes).ok()?;
    let offset = |key: &str| {
        header
            .lines()
            .take_while(|line| !line.starts_with('<'))
            .find_map(|line| line.strip_prefix(key))
            .and_then(|s| s.trim().parse::<usize>().ok())
    };
    let start = offset("StartFragment:")?;
    let end = offset("EndFragment:")?;
    std::str::from_utf8(bytes.get(start..end)?)
        .ok()
        .map(str::to_owned)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_offsets() {
        assert_eq!(
            html_fragment(b"StartFragment:999999999\r\nEndFragment:9999999999\r\n<x>"),
            None
        );
        assert_eq!(
            html_fragment(b"StartFragment:20\r\nEndFragment:1\r\n"),
            None
        );
        let header = "StartFragment:0000000051\r\nEndFragment:0000000056\r\n";
        let start = header.len();
        let source = format!(
            "StartFragment:{start:010}\r\nEndFragment:{:010}\r\n<p>x</p>",
            start + 8
        );
        assert_eq!(
            html_fragment(source.as_bytes()).as_deref(),
            Some("<p>x</p>")
        );
    }
}

#[cfg(not(windows))]
pub fn foreground() -> isize {
    0
}
#[cfg(not(windows))]
pub fn restore_foreground(_: isize) -> Result<()> {
    Err("Windows only".into())
}
