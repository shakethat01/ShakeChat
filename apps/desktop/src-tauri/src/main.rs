#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let updater_builder = tauri_plugin_updater::Builder::new();
    let updater_builder = match option_env!("SHAKECHAT_UPDATER_PUBLIC_KEY") {
        Some(pubkey) if !pubkey.trim().is_empty() => updater_builder.pubkey(pubkey),
        _ => updater_builder,
    };

    tauri::Builder::default()
        .plugin(updater_builder.build())
        .run(tauri::generate_context!())
        .expect("ShakeChat desktop başlatılamadı");
}
