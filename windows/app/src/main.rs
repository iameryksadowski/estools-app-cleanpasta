#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use cleanpasta_platform::{self as platform, Settings};
use std::sync::{
    atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering},
    Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

type Result<T> = std::result::Result<T, String>;
struct State {
    settings: Mutex<Settings>,
    busy: AtomicBool,
    hud: AtomicU64,
    target: AtomicIsize,
    startup_error: Mutex<Option<String>>,
    show_about: AtomicBool,
}
fn show_settings(app: &tauri::AppHandle, about: bool) {
    app.state::<State>()
        .show_about
        .store(about, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("show-about", about);
    }
}
fn hud(app: &tauri::AppHandle, message: &str) {
    let generation = app.state::<State>().hud.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(window) = app.get_webview_window("hud") {
        let _ = window.eval(format!(
            "document.getElementById('message').textContent={}",
            serde_json::to_string(message).unwrap()
        ));
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let position = monitor.position();
            let scale = monitor.scale_factor();
            let _ = window.set_position(tauri::PhysicalPosition::new(
                position.x + (size.width as i32 - (420.0 * scale) as i32) / 2,
                position.y + size.height as i32 - (180.0 * scale) as i32,
            ));
        }
        let _ = window.show();
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        if app.state::<State>().hud.load(Ordering::SeqCst) == generation {
            if let Some(window) = app.get_webview_window("hud") {
                let _ = window.hide();
            }
        }
    });
}
fn clipboard_action(app: &tauri::AppHandle, paste: bool, restore_target: bool) {
    if app.state::<State>().busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let result = (|| -> Result<()> {
            let settings = app
                .state::<State>()
                .settings
                .lock()
                .map_err(|e| e.to_string())?
                .clone();
            let input = platform::read_clipboard()?;
            if let Some(result) = cleanpasta_core::convert(
                input.html.as_deref(),
                input.text.as_deref(),
                &settings.options,
            )? {
                platform::write_clipboard(&result)?;
            } else if !paste {
                return Err("Nothing to clean. Copy some text first.".into());
            }
            if paste {
                if restore_target {
                    platform::restore_foreground(
                        app.state::<State>().target.load(Ordering::SeqCst),
                    )?;
                }
                platform::paste()?;
            } else if settings.show_feedback {
                hud(&app, "Clipboard repaired - paste with Ctrl+V");
            }
            Ok(())
        })();
        if let Err(error) = result {
            hud(&app, &error);
        }
        app.state::<State>().busy.store(false, Ordering::SeqCst);
    });
}
fn register_shortcuts(app: &tauri::AppHandle, settings: &Settings) -> Result<()> {
    let mut shortcuts = Vec::new();
    for (value, paste) in [
        (&settings.paste_shortcut, true),
        (&settings.repair_shortcut, false),
    ] {
        if value.is_empty() {
            continue;
        }
        let shortcut: Shortcut = value
            .parse()
            .map_err(|e| format!("Invalid shortcut: {e}"))?;
        if shortcuts.contains(&shortcut) {
            return Err("Choose different shortcuts for Paste Clean and Repair Clipboard".into());
        }
        shortcuts.push(shortcut);
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    clipboard_action(app, paste, false);
                }
            })
            .map_err(|e| {
                format!("Shortcut {value} is unavailable. Choose another shortcut: {e}")
            })?;
    }
    Ok(())
}
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Result<serde_json::Value> {
    let state = app.state::<State>();
    Ok(
        serde_json::json!({"settings": state.settings.lock().map_err(|e| e.to_string())?.clone(),
        "openAtLogin": app.autolaunch().is_enabled().map_err(|e| e.to_string())?,
        "startupError": state.startup_error.lock().map_err(|e| e.to_string())?.clone(),
        "version": app.package_info().version.to_string(), "updatesConfigured": updates_configured(), "showAbout": state.show_about.load(Ordering::SeqCst)}),
    )
}
#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings, open_at_login: bool) -> Result<()> {
    if settings.options.font_size > 72 {
        return Err("Font size must be from 0 to 72".into());
    }
    let state = app.state::<State>();
    let mut current = state.settings.lock().map_err(|e| e.to_string())?;
    let previous_login = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
    let apply = (|| -> Result<()> {
        app.global_shortcut()
            .unregister_all()
            .map_err(|e| e.to_string())?;
        register_shortcuts(&app, &settings)?;
        if open_at_login {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        }
        .map_err(|e| e.to_string())?;
        platform::save_settings(&settings)
    })();
    if let Err(error) = apply {
        let _ = app.global_shortcut().unregister_all();
        let _ = register_shortcuts(&app, &current);
        if previous_login {
            let _ = app.autolaunch().enable();
        } else {
            let _ = app.autolaunch().disable();
        }
        return Err(error);
    }
    *current = settings;
    *state.startup_error.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}
#[tauri::command]
fn install_cli(app: tauri::AppHandle) -> Result<String> {
    let source = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("cleanpasta.exe");
    platform::install_cli(&source)
}
fn updates_configured() -> bool {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    !config["plugins"]["updater"]["pubkey"]
        .as_str()
        .unwrap_or("")
        .starts_with("REPLACE_")
}
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<serde_json::Value> {
    if !updates_configured() {
        return Err(
            "Updates are not configured in this preview. Use the installer supplied by Eryk."
                .into(),
        );
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update
        .map(|u| serde_json::json!({"version": u.version, "body": u.body}))
        .unwrap_or(serde_json::Value::Null))
}
#[tauri::command]
async fn install_update(app: tauri::AppHandle, version: String) -> Result<()> {
    if !updates_configured() {
        return Err("Updates are not configured".into());
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;
    if update.version != version {
        return Err("The available update changed. Check again to review its changelog.".into());
    }
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}
fn handle_link(app: &tauri::AppHandle, value: &str) {
    if let Ok(url) = url::Url::parse(value) {
        if url.scheme() != "cleanpasta" || !url.username().is_empty() || url.port().is_some() {
            return;
        }
        match url.host_str() {
            Some("paste") => clipboard_action(app, true, false),
            Some("repair") => clipboard_action(app, false, false),
            Some("settings") => show_settings(app, false),
            Some("about") => show_settings(app, true),
            _ => {}
        }
    }
}
fn main() {
    let loaded = platform::settings();
    let startup_error = loaded.as_ref().err().cloned();
    tauri::Builder::default()
        .manage(State {
            settings: Mutex::new(loaded.unwrap_or_default()),
            busy: AtomicBool::new(false),
            hud: AtomicU64::new(0),
            target: AtomicIsize::new(0),
            startup_error: Mutex::new(startup_error),
            show_about: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            install_cli,
            check_update,
            install_update
        ])
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let handle = app.handle();
            let settings = handle.state::<State>().settings.lock().unwrap().clone();
            if let Err(error) = register_shortcuts(handle, &settings) {
                let _ = handle.global_shortcut().unregister_all();
                *handle.state::<State>().startup_error.lock().unwrap() = Some(error);
                show_settings(handle, false);
            }
            let items = [
                ("paste", "Paste Clean"),
                ("repair", "Repair Clipboard"),
                ("settings", "Settings"),
                ("about", "About"),
                ("quit", "Quit"),
            ]
            .into_iter()
            .map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>))
            .collect::<tauri::Result<Vec<_>>>()?;
            let menu = Menu::new(app)?;
            for item in &items {
                menu.append(item)?;
            }
            let theme = app
                .get_webview_window("settings")
                .and_then(|window| window.theme().ok())
                .unwrap_or(tauri::Theme::Light);
            let icon_bytes: &[u8] = if theme == tauri::Theme::Dark {
                include_bytes!("../icons/icon-dark.png")
            } else {
                include_bytes!("../icons/icon.png")
            };
            let icon = tauri::image::Image::from_bytes(icon_bytes)?;
            TrayIconBuilder::with_id("cleanpasta")
                .icon(icon)
                .tooltip("ES Tools Cleanpasta")
                .menu(&menu)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button_state: tauri::tray::MouseButtonState::Down,
                        ..
                    } = event
                    {
                        tray.app_handle()
                            .state::<State>()
                            .target
                            .store(platform::foreground(), Ordering::SeqCst);
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "paste" => clipboard_action(app, true, true),
                    "repair" => clipboard_action(app, false, false),
                    "settings" => show_settings(app, false),
                    "about" => show_settings(app, true),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            let settings_window = app.get_webview_window("settings").unwrap();
            let handle = app.handle().clone();
            settings_window.on_window_event(move |event| {
                if let tauri::WindowEvent::ThemeChanged(theme) = event {
                    let bytes: &[u8] = if *theme == tauri::Theme::Dark {
                        include_bytes!("../icons/icon-dark.png")
                    } else {
                        include_bytes!("../icons/icon.png")
                    };
                    if let (Some(tray), Ok(icon)) = (
                        handle.tray_by_id("cleanpasta"),
                        tauri::image::Image::from_bytes(bytes),
                    ) {
                        let _ = tray.set_icon(Some(icon));
                    }
                }
            });
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_link(&handle, url.as_str());
                }
            });
            let links = app.deep_link().get_current()?.unwrap_or_default();
            let started_from_link = !links.is_empty();
            for url in links {
                handle_link(app.handle(), url.as_str());
            }
            if !started_from_link && !platform::settings_path().exists() {
                show_settings(app.handle(), false);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not start ES Tools Cleanpasta");
}
