#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod native_screen;
mod native_screen_preview;
mod native_voice;
mod screen_audio;
mod microphone_permissions;

use native_screen::NativeScreenState;
use native_voice::NativeVoiceState;

fn main() {
    let updater_builder = tauri_plugin_updater::Builder::new();
    let updater_builder = match option_env!("SHAKECHAT_UPDATER_PUBLIC_KEY") {
        Some(pubkey) if !pubkey.trim().is_empty() => updater_builder.pubkey(pubkey),
        _ => updater_builder,
    };

    tauri::Builder::default()
        .manage(NativeScreenState::default())
        .manage(NativeVoiceState::default())
        .plugin(updater_builder.build())
        .invoke_handler(tauri::generate_handler![
            native_voice::native_voice_join,
            native_voice::native_voice_leave,
            native_voice::native_voice_set_muted,
            native_voice::native_voice_set_deafened,
            native_voice::native_voice_set_processing,
            native_voice::native_voice_switch_input,
            native_voice::native_voice_switch_output,
            native_voice::native_voice_set_participant_muted,
            native_voice::native_voice_snapshot,
            native_screen::native_screen_sources,
            native_screen_preview::native_screen_preview,
            screen_audio::native_screen_audio_target,
            native_screen::native_screen_start,
            native_screen::native_screen_stop,
            native_screen::native_screen_update,
            native_screen::native_screen_audio_pause,
            native_screen::native_screen_active,
            microphone_permissions::reset_microphone_permission,
            microphone_permissions::open_microphone_privacy_settings,
        ])
        .run(tauri::generate_context!())
        .expect("ShakeChat desktop başlatılamadı");
}
