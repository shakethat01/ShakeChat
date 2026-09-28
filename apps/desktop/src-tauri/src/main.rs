#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_screen;

use native_screen::NativeScreenState;

fn main() {
    let updater_builder = tauri_plugin_updater::Builder::new();
    let updater_builder = match option_env!("SHAKECHAT_UPDATER_PUBLIC_KEY") {
        Some(pubkey) if !pubkey.trim().is_empty() => updater_builder.pubkey(pubkey),
        _ => updater_builder,
    };

    tauri::Builder::default()
        .manage(NativeScreenState::default())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            native_screen::native_screen_sources,
            native_screen::native_screen_start,
            native_screen::native_screen_stop,
        ])
        .run(tauri::generate_context!())
        .expect("ShakeChat desktop başlatılamadı");
}
