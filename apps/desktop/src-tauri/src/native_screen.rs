use livekit::{
    options::{TrackPublishOptions, VideoCodec, VideoEncoding},
    prelude::*,
    webrtc::{
        desktop_capturer::{CaptureSource, DesktopCaptureSourceType, DesktopCapturer, DesktopCapturerOptions},
        native::yuv_helper,
        video_frame::{I420Buffer, VideoFrame, VideoRotation},
        video_source::{native::NativeVideoSource, RtcVideoSource, VideoResolution},
    },
};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use tauri::State;
use tokio::sync::Mutex;

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

async fn stop_session(state: &NativeScreenState) -> Result<(), String> {
    let old = { state.inner.lock().await.take() };
    if let Some(mut session) = old {
        session.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = session.capture_thread.take() {
            let _ = tauri::async_runtime::spawn_blocking(move || handle.join()).await;
        }
        session.room.close().await.map_err(|error| map_error("Ekran yayını kapatılamadı", error))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn native_screen_stop(state: State<'_, NativeScreenState>) -> Result<(), String> {
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

    let (room, _events) = Room::connect(
        &url,
        &token,
        RoomOptions { auto_subscribe: false, ..Default::default() },
    )
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

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let frame_source = video_source.clone();
    capturer.start_capture(Some(selected), move |result| {
        if thread_stop.load(Ordering::Relaxed) { return; }
        let Ok(frame) = result else { return; };
        let frame_width = frame.width().max(1) as u32;
        let frame_height = frame.height().max(1) as u32;
        let mut buffer = I420Buffer::new(frame_width, frame_height);
        let (stride_y, stride_u, stride_v) = buffer.strides();
        let (data_y, data_u, data_v) = buffer.data_mut();
        yuv_helper::argb_to_i420(
            frame.data(), frame.stride(),
            data_y, stride_y,
            data_u, stride_u,
            data_v, stride_v,
            frame_width as i32, frame_height as i32,
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
    let capture_thread = thread::Builder::new()
        .name("shakechat-native-screen".into())
        .spawn(move || {
            while !loop_stop.load(Ordering::Relaxed) {
                capturer.capture_frame();
                thread::sleep(frame_interval);
            }
        })
        .map_err(|error| map_error("Native ekran yakalama iş parçacığı başlatılamadı", error))?;

    *state.inner.lock().await = Some(NativeScreenSession {
        room,
        stop,
        capture_thread: Some(capture_thread),
    });
    Ok(())
}
