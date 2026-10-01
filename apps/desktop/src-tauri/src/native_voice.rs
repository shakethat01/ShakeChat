use futures_util::StreamExt;
use livekit::{
    options::{AudioEncoding, TrackPublishOptions},
    prelude::*,
    webrtc::{
        audio_frame::AudioFrame,
        audio_source::{native::NativeAudioSource, AudioSourceOptions, RtcAudioSource},
        audio_stream::native::NativeAudioStream,
    },
};
use nnnoiseless::DenoiseState;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        atomic::{AtomicBool, AtomicI32, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 1;
const FRAME_SIZE: usize = DenoiseState::FRAME_SIZE;
const SPEECH_HOLD_FRAMES: u8 = 14;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioProcessing {
    pub echo_cancellation: bool,
    pub noise_suppression: bool,
    pub auto_gain_control: bool,
    #[serde(default)]
    pub noise_gate_enabled: bool,
    #[serde(default = "default_noise_gate_threshold")]
    pub noise_gate_threshold: i32,
}

fn default_noise_gate_threshold() -> i32 { -48 }

impl Default for NativeAudioProcessing {
    fn default() -> Self {
        Self {
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: false,
            noise_gate_enabled: true,
            noise_gate_threshold: default_noise_gate_threshold(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioDevice { pub device_id: String, pub label: String }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVoiceParticipant {
    pub identity: String,
    pub name: String,
    pub local: bool,
    pub speaking: bool,
    pub muted: bool,
    pub camera: bool,
    pub screen: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVoiceSnapshot {
    pub status: String,
    pub channel_id: String,
    pub participants: Vec<NativeVoiceParticipant>,
    pub muted: bool,
    pub deafened: bool,
    pub can_speak: bool,
    pub input_devices: Vec<NativeAudioDevice>,
    pub output_devices: Vec<NativeAudioDevice>,
    pub input_device_id: String,
    pub output_device_id: String,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMicLevelEvent { speaking: bool, level_db: f32 }

struct Inner {
    room: Option<Room>,
    mic_track: Option<LocalAudioTrack>,
    room_events: Option<tauri::async_runtime::JoinHandle<()>>,

    // Persistent Windows microphone engine. It survives room-to-room switches so
    // WASAPI does not reopen/reset the selected device every time a channel changes.
    audio: Option<PlatformAudio>,
    capture_track: Option<LocalAudioTrack>,
    processor_task: Option<tauri::async_runtime::JoinHandle<()>>,
    output_sink: Arc<parking_lot::RwLock<Option<NativeAudioSource>>>,
    rnnoise_enabled: Arc<AtomicBool>,
    gate_enabled: Arc<AtomicBool>,
    gate_threshold: Arc<AtomicI32>,
    mic_muted: Arc<AtomicBool>,

    active_speakers: Arc<parking_lot::RwLock<HashSet<String>>>,
    channel_id: String,
    can_speak: bool,
    muted: bool,
    deafened: bool,
    input_device_id: String,
    output_device_id: String,
    processing: NativeAudioProcessing,
}

impl Default for Inner {
    fn default() -> Self {
        Self {
            room: None,
            mic_track: None,
            room_events: None,
            audio: None,
            capture_track: None,
            processor_task: None,
            output_sink: Arc::new(parking_lot::RwLock::new(None)),
            rnnoise_enabled: Arc::new(AtomicBool::new(true)),
            gate_enabled: Arc::new(AtomicBool::new(true)),
            gate_threshold: Arc::new(AtomicI32::new(default_noise_gate_threshold())),
            mic_muted: Arc::new(AtomicBool::new(true)),
            active_speakers: Arc::new(parking_lot::RwLock::new(HashSet::new())),
            channel_id: String::new(),
            can_speak: false,
            muted: true,
            deafened: false,
            input_device_id: String::new(),
            output_device_id: String::new(),
            processing: NativeAudioProcessing::default(),
        }
    }
}

#[derive(Default)]
pub struct NativeVoiceState { inner: Mutex<Inner> }

fn map_error(context: &str, error: impl std::fmt::Display) -> String { format!("{context}: {error}") }

fn owner_identity(identity: &str) -> String {
    identity.strip_prefix("audio:")
        .or_else(|| identity.strip_prefix("screen:"))
        .unwrap_or(identity)
        .to_string()
}

fn configure_processing(audio: &PlatformAudio, processing: NativeAudioProcessing) -> Result<(), String> {
    // EXACT desktop pipeline contract:
    // WASAPI mic -> WebRTC AEC ONLY -> RNNoise -> VAD/gate -> compressor/limiter -> LiveKit.
    // WebRTC NS and AGC stay off; those stages otherwise fight RNNoise and change gain unpredictably.
    audio.configure_audio_processing(AudioProcessingOptions {
        echo_cancellation: processing.echo_cancellation,
        noise_suppression: false,
        auto_gain_control: false,
        prefer_hardware_processing: false,
    }).map_err(|error| map_error("Yerel AEC ayarlanamadı", error))
}

fn frame_db_f32(samples: &[f32]) -> f32 {
    if samples.is_empty() { return -90.0; }
    let mean_square = samples.iter().map(|sample| {
        let value = *sample as f64 / i16::MAX as f64;
        value * value
    }).sum::<f64>() / samples.len() as f64;
    if mean_square <= 1.0e-12 { -90.0 } else { (20.0 * mean_square.sqrt().log10()) as f32 }
}

fn compressor_limiter(samples: &mut [f32]) {
    // Voice-focused gentle compressor (~-18 dB threshold, 3:1) followed by
    // modest makeup and a -1 dBFS hard safety limiter. Input/output use i16 scale.
    const THRESHOLD: f32 = 0.1259;
    const RATIO: f32 = 3.0;
    const MAKEUP: f32 = 1.25;
    const LIMIT: f32 = 0.8913;
    for sample in samples {
        let normalized = (*sample / i16::MAX as f32).clamp(-1.0, 1.0);
        let sign = normalized.signum();
        let magnitude = normalized.abs();
        let compressed = if magnitude > THRESHOLD {
            THRESHOLD + (magnitude - THRESHOLD) / RATIO
        } else {
            magnitude
        };
        *sample = (sign * compressed * MAKEUP).clamp(-LIMIT, LIMIT) * i16::MAX as f32;
    }
}

fn set_remote_audio_enabled(room: &Room, enabled: bool) {
    for participant in room.remote_participants().values() {
        for publication in participant.track_publications().values() {
            if !matches!(publication.source(), TrackSource::Microphone | TrackSource::ScreenshareAudio) { continue; }
            if let Some(track) = publication.track() { if enabled { track.enable(); } else { track.disable(); } }
        }
    }
}

fn update_processing_flags(inner: &Inner, processing: NativeAudioProcessing) {
    inner.rnnoise_enabled.store(processing.noise_suppression, Ordering::Relaxed);
    inner.gate_enabled.store(processing.noise_gate_enabled, Ordering::Relaxed);
    inner.gate_threshold.store(processing.noise_gate_threshold.clamp(-70, -25), Ordering::Relaxed);
}

fn ensure_engine(app: &AppHandle, inner: &mut Inner, processing: NativeAudioProcessing) -> Result<(), String> {
    if let Some(audio) = inner.audio.as_ref() {
        configure_processing(audio, processing)?;
        update_processing_flags(inner, processing);
        inner.processing = processing;
        return Ok(());
    }

    let audio = PlatformAudio::new().map_err(|error| map_error("Windows WASAPI ses motoru açılamadı", error))?;
    configure_processing(&audio, processing)?;
    let input_device_id = audio.recording_devices().next().map(|device| device.id.to_string()).unwrap_or_default();
    let output_device_id = audio.playout_devices().next().map(|device| device.id.to_string()).unwrap_or_default();

    let capture_track = LocalAudioTrack::create_audio_track("shakechat-mic-capture", audio.rtc_source());
    let mut stream = NativeAudioStream::new(capture_track.rtc_track(), SAMPLE_RATE, CHANNELS);
    let sink = inner.output_sink.clone();
    let rnnoise_enabled = inner.rnnoise_enabled.clone();
    let gate_enabled = inner.gate_enabled.clone();
    let gate_threshold = inner.gate_threshold.clone();
    let muted = inner.mic_muted.clone();
    let meter_app = app.clone();

    let processor_task = tauri::async_runtime::spawn(async move {
        let mut denoise = DenoiseState::new();
        let mut queue = VecDeque::<i16>::with_capacity(FRAME_SIZE * 8);
        let mut in_frame = [0.0f32; FRAME_SIZE];
        let mut out_frame = [0.0f32; FRAME_SIZE];
        let mut first_rnnoise_frame = true;
        let mut speech_hold: u8 = 0;
        let mut last_speaking = false;

        while let Some(frame) = stream.next().await {
            queue.extend(frame.data.iter().copied());
            while queue.len() >= FRAME_SIZE {
                for value in &mut in_frame {
                    *value = queue.pop_front().unwrap_or(0) as f32;
                }

                let vad_probability = if rnnoise_enabled.load(Ordering::Relaxed) {
                    let vad = denoise.process_frame(&mut out_frame, &in_frame);
                    if first_rnnoise_frame {
                        out_frame.fill(0.0);
                        first_rnnoise_frame = false;
                    }
                    vad
                } else {
                    out_frame.copy_from_slice(&in_frame);
                    1.0
                };

                let level_db = frame_db_f32(&out_frame);
                let gate_on = gate_enabled.load(Ordering::Relaxed);
                let threshold = gate_threshold.load(Ordering::Relaxed) as f32;
                let voice_now = !gate_on || ((vad_probability >= 0.35 && level_db >= threshold) || level_db >= threshold + 12.0);
                if voice_now {
                    speech_hold = SPEECH_HOLD_FRAMES;
                } else if speech_hold > 0 {
                    speech_hold -= 1;
                }
                let speaking = speech_hold > 0 && !muted.load(Ordering::Relaxed);
                if gate_on && speech_hold == 0 {
                    out_frame.fill(0.0);
                } else {
                    compressor_limiter(&mut out_frame);
                }

                if speaking != last_speaking {
                    last_speaking = speaking;
                    let _ = meter_app.emit("shakechat:voice-mic-level", NativeMicLevelEvent { speaking, level_db });
                }

                let target = sink.read().clone();
                if let Some(source) = target {
                    let samples = out_frame.iter().map(|sample| sample.clamp(i16::MIN as f32, i16::MAX as f32).round() as i16).collect::<Vec<_>>();
                    let audio_frame = AudioFrame {
                        data: samples.into(),
                        sample_rate: SAMPLE_RATE,
                        num_channels: CHANNELS,
                        samples_per_channel: FRAME_SIZE as u32,
                    };
                    let _ = source.capture_frame(&audio_frame).await;
                }
            }
        }
        if last_speaking {
            let _ = meter_app.emit("shakechat:voice-mic-level", NativeMicLevelEvent { speaking: false, level_db: -90.0 });
        }
    });

    inner.audio = Some(audio);
    inner.capture_track = Some(capture_track);
    inner.processor_task = Some(processor_task);
    inner.input_device_id = input_device_id;
    inner.output_device_id = output_device_id;
    inner.processing = processing;
    update_processing_flags(inner, processing);
    Ok(())
}

fn detach_room(inner: &mut Inner) -> Option<Room> {
    if let Some(task) = inner.room_events.take() { task.abort(); }
    *inner.output_sink.write() = None;
    inner.active_speakers.write().clear();
    inner.mic_track = None;
    inner.channel_id.clear();
    inner.can_speak = false;
    inner.deafened = false;
    inner.muted = true;
    inner.mic_muted.store(true, Ordering::Relaxed);
    inner.room.take()
}

fn shutdown_engine(inner: &mut Inner) {
    *inner.output_sink.write() = None;
    if let Some(task) = inner.processor_task.take() { task.abort(); }
    inner.capture_track = None;
    inner.audio = None;
    inner.input_device_id.clear();
    inner.output_device_id.clear();
}

#[tauri::command]
pub async fn native_voice_join(
    app: AppHandle,
    state: State<'_, NativeVoiceState>,
    url: String,
    token: String,
    channel_id: String,
    can_speak: bool,
    processing: Option<NativeAudioProcessing>,
    start_muted: Option<bool>,
) -> Result<(), String> {
    // Close only the old LiveKit room. Keep WASAPI + capture + RNNoise alive so
    // channel changes do not reset the microphone device or mute state.
    let old_room = {
        let mut inner = state.inner.lock().await;
        detach_room(&mut inner)
    };
    if let Some(room) = old_room { let _ = room.close().await; }

    let processing = processing.unwrap_or_default();
    {
        let mut inner = state.inner.lock().await;
        ensure_engine(&app, &mut inner, processing)?;
    }

    let (room, mut events) = Room::connect(&url, &token, RoomOptions::default()).await
        .map_err(|error| map_error("LiveKit yerel ses odasına bağlanılamadı", error))?;

    let active_speakers = Arc::new(parking_lot::RwLock::new(HashSet::new()));
    let active_speakers_events = active_speakers.clone();
    let event_app = app.clone();
    let event_task = tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                RoomEvent::ActiveSpeakersChanged { speakers } => {
                    let identities = speakers.into_iter().map(|participant| owner_identity(participant.identity().as_str())).collect::<Vec<_>>();
                    {
                        let mut active = active_speakers_events.write();
                        active.clear();
                        active.extend(identities.iter().cloned());
                    }
                    let _ = event_app.emit("shakechat:voice-speakers", identities);
                }
                _ => { let _ = event_app.emit("shakechat:voice-dirty", true); }
            }
        }
    });

    let start_muted = start_muted.unwrap_or(false) || !can_speak;
    let mic_track = if can_speak {
        let source = NativeAudioSource::new(AudioSourceOptions::default(), SAMPLE_RATE, CHANNELS, 100);
        let track = LocalAudioTrack::create_audio_track("shakechat-microphone", RtcAudioSource::Native(source.clone()));
        if start_muted { track.mute(); }
        room.local_participant().publish_track(
            LocalTrack::Audio(track.clone()),
            TrackPublishOptions {
                source: TrackSource::Microphone,
                dtx: false,
                red: true,
                audio_encoding: Some(AudioEncoding { max_bitrate: 192_000 }),
                ..Default::default()
            },
        ).await.map_err(|error| map_error("İşlenmiş yerel mikrofon yayınlanamadı", error))?;
        let mut inner = state.inner.lock().await;
        *inner.output_sink.write() = Some(source);
        drop(inner);
        Some(track)
    } else { None };

    let mut inner = state.inner.lock().await;
    inner.room = Some(room);
    inner.mic_track = mic_track;
    inner.room_events = Some(event_task);
    inner.active_speakers = active_speakers;
    inner.channel_id = channel_id;
    inner.can_speak = can_speak;
    inner.muted = start_muted;
    inner.deafened = false;
    inner.mic_muted.store(start_muted, Ordering::Relaxed);
    inner.processing = processing;
    Ok(())
}

#[tauri::command]
pub async fn native_voice_leave(state: State<'_, NativeVoiceState>) -> Result<(), String> {
    let old_room = {
        let mut inner = state.inner.lock().await;
        let room = detach_room(&mut inner);
        shutdown_engine(&mut inner);
        room
    };
    if let Some(room) = old_room { room.close().await.map_err(|error| map_error("Ses odasından çıkılamadı", error))?; }
    Ok(())
}

#[tauri::command]
pub async fn native_voice_set_muted(state: State<'_, NativeVoiceState>, muted: bool) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    if !inner.can_speak && !muted { return Err("Bu ses kanalında konuşma yetkin yok.".into()); }
    let Some(track) = inner.mic_track.as_ref() else {
        inner.muted = true;
        inner.mic_muted.store(true, Ordering::Relaxed);
        return if muted { Ok(()) } else { Err("Yerel mikrofon hazır değil.".into()) };
    };
    if muted { track.mute(); } else { track.unmute(); }
    inner.muted = muted;
    inner.mic_muted.store(muted, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn native_voice_set_deafened(state: State<'_, NativeVoiceState>, deafened: bool) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    if let Some(room) = inner.room.as_ref() { set_remote_audio_enabled(room, !deafened); }
    inner.deafened = deafened;
    Ok(())
}

#[tauri::command]
pub async fn native_voice_set_processing(state: State<'_, NativeVoiceState>, processing: NativeAudioProcessing) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    if let Some(audio) = inner.audio.as_ref() { configure_processing(audio, processing)?; }
    update_processing_flags(&inner, processing);
    inner.processing = processing;
    Ok(())
}

#[tauri::command]
pub async fn native_voice_switch_input(state: State<'_, NativeVoiceState>, device_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    let Some(audio) = inner.audio.as_ref() else { return Err("Yerel ses motoru bağlı değil.".into()); };
    let device = audio.recording_devices().find(|device| device.id.as_str() == device_id)
        .ok_or_else(|| "Mikrofon cihazı bulunamadı.".to_string())?;
    audio.switch_recording_device(&device.id).map_err(|error| map_error("Mikrofon değiştirilemedi", error))?;
    inner.input_device_id = device_id;
    Ok(())
}

#[tauri::command]
pub async fn native_voice_switch_output(state: State<'_, NativeVoiceState>, device_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    let Some(audio) = inner.audio.as_ref() else { return Err("Yerel ses motoru bağlı değil.".into()); };
    let device = audio.playout_devices().find(|device| device.id.as_str() == device_id)
        .ok_or_else(|| "Hoparlör cihazı bulunamadı.".to_string())?;
    audio.switch_playout_device(&device.id).map_err(|error| map_error("Hoparlör değiştirilemedi", error))?;
    inner.output_device_id = device_id;
    Ok(())
}

#[tauri::command]
pub async fn native_voice_set_participant_muted(state: State<'_, NativeVoiceState>, identity: String, muted: bool) -> Result<(), String> {
    let inner = state.inner.lock().await;
    let Some(room) = inner.room.as_ref() else { return Err("Ses odasına bağlı değilsin.".into()); };
    let participant = room.remote_participants().into_values()
        .find(|participant| owner_identity(participant.identity().as_str()) == identity)
        .ok_or_else(|| "Kullanıcı ses odasında bulunamadı.".to_string())?;
    for publication in participant.track_publications().values() {
        if publication.source() != TrackSource::Microphone { continue; }
        if let Some(track) = publication.track() { if muted { track.disable(); } else if !inner.deafened { track.enable(); } }
    }
    Ok(())
}

#[tauri::command]
pub async fn native_voice_snapshot(state: State<'_, NativeVoiceState>) -> Result<NativeVoiceSnapshot, String> {
    let inner = state.inner.lock().await;
    let (input_devices, output_devices) = if let Some(audio) = inner.audio.as_ref() {
        (
            audio.recording_devices().map(|device| NativeAudioDevice { device_id: device.id.to_string(), label: device.name }).collect(),
            audio.playout_devices().map(|device| NativeAudioDevice { device_id: device.id.to_string(), label: device.name }).collect(),
        )
    } else { (Vec::new(), Vec::new()) };

    let Some(room) = inner.room.as_ref() else {
        return Ok(NativeVoiceSnapshot {
            status: "disconnected".into(), channel_id: String::new(), participants: Vec::new(),
            muted: true, deafened: false, can_speak: false, input_devices, output_devices,
            input_device_id: inner.input_device_id.clone(), output_device_id: inner.output_device_id.clone(),
            engine: "native-wasapi-webrtc-aec-rnnoise-vad-compressor-limiter".into(),
        });
    };

    let active = inner.active_speakers.read().clone();
    let mut merged = HashMap::<String, NativeVoiceParticipant>::new();
    let local = room.local_participant();
    let local_identity = owner_identity(local.identity().as_str());
    merged.insert(local_identity.clone(), NativeVoiceParticipant {
        identity: local_identity.clone(),
        name: if local.name().trim().is_empty() { local_identity.clone() } else { local.name() },
        local: true,
        speaking: false,
        muted: inner.mic_track.as_ref().map(LocalAudioTrack::is_muted).unwrap_or(true),
        camera: false,
        screen: false,
    });

    for participant in room.remote_participants().values() {
        let publications = participant.track_publications();
        let mic = publications.values().find(|publication| publication.source() == TrackSource::Microphone);
        if mic.is_none() { continue; }
        let identity = owner_identity(participant.identity().as_str());
        let name = participant.name();
        merged.insert(identity.clone(), NativeVoiceParticipant {
            identity: identity.clone(),
            name: if name.trim().is_empty() { identity.clone() } else { name },
            local: false,
            speaking: active.contains(&identity),
            muted: mic.map(|publication| publication.is_muted()).unwrap_or(true),
            camera: false,
            screen: false,
        });
    }

    let status = match room.connection_state() {
        ConnectionState::Connected => "connected",
        ConnectionState::Reconnecting => "reconnecting",
        ConnectionState::Disconnected => "disconnected",
    };

    Ok(NativeVoiceSnapshot {
        status: status.into(), channel_id: inner.channel_id.clone(), participants: merged.into_values().collect(),
        muted: inner.mic_track.as_ref().map(LocalAudioTrack::is_muted).unwrap_or(true),
        deafened: inner.deafened, can_speak: inner.can_speak,
        input_devices, output_devices,
        input_device_id: inner.input_device_id.clone(), output_device_id: inner.output_device_id.clone(),
        engine: "native-wasapi-webrtc-aec-rnnoise-vad-compressor-limiter".into(),
    })
}
