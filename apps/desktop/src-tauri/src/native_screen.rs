use livekit::{
    options::{AudioEncoding, TrackPublishOptions, VideoCodec, VideoEncoding},
    prelude::*,
    webrtc::{
        audio_frame::AudioFrame,
        audio_source::{native::NativeAudioSource, AudioSourceOptions, RtcAudioSource},
        desktop_capturer::{CaptureError, CaptureSource, DesktopCaptureSourceType, DesktopCapturer, DesktopCapturerOptions},
        native::yuv_helper,
        video_frame::{I420Buffer, VideoFrame, VideoRotation},
        video_source::{native::NativeVideoSource, RtcVideoSource, VideoResolution},
    },
};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::State;
use tokio::sync::{mpsc, Mutex};

const SCREEN_AUDIO_SAMPLE_RATE: u32 = 48_000;
const SCREEN_AUDIO_CHANNELS: u32 = 2;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenSource {
    pub id: String,
    pub title: String,
    pub kind: String,
}

struct NativeScreenSession {
    room: Room,
    stop: Arc<AtomicBool>,
    capture_thread: Option<thread::JoinHandle<()>>,
    audio_thread: Option<thread::JoinHandle<()>>,
    audio_task: Option<tauri::async_runtime::JoinHandle<()>>,
    capture_commands: std::sync::mpsc::Sender<CaptureCommand>,
    audio_track: LocalAudioTrack,
    audio_source: NativeAudioSource,
    audio_paused: Arc<AtomicBool>,
    audio_epoch: Arc<AtomicU64>,
    audio_gate: Arc<Mutex<()>>,
}

#[derive(Default)]
pub struct NativeScreenState {
    inner: Mutex<Option<NativeScreenSession>>,
    operation: Mutex<()>,
}

fn map_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

fn source_type(kind: &str) -> Result<DesktopCaptureSourceType, String> {
    match kind {
        "screen" => Ok(DesktopCaptureSourceType::Screen),
        "window" => Ok(DesktopCaptureSourceType::Window),
        _ => Err("Bilinmeyen ekran kaynağı türü.".into()),
    }
}

fn make_capturer(kind: &str) -> Result<DesktopCapturer, String> {
    let mut options = DesktopCapturerOptions::new(source_type(kind)?);
    options.set_include_cursor(true);
    DesktopCapturer::new(options).ok_or_else(|| "Windows ekran yakalama motoru açılamadı.".into())
}

fn pick_source(capturer: &DesktopCapturer, source_id: &str) -> Result<CaptureSource, String> {
    let id = source_id.parse::<u64>().map_err(|_| "Geçersiz ekran kaynağı.".to_string())?;
    capturer
        .get_source_list()
        .into_iter()
        .find(|source| source.id() == id)
        .ok_or_else(|| "Seçilen ekran/pencere artık bulunamıyor.".into())
}

#[tauri::command]
pub async fn native_screen_sources() -> Result<Vec<NativeScreenSource>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut rows = Vec::new();
        for (kind, source_type) in [
            ("screen", DesktopCaptureSourceType::Screen),
            ("window", DesktopCaptureSourceType::Window),
        ] {
            let mut options = DesktopCapturerOptions::new(source_type);
            options.set_include_cursor(true);
            let Some(capturer) = DesktopCapturer::new(options) else { continue };
            rows.extend(capturer.get_source_list().into_iter().map(|source| NativeScreenSource {
                id: source.id().to_string(),
                title: source.title(),
                kind: kind.to_string(),
            }));
        }
        Ok(rows)
    })
    .await
    .map_err(|error| map_error("Ekran kaynakları okunamadı", error))?
}

async fn join_thread(handle: Option<thread::JoinHandle<()>>) {
    if let Some(handle) = handle {
        let _ = tauri::async_runtime::spawn_blocking(move || handle.join()).await;
    }
}

async fn stop_session(state: &NativeScreenState) -> Result<(), String> {
    let old = { state.inner.lock().await.take() };
    if let Some(mut session) = old {
        session.stop.store(true, Ordering::Relaxed);
        if let Some(task) = session.audio_task.take() {
            task.abort();
        }
        join_thread(session.capture_thread.take()).await;
        join_thread(session.audio_thread.take()).await;
        session.room.close().await.map_err(|error| map_error("Ekran yayını kapatılamadı", error))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn native_screen_stop(state: State<'_, NativeScreenState>) -> Result<(), String> {
    let _operation = state.operation.lock().await;
    stop_session(state.inner()).await
}

#[tauri::command]
pub async fn native_screen_start(
    state: State<'_, NativeScreenState>,
    url: String,
    token: String,
    source_kind: String,
    source_id: String,
    width: u32,
    height: u32,
    fps: u32,
) -> Result<(), String> {
    let _operation = state.operation.lock().await;
    stop_session(state.inner()).await?;
    let width = width.clamp(320, 7680);
    let height = height.clamp(240, 4320);
    let fps = fps.clamp(5, 144);
    let audio_target = crate::screen_audio::target_for_start(&source_kind, &source_id)?;

    let (mut capturer, selected) = tauri::async_runtime::spawn_blocking(move || {
        let capturer = make_capturer(&source_kind)?;
        let selected = pick_source(&capturer, &source_id)?;
        Ok::<_, String>((capturer, selected))
    })
    .await
    .map_err(|error| map_error("Ekran kaynağı hazırlanamadı", error))??;

    let mut room_options = RoomOptions::default();
    room_options.auto_subscribe = false;
    let (room, _events) = Room::connect(&url, &token, room_options)
        .await
        .map_err(|error| map_error("LiveKit ekran yayıncısına bağlanılamadı", error))?;

    let video_source = NativeVideoSource::new(VideoResolution { width, height }, true);
    let video_track = LocalVideoTrack::create_video_track(
        "shakechat-screen",
        RtcVideoSource::Native(video_source.clone()),
    );
    let max_bitrate = 14_000_000;
    let video_publish = room.local_participant()
        .publish_track(
            LocalTrack::Video(video_track),
            TrackPublishOptions {
                source: TrackSource::Screenshare,
                video_codec: VideoCodec::H264,
                simulcast: false,
                video_encoding: Some(VideoEncoding {
                    max_bitrate,
                    max_framerate: 144.0,
                }),
                ..Default::default()
            },
        )
        .await;
    if let Err(error) = video_publish {
        let _ = room.close().await;
        return Err(map_error("Native ekran görüntüsü yayınlanamadı", error));
    }

    let screen_audio_source = NativeAudioSource::new(
        AudioSourceOptions::default(),
        SCREEN_AUDIO_SAMPLE_RATE,
        SCREEN_AUDIO_CHANNELS,
        100,
    );
    let screen_audio_track = LocalAudioTrack::create_audio_track(
        "shakechat-screen-audio",
        RtcAudioSource::Native(screen_audio_source.clone()),
    );
    let audio_publish = room.local_participant()
        .publish_track(
            LocalTrack::Audio(screen_audio_track.clone()),
            TrackPublishOptions {
                source: TrackSource::ScreenshareAudio,
                audio_encoding: Some(AudioEncoding { max_bitrate: 192_000 }),
                dtx: false,
                red: false,
                ..Default::default()
            },
        )
        .await;
    if let Err(error) = audio_publish {
        let _ = room.close().await;
        return Err(map_error("Native yayın sesi yayınlanamadı", error));
    }

    let stop = Arc::new(AtomicBool::new(false));
    let audio_paused = Arc::new(AtomicBool::new(false));
    let audio_epoch = Arc::new(AtomicU64::new(0));
    let audio_gate = Arc::new(Mutex::new(()));
    let (audio_tx, mut audio_rx) = mpsc::channel::<(u64, Vec<i16>)>(8);
    let task_audio_source = screen_audio_source.clone();
    let task_paused = audio_paused.clone();
    let task_epoch = audio_epoch.clone();
    let task_gate = audio_gate.clone();
    let audio_task = tauri::async_runtime::spawn(async move {
        while let Some((epoch, samples)) = audio_rx.recv().await {
            let _gate = task_gate.lock().await;
            if task_paused.load(Ordering::Acquire) || epoch != task_epoch.load(Ordering::Acquire) || samples.is_empty() {
                continue;
            }
            let samples_per_channel = samples.len() as u32 / SCREEN_AUDIO_CHANNELS;
            if samples_per_channel == 0 {
                continue;
            }
            let frame = AudioFrame {
                data: samples.into(),
                sample_rate: SCREEN_AUDIO_SAMPLE_RATE,
                num_channels: SCREEN_AUDIO_CHANNELS,
                samples_per_channel,
            };
            if task_audio_source.capture_frame(&frame).await.is_err() {
                break;
            }
        }
    });

    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
    let audio_thread_stop = stop.clone();
    let capture_paused = audio_paused.clone();
    let capture_epoch = audio_epoch.clone();
    let audio_thread = match thread::Builder::new()
        .name("shakechat-share-audio".into())
        .spawn(move || crate::screen_audio::run_audio_loop(audio_target, audio_thread_stop, audio_tx, capture_paused, capture_epoch, ready_tx)) {
        Ok(handle) => handle,
        Err(error) => { audio_task.abort(); let _ = room.close().await; return Err(map_error("Yayın sesi iş parçacığı başlatılamadı", error)); }
    };

    let audio_ready = tauri::async_runtime::spawn_blocking(move || {
        ready_rx.recv_timeout(Duration::from_secs(3)).map_err(|error| error.to_string())?
    }).await.map_err(|error| error.to_string()).and_then(|result| result);
    match audio_ready {
        Ok(()) => {}
        Err(error) => {
            stop.store(true, Ordering::Relaxed);
            audio_task.abort();
            join_thread(Some(audio_thread)).await;
            let _ = room.close().await;
            return Err(error);
        }
    }

    configure_capture(&mut capturer, selected, video_source.clone(), stop.clone(), width, height);
    let loop_stop = stop.clone();
    let (capture_commands, command_rx) = std::sync::mpsc::channel::<CaptureCommand>();
    let capture_thread = match thread::Builder::new()
        .name("shakechat-native-screen".into())
        .spawn(move || {
            let mut interval = Duration::from_micros(1_000_000 / fps as u64);
            while !loop_stop.load(Ordering::Relaxed) {
                let started = Instant::now();
                while let Ok(command) = command_rx.try_recv() {
                    let prepared = (|| {
                        let mut next = make_capturer(&command.kind)?;
                        let selected = pick_source(&next, &command.id)?;
                        configure_capture(&mut next, selected, video_source.clone(), loop_stop.clone(), command.width, command.height);
                        Ok::<_, String>(next)
                    })();
                    match prepared {
                        Ok(next) => {
                            capturer = next;
                            interval = Duration::from_micros(1_000_000 / command.fps as u64);
                            let _ = command.completed.send(Ok(()));
                        }
                        Err(error) => { let _ = command.completed.send(Err(error)); }
                    }
                }
                capturer.capture_frame();
                thread::sleep(interval.saturating_sub(started.elapsed()));
            }
        }) {
        Ok(handle) => handle,
        Err(error) => {
            stop.store(true, Ordering::Relaxed);
            audio_task.abort();
            join_thread(Some(audio_thread)).await;
            let _ = room.close().await;
            return Err(map_error("Native ekran yakalama iş parçacığı başlatılamadı", error));
        }
    };

    *state.inner.lock().await = Some(NativeScreenSession {
        room,
        stop,
        capture_thread: Some(capture_thread),
        audio_thread: Some(audio_thread),
        audio_task: Some(audio_task),
        capture_commands,
        audio_track: screen_audio_track,
        audio_source: screen_audio_source,
        audio_paused,
        audio_epoch,
        audio_gate,
    });
    Ok(())
}

struct CaptureCommand {
    kind: String,
    id: String,
    width: u32,
    height: u32,
    fps: u32,
    completed: tokio::sync::oneshot::Sender<Result<(), String>>,
}

fn fit_dimensions(width: u32, height: u32, limit_width: u32, limit_height: u32) -> (u32, u32) {
    let scale = (limit_width as f64 / width as f64).min(limit_height as f64 / height as f64).min(1.0);
    (((width as f64 * scale) as u32 / 2 * 2).max(2), ((height as f64 * scale) as u32 / 2 * 2).max(2))
}

fn configure_capture(capturer: &mut DesktopCapturer, selected: CaptureSource, source: NativeVideoSource, stop: Arc<AtomicBool>, width: u32, height: u32) {
    capturer.start_capture(Some(selected), move |result| {
        if stop.load(Ordering::Relaxed) { return; }
        let frame = match result {
            Ok(frame) => frame,
            Err(CaptureError::Permanent) => { stop.store(true, Ordering::Release); return; }
            Err(_) => return,
        };
        let frame_width = frame.width().max(1) as u32;
        let frame_height = frame.height().max(1) as u32;
        let mut buffer = I420Buffer::new(frame_width, frame_height);
        let (stride_y, stride_u, stride_v) = buffer.strides();
        let (data_y, data_u, data_v) = buffer.data_mut();
        yuv_helper::argb_to_i420(frame.data(), frame.stride(), data_y, stride_y, data_u, stride_u, data_v, stride_v, frame_width as i32, frame_height as i32);
        let (output_width, output_height) = fit_dimensions(frame_width, frame_height, width, height);
        let buffer = if (output_width, output_height) != (frame_width, frame_height) { buffer.scale(output_width as i32, output_height as i32) } else { buffer };
        let video_frame = VideoFrame { rotation: VideoRotation::VideoRotation0, timestamp_us: 0, frame_metadata: None, buffer };
        let _ = source.capture_frame(&video_frame);
    });
}

#[tauri::command]
pub async fn native_screen_update(state: State<'_, NativeScreenState>, source_kind: String, source_id: String, width: u32, height: u32, fps: u32) -> Result<(), String> {
    let _operation = state.operation.lock().await;
    let inner = state.inner.lock().await;
    let session = inner.as_ref().ok_or("Etkin ekran yayını bulunamadı.")?;
    let (completed, response) = tokio::sync::oneshot::channel();
    session.capture_commands.send(CaptureCommand {
        kind: source_kind, id: source_id, width: width.clamp(320, 7680), height: height.clamp(240, 4320), fps: fps.clamp(5, 144), completed,
    }).map_err(|_| "Ekran yakalama motoru durdu.".to_string())?;
    response.await.map_err(|_| "Ekran ayarı uygulanamadı.".to_string())?
}

#[tauri::command]
pub async fn native_screen_audio_pause(state: State<'_, NativeScreenState>, paused: bool) -> Result<(), String> {
    let _operation = state.operation.lock().await;
    let inner = state.inner.lock().await;
    let Some(session) = inner.as_ref() else { return Ok(()) };
    let _gate = session.audio_gate.lock().await;
    session.audio_track.mute();
    session.audio_paused.store(true, Ordering::Release);
    session.audio_epoch.fetch_add(1, Ordering::AcqRel);
    session.audio_source.clear_buffer();
    if !paused {
        tokio::time::sleep(Duration::from_millis(300)).await;
        session.audio_epoch.fetch_add(1, Ordering::AcqRel);
        session.audio_source.clear_buffer();
        session.audio_paused.store(false, Ordering::Release);
        session.audio_track.unmute();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::fit_dimensions;
    #[test]
    fn screen_dimensions_fit_the_target_without_stretching_or_upscaling() {
        assert_eq!(fit_dimensions(3840, 2160, 1920, 1080), (1920, 1080));
        assert_eq!(fit_dimensions(2560, 1440, 1280, 720), (1280, 720));
        assert_eq!(fit_dimensions(1080, 1920, 1920, 1080), (606, 1080));
        assert_eq!(fit_dimensions(640, 480, 1920, 1080), (640, 480));
    }
}

#[tauri::command]
pub async fn native_screen_active(state: State<'_, NativeScreenState>) -> Result<bool, String> {
    let inner = state.inner.lock().await;
    Ok(inner.as_ref().is_some_and(|session| !session.stop.load(Ordering::Acquire)
        && session.room.connection_state() != livekit::ConnectionState::Disconnected
        && session.audio_thread.as_ref().is_some_and(|worker| !worker.is_finished())
        && session.capture_thread.as_ref().is_some_and(|worker| !worker.is_finished())))
}
