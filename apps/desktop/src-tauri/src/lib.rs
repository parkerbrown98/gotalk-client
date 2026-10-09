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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
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
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Gotalk desktop app");
}
