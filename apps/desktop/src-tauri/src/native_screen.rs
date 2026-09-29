use livekit::{
    options::{AudioEncoding, TrackPublishOptions, VideoCodec, VideoEncoding},
    prelude::*,
    webrtc::{
        audio_frame::AudioFrame,
        audio_source::{native::NativeAudioSource, AudioSourceOptions, RtcAudioSource},
        desktop_capturer::{CaptureSource, DesktopCaptureSourceType, DesktopCapturer, DesktopCapturerOptions},
        native::yuv_helper,
        video_frame::{I420Buffer, VideoFrame, VideoRotation},
        video_source::{native::NativeVideoSource, RtcVideoSource, VideoResolution},
    },
};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use tauri::State;
use tokio::sync::{mpsc, Mutex};

#[cfg(windows)]
use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

const SCREEN_AUDIO_SAMPLE_RATE: u32 = 48_000;
const SCREEN_AUDIO_CHANNELS: u32 = 2;
const SCREEN_AUDIO_FRAME_MS: usize = 10;

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
}

#[derive(Default)]
pub struct NativeScreenState {
    inner: Mutex<Option<NativeScreenSession>>,
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
    stop_session(state.inner()).await
}

#[cfg(windows)]
fn run_system_audio_loop(
    stop: Arc<AtomicBool>,
    sender: mpsc::UnboundedSender<Vec<i16>>,
    ready: std::sync::mpsc::SyncSender<Result<(), String>>,
) {
    if let Err(error) = wasapi::initialize_mta().ok() {
        let _ = ready.send(Err(map_error("Windows ses sistemi başlatılamadı", error)));
        return;
    }

    let result = (|| -> Result<(), String> {
        let enumerator = DeviceEnumerator::new().map_err(|error| map_error("Ses cihazları okunamadı", error))?;
        let device = enumerator
            .get_default_device(&Direction::Render)
            .map_err(|error| map_error("Varsayılan hoparlör bulunamadı", error))?;
        let mut audio_client = device
            .get_iaudioclient()
            .map_err(|error| map_error("WASAPI loopback açılamadı", error))?;

        let desired_format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            SCREEN_AUDIO_SAMPLE_RATE as usize,
            SCREEN_AUDIO_CHANNELS as usize,
            None,
        );
        let block_align = desired_format.get_blockalign() as usize;
        let (_, min_period) = audio_client
            .get_device_period()
            .map_err(|error| map_error("WASAPI cihaz periyodu okunamadı", error))?;
        let mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: min_period,
        };
        audio_client
            .initialize_client(&desired_format, &Direction::Capture, &mode)
            .map_err(|error| map_error("Sistem sesi loopback başlatılamadı", error))?;
        let event = audio_client
            .set_get_eventhandle()
            .map_err(|error| map_error("Sistem sesi olay kuyruğu açılamadı", error))?;
        let capture_client = audio_client
            .get_audiocaptureclient()
            .map_err(|error| map_error("Sistem sesi yakalama istemcisi açılamadı", error))?;
        audio_client
            .start_stream()
            .map_err(|error| map_error("Sistem sesi yakalama akışı başlatılamadı", error))?;

        let _ = ready.send(Ok(()));

        let frames_per_chunk =
            (SCREEN_AUDIO_SAMPLE_RATE as usize * SCREEN_AUDIO_FRAME_MS) / 1000;
        let chunk_bytes = frames_per_chunk * block_align;
        let mut queue = VecDeque::<u8>::with_capacity(chunk_bytes * 20);

        while !stop.load(Ordering::Relaxed) {
            match capture_client.get_next_packet_size() {
                Ok(Some(frames)) if frames > 0 => {
                    if capture_client.read_from_device_to_deque(&mut queue).is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }

            while queue.len() >= chunk_bytes {
                let mut samples = Vec::with_capacity(frames_per_chunk * SCREEN_AUDIO_CHANNELS as usize);
                for _ in 0..(frames_per_chunk * SCREEN_AUDIO_CHANNELS as usize) {
                    let b0 = queue.pop_front().unwrap_or(0);
                    let b1 = queue.pop_front().unwrap_or(0);
                    let b2 = queue.pop_front().unwrap_or(0);
                    let b3 = queue.pop_front().unwrap_or(0);
                    let sample = f32::from_le_bytes([b0, b1, b2, b3]);
                    let sample = if sample.is_finite() { sample.clamp(-1.0, 1.0) } else { 0.0 };
                    samples.push((sample * i16::MAX as f32).round() as i16);
                }
                if sender.send(samples).is_err() {
                    break;
                }
            }

            let _ = event.wait_for_event(250);
        }

        let _ = audio_client.stop_stream();
        Ok(())
    })();

    if let Err(error) = result {
        let _ = ready.send(Err(error));
    }
    wasapi::deinitialize();
}

#[cfg(not(windows))]
fn run_system_audio_loop(
    _stop: Arc<AtomicBool>,
    _sender: mpsc::UnboundedSender<Vec<i16>>,
    ready: std::sync::mpsc::SyncSender<Result<(), String>>,
) {
    let _ = ready.send(Err("Native sistem sesi yalnız Windows masaüstünde destekleniyor.".into()));
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
    stop_session(state.inner()).await?;
    let width = width.clamp(320, 7680);
    let height = height.clamp(240, 4320);
    let fps = fps.clamp(5, 144);

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
    let max_bitrate = match height {
        0..=480 => 1_500_000,
        481..=720 => 3_500_000,
        721..=1080 => 6_000_000,
        _ => 14_000_000,
    };
    room.local_participant()
        .publish_track(
            LocalTrack::Video(video_track),
            TrackPublishOptions {
                source: TrackSource::Screenshare,
                video_codec: VideoCodec::H264,
                simulcast: false,
                video_encoding: Some(VideoEncoding {
                    max_bitrate,
                    max_framerate: fps as f64,
                }),
                ..Default::default()
            },
        )
        .await
        .map_err(|error| map_error("Native ekran görüntüsü yayınlanamadı", error))?;

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
    room.local_participant()
        .publish_track(
            LocalTrack::Audio(screen_audio_track),
            TrackPublishOptions {
                source: TrackSource::ScreenshareAudio,
                audio_encoding: Some(AudioEncoding { max_bitrate: 192_000 }),
                dtx: false,
                red: false,
                ..Default::default()
            },
        )
        .await
        .map_err(|error| map_error("Native sistem sesi yayınlanamadı", error))?;

    let stop = Arc::new(AtomicBool::new(false));

    let (audio_tx, mut audio_rx) = mpsc::unbounded_channel::<Vec<i16>>();
    let task_audio_source = screen_audio_source.clone();
    let audio_task = tauri::async_runtime::spawn(async move {
        while let Some(samples) = audio_rx.recv().await {
            if samples.is_empty() {
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
    let audio_thread = thread::Builder::new()
        .name("shakechat-system-audio".into())
        .spawn(move || run_system_audio_loop(audio_thread_stop, audio_tx, ready_tx))
        .map_err(|error| map_error("Sistem sesi iş parçacığı başlatılamadı", error))?;

    let audio_ready = tauri::async_runtime::spawn_blocking(move || {
        ready_rx.recv_timeout(Duration::from_secs(3))
    })
    .await
    .map_err(|error| map_error("Sistem sesi hazırlığı beklenemedi", error))?;

    match audio_ready {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            stop.store(true, Ordering::Relaxed);
            audio_task.abort();
            join_thread(Some(audio_thread)).await;
            let _ = room.close().await;
            return Err(error);
        }
        Err(error) => {
            stop.store(true, Ordering::Relaxed);
            audio_task.abort();
            join_thread(Some(audio_thread)).await;
            let _ = room.close().await;
            return Err(map_error("Sistem sesi hazırlanırken zaman aşımı", error));
        }
    }

    let thread_stop = stop.clone();
    let frame_source = video_source.clone();
    capturer.start_capture(Some(selected), move |result| {
        if thread_stop.load(Ordering::Relaxed) {
            return;
        }
        let Ok(frame) = result else { return };
        let frame_width = frame.width().max(1) as u32;
        let frame_height = frame.height().max(1) as u32;
        let mut buffer = I420Buffer::new(frame_width, frame_height);
        let (stride_y, stride_u, stride_v) = buffer.strides();
        let (data_y, data_u, data_v) = buffer.data_mut();
        yuv_helper::argb_to_i420(
            frame.data(),
            frame.stride(),
            data_y,
            stride_y,
            data_u,
            stride_u,
            data_v,
            stride_v,
            frame_width as i32,
            frame_height as i32,
        );
        let video_frame = VideoFrame {
            rotation: VideoRotation::VideoRotation0,
            timestamp_us: 0,
            frame_metadata: None,
            buffer,
        };
        let _ = frame_source.capture_frame(&video_frame);
    });

    let loop_stop = stop.clone();
    let frame_interval = Duration::from_micros((1_000_000u64 / fps as u64).max(1));
    let capture_thread = match thread::Builder::new()
        .name("shakechat-native-screen".into())
        .spawn(move || {
            while !loop_stop.load(Ordering::Relaxed) {
                capturer.capture_frame();
                thread::sleep(frame_interval);
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
    });
    Ok(())
}
