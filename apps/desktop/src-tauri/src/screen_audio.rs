use std::{collections::VecDeque, ffi::c_void, sync::{Arc, Mutex, OnceLock, atomic::{AtomicBool, AtomicU64, Ordering}}, thread, time::Duration};
use tokio::sync::mpsc;

#[cfg(windows)]
use wasapi::{AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};
#[cfg(windows)]
use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::GetWindowThreadProcessId};

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;
const FRAME_MS: usize = 10;

#[derive(Debug, Clone)]
enum PendingAudioTarget {
    None,
    System,
    Window(String),
}

#[derive(Debug, Clone)]
pub enum AudioTarget {
    None,
    System,
    Process(u32),
}

fn pending() -> &'static Mutex<PendingAudioTarget> {
    static TARGET: OnceLock<Mutex<PendingAudioTarget>> = OnceLock::new();
    TARGET.get_or_init(|| Mutex::new(PendingAudioTarget::None))
}

#[tauri::command]
pub fn native_screen_audio_target(mode: String, source_id: Option<String>) -> Result<(), String> {
    let next = match mode.as_str() {
        "none" => PendingAudioTarget::None,
        "system" => PendingAudioTarget::System,
        "window" => PendingAudioTarget::Window(source_id.filter(|value| !value.is_empty()).ok_or("Ses uygulaması seçilmedi.")?),
        _ => return Err("Bilinmeyen yayın ses kaynağı.".into()),
    };
    *pending().lock().map_err(|_| "Ses seçimi kilidi açılamadı.".to_string())? = next;
    Ok(())
}

#[cfg(windows)]
fn window_process_id(source_id: &str) -> Result<u32, String> {
    let raw = source_id.parse::<usize>().map_err(|_| "Ses uygulaması pencere kimliği geçersiz.".to_string())?;
    let hwnd = HWND(raw as *mut c_void);
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)); }
    if pid == 0 { return Err("Seçilen uygulamanın ses işlemi bulunamadı.".into()); }
    Ok(pid)
}

#[cfg(not(windows))]
fn window_process_id(_source_id: &str) -> Result<u32, String> {
    Err("Uygulama sesi yalnız Windows masaüstünde destekleniyor.".into())
}

/// Window sharing always follows that application's process audio. Entire-screen sharing
/// uses the explicit picker selection and defaults to silence so voice apps are never leaked.
pub fn target_for_start(video_kind: &str, video_source_id: &str) -> Result<AudioTarget, String> {
    if video_kind == "window" {
        return Ok(AudioTarget::Process(window_process_id(video_source_id)?));
    }
    let chosen = {
        let mut guard = pending().lock().map_err(|_| "Ses seçimi kilidi açılamadı.".to_string())?;
        std::mem::replace(&mut *guard, PendingAudioTarget::None)
    };
    match chosen {
        PendingAudioTarget::None => Ok(AudioTarget::None),
        PendingAudioTarget::System => Ok(AudioTarget::System),
        PendingAudioTarget::Window(source_id) => Ok(AudioTarget::Process(window_process_id(&source_id)?)),
    }
}

fn map_error(context: &str, error: impl std::fmt::Display) -> String { format!("{context}: {error}") }

#[cfg(windows)]
pub fn run_audio_loop(
    target: AudioTarget,
    stop: Arc<AtomicBool>,
    sender: mpsc::Sender<(u64, Vec<i16>)>,
    paused: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    ready: std::sync::mpsc::SyncSender<Result<(), String>>,
) {
    if matches!(target, AudioTarget::None) {
        let _ = ready.send(Ok(()));
        while !stop.load(Ordering::Acquire) { thread::sleep(Duration::from_millis(100)); }
        return;
    }

    if let Err(error) = wasapi::initialize_mta().ok() {
        let _ = ready.send(Err(map_error("Windows ses sistemi başlatılamadı", error)));
        return;
    }

    let result = (|| -> Result<(), String> {
        let desired_format = WaveFormat::new(32, 32, &SampleType::Float, SAMPLE_RATE as usize, CHANNELS as usize, None);
        let block_align = desired_format.get_blockalign() as usize;

        let (mut audio_client, buffer_duration_hns, label) = match target {
            AudioTarget::Process(pid) => {
                let client = AudioClient::new_application_loopback_client(pid, true)
                    .map_err(|error| map_error("Uygulama sesi açılamadı", error))?;
                (client, 0, "Uygulama sesi")
            }
            AudioTarget::System => {
                let enumerator = DeviceEnumerator::new().map_err(|error| map_error("Ses cihazları okunamadı", error))?;
                let device = enumerator.get_default_device(&Direction::Render)
                    .map_err(|error| map_error("Varsayılan hoparlör bulunamadı", error))?;
                let mut client = device.get_iaudioclient().map_err(|error| map_error("WASAPI loopback açılamadı", error))?;
                let (_, min_period) = client.get_device_period().map_err(|error| map_error("WASAPI cihaz periyodu okunamadı", error))?;
                (client, min_period, "Sistem sesi")
            }
            AudioTarget::None => unreachable!(),
        };

        let mode = StreamMode::EventsShared { autoconvert: true, buffer_duration_hns };
        audio_client.initialize_client(&desired_format, &Direction::Capture, &mode)
            .map_err(|error| map_error(&format!("{label} loopback başlatılamadı"), error))?;
        let event = audio_client.set_get_eventhandle().map_err(|error| map_error("Ses olay kuyruğu açılamadı", error))?;
        let capture_client = audio_client.get_audiocaptureclient().map_err(|error| map_error("Ses yakalama istemcisi açılamadı", error))?;
        audio_client.start_stream().map_err(|error| map_error("Yayın sesi başlatılamadı", error))?;
        let _ = ready.send(Ok(()));

        let frames_per_chunk = (SAMPLE_RATE as usize * FRAME_MS) / 1000;
        let chunk_bytes = frames_per_chunk * block_align;
        let mut queue = VecDeque::<u8>::with_capacity(chunk_bytes * 20);

        while !stop.load(Ordering::Relaxed) {
            let packet_epoch = epoch.load(Ordering::Acquire);
            loop {
                let frames = capture_client.get_next_packet_size().map_err(|error| map_error("Yayın sesi bağlantısı kesildi", error))?;
                if !matches!(frames, Some(count) if count > 0) || stop.load(Ordering::Relaxed) { break; }
                capture_client.read_from_device_to_deque(&mut queue).map_err(|error| map_error("Yayın sesi okunamadı", error))?;
                if paused.load(Ordering::Acquire) { queue.clear(); }
            }
            if paused.load(Ordering::Acquire) || packet_epoch != epoch.load(Ordering::Acquire) { queue.clear(); }
            while queue.len() >= chunk_bytes {
                let mut samples = Vec::with_capacity(frames_per_chunk * CHANNELS as usize);
                for _ in 0..(frames_per_chunk * CHANNELS as usize) {
                    let b0 = queue.pop_front().unwrap_or(0);
                    let b1 = queue.pop_front().unwrap_or(0);
                    let b2 = queue.pop_front().unwrap_or(0);
                    let b3 = queue.pop_front().unwrap_or(0);
                    let sample = f32::from_le_bytes([b0, b1, b2, b3]);
                    let sample = if sample.is_finite() { sample.clamp(-1.0, 1.0) } else { 0.0 };
                    samples.push((sample * i16::MAX as f32).round() as i16);
                }
                if sender.is_closed() { stop.store(true, Ordering::Release); break; }
                let _ = sender.try_send((packet_epoch, samples));
            }
            let _ = event.wait_for_event(250);
        }
        let _ = audio_client.stop_stream();
        Ok(())
    })();

    if let Err(error) = result {
        stop.store(true, Ordering::Release);
        let _ = ready.send(Err(error));
    }
    wasapi::deinitialize();
}

#[cfg(not(windows))]
pub fn run_audio_loop(
    _target: AudioTarget,
    _stop: Arc<AtomicBool>,
    _sender: mpsc::Sender<(u64, Vec<i16>)>,
    _paused: Arc<AtomicBool>,
    _epoch: Arc<AtomicU64>,
    ready: std::sync::mpsc::SyncSender<Result<(), String>>,
) {
    let _ = ready.send(Err("Native yayın sesi yalnız Windows masaüstünde destekleniyor.".into()));
}
