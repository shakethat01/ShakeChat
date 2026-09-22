use livekit::{options::{AudioEncoding, TrackPublishOptions}, prelude::*};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioProcessing {
    pub echo_cancellation: bool,
    pub noise_suppression: bool,
    pub auto_gain_control: bool,
}

impl Default for NativeAudioProcessing {
    fn default() -> Self {
        Self { echo_cancellation: true, noise_suppression: true, auto_gain_control: true }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioDevice { pub device_id: String, pub label: String }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVoiceParticipant {
    pub identity: String, pub name: String, pub local: bool, pub speaking: bool,
    pub muted: bool, pub camera: bool, pub screen: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVoiceSnapshot {
    pub status: String, pub channel_id: String, pub participants: Vec<NativeVoiceParticipant>,
    pub muted: bool, pub deafened: bool, pub can_speak: bool,
    pub input_devices: Vec<NativeAudioDevice>, pub output_devices: Vec<NativeAudioDevice>,
    pub input_device_id: String, pub output_device_id: String, pub engine: String,
}

struct Inner {
    room: Option<Room>, audio: Option<PlatformAudio>, mic_track: Option<LocalAudioTrack>,
    room_events: Option<tauri::async_runtime::JoinHandle<()>>,
    channel_id: String, can_speak: bool, muted: bool, deafened: bool,
    input_device_id: String, output_device_id: String, processing: NativeAudioProcessing,
}

impl Default for Inner {
    fn default() -> Self {
        Self { room: None, audio: None, mic_track: None, room_events: None, channel_id: String::new(),
            can_speak: false, muted: true, deafened: false, input_device_id: String::new(),
            output_device_id: String::new(), processing: NativeAudioProcessing::default() }
    }
}

#[derive(Default)]
pub struct NativeVoiceState { inner: Mutex<Inner> }

fn map_error(context: &str, error: impl std::fmt::Display) -> String { format!("{context}: {error}") }

fn configure_processing(audio: &PlatformAudio, processing: NativeAudioProcessing) -> Result<(), String> {
    audio.configure_audio_processing(AudioProcessingOptions {
        echo_cancellation: processing.echo_cancellation,
        noise_suppression: processing.noise_suppression,
        auto_gain_control: processing.auto_gain_control,
        prefer_hardware_processing: false,
    }).map_err(|error| map_error("Yerel ses işleme ayarlanamadı", error))
}

fn set_remote_audio_enabled(room: &Room, enabled: bool) {
    for participant in room.remote_participants().values() {
        for publication in participant.track_publications().values() {
            if !matches!(publication.source(), TrackSource::Microphone | TrackSource::ScreenshareAudio) { continue; }
            if let Some(track) = publication.track() { if enabled { track.enable(); } else { track.disable(); } }
        }
    }
}

async fn close_previous(inner: &mut Inner) -> Option<Room> {
    if let Some(task) = inner.room_events.take() { task.abort(); }
    inner.mic_track = None; inner.audio = None; inner.channel_id.clear(); inner.can_speak = false;
    inner.deafened = false; inner.room.take()
}

#[tauri::command]
pub async fn native_voice_join(state: State<'_, NativeVoiceState>, url: String, token: String,
    channel_id: String, can_speak: bool, processing: Option<NativeAudioProcessing>, start_muted: Option<bool>) -> Result<(), String> {
    let old_room = { let mut inner = state.inner.lock().await; close_previous(&mut inner).await };
    if let Some(room) = old_room { let _ = room.close().await; }
    let processing = processing.unwrap_or_default();
    let audio = PlatformAudio::new().map_err(|error| map_error("Windows yerel ses motoru açılamadı", error))?;
    configure_processing(&audio, processing)?;
    let input_device_id = audio.recording_devices().next().map(|d| d.id.to_string()).unwrap_or_default();
    let output_device_id = audio.playout_devices().next().map(|d| d.id.to_string()).unwrap_or_default();
    let (room, mut events) = Room::connect(&url, &token, RoomOptions::default()).await
        .map_err(|error| map_error("LiveKit ses odasına bağlanılamadı", error))?;
    let event_task = tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });
    let start_muted = start_muted.unwrap_or(false);
    let mic_track = if can_speak {
        let track = LocalAudioTrack::create_audio_track("shakechat-microphone", audio.rtc_source());
        if start_muted { track.mute(); }
        let publish = TrackPublishOptions { source: TrackSource::Microphone, dtx: false, red: true,
            audio_encoding: Some(AudioEncoding { max_bitrate: 192_000 }), ..Default::default() };
        room.local_participant().publish_track(LocalTrack::Audio(track.clone()), publish).await
            .map_err(|error| map_error("Yerel mikrofon yayınlanamadı", error))?;
        Some(track)
    } else { None };
    let mut inner = state.inner.lock().await;
    inner.room = Some(room); inner.audio = Some(audio); inner.mic_track = mic_track; inner.room_events = Some(event_task);
    inner.channel_id = channel_id; inner.can_speak = can_speak; inner.muted = start_muted || !can_speak;
    inner.deafened = false; inner.input_device_id = input_device_id; inner.output_device_id = output_device_id;
    inner.processing = processing; Ok(())
}

#[tauri::command]
pub async fn native_voice_leave(state: State<'_, NativeVoiceState>) -> Result<(), String> {
    let old_room = { let mut inner = state.inner.lock().await; close_previous(&mut inner).await };
    if let Some(room) = old_room { room.close().await.map_err(|e| map_error("Ses odasından çıkılamadı", e))?; } Ok(())
}

#[tauri::command]
pub async fn native_voice_set_muted(state: State<'_, NativeVoiceState>, muted: bool) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    if !inner.can_speak && !muted { return Err("Bu ses kanalında konuşma yetkin yok.".into()); }
    let Some(track) = inner.mic_track.as_ref() else { inner.muted = true; return if muted { Ok(()) } else { Err("Yerel mikrofon hazır değil.".into()) }; };
    if muted { track.mute(); } else { track.unmute(); } inner.muted = muted; Ok(())
}

#[tauri::command]
pub async fn native_voice_set_deafened(state: State<'_, NativeVoiceState>, deafened: bool) -> Result<(), String> {
    let mut inner = state.inner.lock().await; if let Some(room) = inner.room.as_ref() { set_remote_audio_enabled(room, !deafened); }
    inner.deafened = deafened; Ok(())
}

#[tauri::command]
pub async fn native_voice_set_processing(state: State<'_, NativeVoiceState>, processing: NativeAudioProcessing) -> Result<(), String> {
    let mut inner = state.inner.lock().await; if let Some(audio) = inner.audio.as_ref() { configure_processing(audio, processing)?; }
    inner.processing = processing; Ok(())
}

#[tauri::command]
pub async fn native_voice_switch_input(state: State<'_, NativeVoiceState>, device_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().await; let Some(audio) = inner.audio.as_ref() else { return Err("Yerel ses motoru bağlı değil.".into()); };
    let device = audio.recording_devices().find(|d| d.id.as_str() == device_id).ok_or_else(|| "Mikrofon cihazı bulunamadı.".to_string())?;
    audio.switch_recording_device(&device.id).map_err(|e| map_error("Mikrofon değiştirilemedi", e))?; inner.input_device_id = device_id; Ok(())
}

#[tauri::command]
pub async fn native_voice_switch_output(state: State<'_, NativeVoiceState>, device_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().await; let Some(audio) = inner.audio.as_ref() else { return Err("Yerel ses motoru bağlı değil.".into()); };
    let device = audio.playout_devices().find(|d| d.id.as_str() == device_id).ok_or_else(|| "Hoparlör cihazı bulunamadı.".to_string())?;
    audio.switch_playout_device(&device.id).map_err(|e| map_error("Hoparlör değiştirilemedi", e))?; inner.output_device_id = device_id; Ok(())
}

#[tauri::command]
pub async fn native_voice_set_participant_muted(state: State<'_, NativeVoiceState>, identity: String, muted: bool) -> Result<(), String> {
    let inner = state.inner.lock().await; let Some(room) = inner.room.as_ref() else { return Err("Ses odasına bağlı değilsin.".into()); };
    let participant = room.remote_participants().into_values().find(|p| p.identity().to_string() == identity).ok_or_else(|| "Kullanıcı ses odasında bulunamadı.".to_string())?;
    for publication in participant.track_publications().values() {
        if !matches!(publication.source(), TrackSource::Microphone | TrackSource::ScreenshareAudio) { continue; }
        if let Some(track) = publication.track() { if muted { track.disable(); } else if !inner.deafened { track.enable(); } }
    } Ok(())
}

#[tauri::command]
pub async fn native_voice_snapshot(state: State<'_, NativeVoiceState>) -> Result<NativeVoiceSnapshot, String> {
    let inner = state.inner.lock().await; let Some(room) = inner.room.as_ref() else {
        return Ok(NativeVoiceSnapshot { status: "disconnected".into(), channel_id: String::new(), participants: Vec::new(),
            muted: inner.muted, deafened: inner.deafened, can_speak: false, input_devices: Vec::new(), output_devices: Vec::new(),
            input_device_id: inner.input_device_id.clone(), output_device_id: inner.output_device_id.clone(), engine: "native-webrtc-apm".into() }); };
    let mut participants = Vec::new(); let local = room.local_participant(); let local_name = local.name(); let local_identity = local.identity().to_string();
    participants.push(NativeVoiceParticipant { identity: local_identity.clone(), name: if local_name.trim().is_empty() { local_identity } else { local_name },
        local: true, speaking: local.is_speaking(), muted: inner.mic_track.as_ref().map(LocalAudioTrack::is_muted).unwrap_or(true), camera: false, screen: false });
    for participant in room.remote_participants().values() {
        let publications = participant.track_publications(); let mic = publications.values().find(|p| p.source() == TrackSource::Microphone);
        let camera = publications.values().any(|p| p.source() == TrackSource::Camera && !p.is_muted());
        let screen = publications.values().any(|p| p.source() == TrackSource::Screenshare && !p.is_muted());
        let identity = participant.identity().to_string(); let name = participant.name();
        participants.push(NativeVoiceParticipant { identity: identity.clone(), name: if name.trim().is_empty() { identity } else { name }, local: false,
            speaking: participant.is_speaking(), muted: mic.map(|p| p.is_muted()).unwrap_or(true), camera, screen });
    }
    let (input_devices, output_devices) = if let Some(audio) = inner.audio.as_ref() {
        (audio.recording_devices().map(|d| NativeAudioDevice { device_id: d.id.to_string(), label: d.name }).collect(),
         audio.playout_devices().map(|d| NativeAudioDevice { device_id: d.id.to_string(), label: d.name }).collect())
    } else { (Vec::new(), Vec::new()) };
    let status = match room.connection_state() { ConnectionState::Connected => "connected", ConnectionState::Reconnecting => "reconnecting", ConnectionState::Disconnected => "disconnected" };
    Ok(NativeVoiceSnapshot { status: status.into(), channel_id: inner.channel_id.clone(), participants,
        muted: inner.mic_track.as_ref().map(LocalAudioTrack::is_muted).unwrap_or(true), deafened: inner.deafened, can_speak: inner.can_speak,
        input_devices, output_devices, input_device_id: inner.input_device_id.clone(), output_device_id: inner.output_device_id.clone(), engine: "native-webrtc-apm".into() })
}
