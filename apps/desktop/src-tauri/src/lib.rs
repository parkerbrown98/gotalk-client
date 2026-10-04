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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![secret_get, secret_set, secret_delete])
        .run(tauri::generate_context!())
        .expect("error while running the Gotalk desktop app");
}
