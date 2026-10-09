use keyring::Entry;

const SERVICE: &str = "io.gotalk.desktop";
const KEY_PREFIX: &str = "gotalk.session.";

/// The web app stores one refresh-token record per instance here. Only its own key space is reachable.
fn entry(key: &str) -> Result<Entry, String> {
    if !key.starts_with(KEY_PREFIX) || key.len() > 256 {
        return Err("invalid key".into());
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The webview's default user agent with `Gotalk/<version> (<os>)` appended, so the server can tell the
/// desktop app apart from a browser (packages/core `describeUserAgent`). Tauri can only replace the user
/// agent, so this rebuilds the default: WebKit's is frozen on macOS and Linux, and WebView2's follows its
/// Edge version. `None` keeps the webview's own when that version is unknown.
#[cfg(desktop)]
fn user_agent(version: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    let (base, os) = (
        Some("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)".to_owned()),
        "macos",
    );
    #[cfg(target_os = "windows")]
    let (base, os) = (
        tauri::webview_version().ok().and_then(|v| v.split('.').next().map(str::to_owned)).map(|major| {
            format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0")
        }),
        "windows",
    );
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let (base, os) = (
        Some(format!("Mozilla/5.0 (X11; Linux {}) AppleWebKit/605.1.15 (KHTML, like Gecko)", std::env::consts::ARCH)),
        "linux",
    );
    base.map(|base| format!("{base} Gotalk/{version} ({os})"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init());
    builder
        .invoke_handler(tauri::generate_handler![secret_get, secret_set, secret_delete])
        .setup(|app| {
            // The main window is created here (it has `create: false`) so its frame can differ per OS.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .ok_or("tauri.conf.json has no main window")?
                .clone();
            let builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            // macOS keeps its traffic lights, overlaid on the web title bar (titleBarStyle: Overlay).
            // Elsewhere the native frame goes and the web title bar draws its own window controls.
            #[cfg(all(desktop, not(target_os = "macos")))]
            let builder = builder.decorations(false);
            // No browser chrome: link previews on force click (macOS) and form suggestions (WebView2).
            #[cfg(target_os = "macos")]
            let builder = builder.allow_link_preview(false);
            let builder = builder.general_autofill_enabled(false);
            #[cfg(desktop)]
            let builder = match user_agent(&app.package_info().version.to_string()) {
                Some(ua) => builder.user_agent(&ua),
                None => builder,
            };
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Gotalk desktop app");
}
