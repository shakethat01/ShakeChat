use tauri::WebviewWindow;

fn app_origin(webview: &WebviewWindow) -> Result<String, String> {
    let url = webview.url().map_err(|error| error.to_string())?;
    let origin = url.origin().ascii_serialization();
    let packaged = origin == "http://tauri.localhost" || origin == "https://tauri.localhost";
    let development = cfg!(debug_assertions)
        && (origin == "http://127.0.0.1:5173" || origin == "http://localhost:5173");
    if webview.label() != "main" || !(packaged || development) {
        return Err("Bu işlem yalnızca ShakeChat uygulamasında kullanılabilir.".into());
    }
    Ok(origin)
}

/// An explicit user action clears only this app origin's microphone decision.
/// It does not grant access or change Windows privacy settings.
#[tauri::command]
pub async fn reset_microphone_permission(webview: WebviewWindow) -> Result<(), String> {
    let origin = app_origin(&webview)?;
    #[cfg(target_os = "windows")]
    {
        use std::{sync::mpsc, time::Duration};
        use webview2_com::{Microsoft::Web::WebView2::Win32::*, SetPermissionStateCompletedHandler};
        use windows::core::{HSTRING, Interface};

        let (sender, receiver) = mpsc::channel::<Result<(), String>>();
        webview.with_webview(move |native| {
            let completed = sender.clone();
            let action = (|| unsafe {
                let core: ICoreWebView2_13 = native.controller().CoreWebView2()?.cast()?;
                let profile: ICoreWebView2Profile4 = core.Profile()?.cast()?;
                let handler = SetPermissionStateCompletedHandler::create(Box::new(move |result| {
                    let _ = completed.send(result.map_err(|error| error.to_string()));
                    Ok(())
                }));
                profile.SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    &HSTRING::from(origin),
                    COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
                    &handler,
                )
            })();
            if let Err(error) = action {
                let _ = sender.send(Err(error.to_string()));
            }
        }).map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(10)))
            .await.map_err(|error| error.to_string())?
            .map_err(|_| "Mikrofon izni yanıtı alınamadı.".to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = origin;
        Err("Mikrofon iznini işletim sistemi ayarlarından değiştir.".into())
    }
}

#[tauri::command]
pub fn open_microphone_privacy_settings(webview: WebviewWindow) -> Result<(), String> {
    app_origin(&webview)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-settings:privacy-microphone")
            .spawn().map(|_| ()).map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Mikrofon iznini işletim sistemi ayarlarından değiştir.".into())
}
