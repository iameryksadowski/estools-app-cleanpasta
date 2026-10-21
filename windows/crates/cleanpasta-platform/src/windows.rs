use super::*;
use clipboard_win::{formats, raw, Clipboard};
use std::time::{Duration, Instant};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;

pub fn read_clipboard() -> Result<ClipboardContent> {
    let _lock = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    let html = formats::Html::new().and_then(|format| {
        if raw::size(format.code()).is_some_and(|n| n.get() > 16 * 1024 * 1024) {
            return None;
        }
        let bytes: Vec<u8> = clipboard_win::get(formats::RawData(format.code())).ok()?;
        super::html_fragment(&bytes)
    });
    let text = clipboard_win::get::<String, _>(formats::Unicode).ok();
    Ok(ClipboardContent { html, text })
}
pub fn write_clipboard(content: &Content) -> Result<()> {
    let _lock = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    let html = formats::Html::new().ok_or("Cannot register HTML clipboard format")?;
    raw::empty().map_err(|e| e.to_string())?;
    // Empty only once: both CF_UNICODETEXT and CF_HTML must survive the write.
    raw::set_string_with(
        &content.text.replace('\n', "\r\n"),
        clipboard_win::options::NoClear,
    )
    .map_err(|e| e.to_string())?;
    if !content.html.is_empty() {
        raw::set_html(html.code(), &content.html).map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn paste() -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(3);
    let modifiers = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN];
    while modifiers
        .iter()
        .any(|key| unsafe { GetAsyncKeyState(*key as i32) < 0 })
    {
        if Instant::now() >= deadline {
            return Err("Release modifier keys, then paste with Ctrl+V".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    std::thread::sleep(Duration::from_millis(40));
    let key = |code, flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                dwFlags: flags,
                ..Default::default()
            },
        },
    };
    let events = [
        key(VK_CONTROL, 0),
        key(0x56, 0),
        key(0x56, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            events.len() as u32,
            events.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent != events.len() as u32 {
        // Avoid a stuck Ctrl if only part of the input was accepted.
        let release = [key(0x56, KEYEVENTF_KEYUP), key(VK_CONTROL, KEYEVENTF_KEYUP)];
        unsafe {
            SendInput(2, release.as_ptr(), std::mem::size_of::<INPUT>() as i32);
        }
        return Err("Windows blocked input. Paste with Ctrl+V; elevated apps may require matching privileges".into());
    }
    Ok(())
}
pub fn install_cli(source: &std::path::Path) -> Result<String> {
    use winreg::{enums::*, RegKey};
    let bin = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?)
        .join("ES Tools")
        .join("Cleanpasta")
        .join("bin");
    std::fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
    std::fs::copy(source, bin.join("cleanpasta.exe")).map_err(|e| e.to_string())?;
    let environment = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| e.to_string())?;
    let previous: String = match environment.get_value("Path") {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    let entry = bin.to_string_lossy();
    if !previous
        .split(';')
        .any(|part| part.trim().eq_ignore_ascii_case(&entry))
    {
        let path = format!(
            "{}{}{}",
            previous,
            if previous.is_empty() { "" } else { ";" },
            entry
        );
        // REG_EXPAND_SZ preserves existing %VARIABLE% entries.
        let bytes = path
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        environment
            .set_raw_value(
                "Path",
                &winreg::RegValue {
                    vtype: REG_EXPAND_SZ,
                    bytes,
                },
            )
            .map_err(|e| e.to_string())?;
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let name: Vec<u16> = "Environment\0".encode_utf16().collect();
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                name.as_ptr() as isize,
                SMTO_ABORTIFHUNG,
                1000,
                std::ptr::null_mut(),
            );
        }
    }
    Ok(format!(
        "Installed to {}. Open a new terminal to use cleanpasta --help.",
        bin.display()
    ))
}

pub fn foreground() -> isize {
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as isize }
}
pub fn restore_foreground(target: isize) -> Result<()> {
    if target == 0 {
        return Err("Click the destination app and paste with Ctrl+V".into());
    }
    unsafe {
        if windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(target as _) == 0 {
            return Err("Cannot focus the destination app. Paste with Ctrl+V".into());
        }
    }
    Ok(())
}
