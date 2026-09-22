#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_voice;

use native_voice::NativeVoiceState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(NativeVoiceState::default())
        .invoke_handler(tauri::generate_handler![
            native_voice::native_voice_join,
            native_voice::native_voice_leave,
            native_voice::native_voice_snapshot,
            native_voice::native_voice_set_muted,
            native_voice::native_voice_set_deafened,
            native_voice::native_voice_set_processing,
            native_voice::native_voice_switch_input,
            native_voice::native_voice_switch_output,
            native_voice::native_voice_set_participant_muted,
        ])
        .run(tauri::generate_context!())
        .expect("ShakeChat desktop başlatılamadı");
}
