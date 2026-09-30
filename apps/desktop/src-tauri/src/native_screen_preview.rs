use livekit::webrtc::desktop_capturer::{
    CaptureError, DesktopCaptureSourceType, DesktopCapturer, DesktopCapturerOptions, DesktopFrame,
};
use serde::Serialize;
use std::{sync::mpsc, time::Duration};

const PREVIEW_MAX_WIDTH: u32 = 240;
const PREVIEW_MAX_HEIGHT: u32 = 135;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenPreview {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn source_type(kind: &str) -> Result<DesktopCaptureSourceType, String> {
    match kind {
        "screen" => Ok(DesktopCaptureSourceType::Screen),
        "window" => Ok(DesktopCaptureSourceType::Window),
        _ => Err("Bilinmeyen ekran kaynağı türü.".into()),
    }
}

fn frame_to_preview(frame: &DesktopFrame) -> Result<NativeScreenPreview, String> {
    let width = frame.width().max(1) as u32;
    let height = frame.height().max(1) as u32;
    let stride = frame.stride() as usize;
    let data = frame.data();
    let scale = (PREVIEW_MAX_WIDTH as f64 / width as f64)
        .min(PREVIEW_MAX_HEIGHT as f64 / height as f64)
        .min(1.0);
    let preview_width = ((width as f64 * scale).round() as u32).max(1);
    let preview_height = ((height as f64 * scale).round() as u32).max(1);
    let mut rgba = vec![0u8; preview_width as usize * preview_height as usize * 4];

    for y in 0..preview_height {
        let source_y = ((y as u64 * height as u64) / preview_height as u64).min(height as u64 - 1) as usize;
        for x in 0..preview_width {
            let source_x = ((x as u64 * width as u64) / preview_width as u64).min(width as u64 - 1) as usize;
            let source = source_y.saturating_mul(stride).saturating_add(source_x.saturating_mul(4));
            if source + 3 >= data.len() {
                continue;
            }
            let target = ((y * preview_width + x) * 4) as usize;
            // libwebrtc's desktop ARGB buffer is BGRA in little-endian memory.
            rgba[target] = data[source + 2];
            rgba[target + 1] = data[source + 1];
            rgba[target + 2] = data[source];
            rgba[target + 3] = 255;
        }
    }

    Ok(NativeScreenPreview { width: preview_width, height: preview_height, rgba })
}

#[tauri::command]
pub async fn native_screen_preview(source_kind: String, source_id: String) -> Result<NativeScreenPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut options = DesktopCapturerOptions::new(source_type(&source_kind)?);
        options.set_include_cursor(false);
        let mut capturer = DesktopCapturer::new(options)
            .ok_or_else(|| "Windows ekran önizleme motoru açılamadı.".to_string())?;
        let id = source_id.parse::<u64>().map_err(|_| "Geçersiz ekran kaynağı.".to_string())?;
        let selected = capturer
            .get_source_list()
            .into_iter()
            .find(|source| source.id() == id)
            .ok_or_else(|| "Önizlenecek ekran/pencere artık bulunamıyor.".to_string())?;

        let (sender, receiver) = mpsc::sync_channel::<Result<NativeScreenPreview, String>>(1);
        capturer.start_capture(Some(selected), move |result| {
            let preview = match result {
                Ok(frame) => frame_to_preview(&frame),
                Err(CaptureError::Permanent) => Err("Bu pencerenin önizlemesi alınamadı.".into()),
                Err(_) => Err("Önizleme geçici olarak alınamadı.".into()),
            };
            let _ = sender.try_send(preview);
        });
        capturer.capture_frame();
        receiver
            .recv_timeout(Duration::from_millis(1200))
            .map_err(|_| "Önizleme zaman aşımına uğradı.".to_string())?
    })
    .await
    .map_err(|error| format!("Önizleme hazırlanamadı: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{PREVIEW_MAX_HEIGHT, PREVIEW_MAX_WIDTH};

    #[test]
    fn preview_limits_are_small_enough_for_picker_ipc() {
        assert!(PREVIEW_MAX_WIDTH <= 320);
        assert!(PREVIEW_MAX_HEIGHT <= 180);
        assert_eq!(PREVIEW_MAX_WIDTH * PREVIEW_MAX_HEIGHT, 32_400);
    }
}
