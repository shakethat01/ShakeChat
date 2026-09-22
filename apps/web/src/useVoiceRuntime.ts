import type { AppPreferences } from './preferences';
import { useNativeVoice, isDesktopNativeVoiceRuntime } from './useNativeVoice';
import { useVoice } from './useVoice';

/**
 * One UI, two media engines:
 * - Browser build: existing LiveKit JS/WebAudio implementation.
 * - Tauri desktop: Rust + native libwebrtc PlatformAudio (WASAPI on Windows).
 *
 * Both hooks are always called so React hook ordering stays deterministic.
 */
export function useVoiceRuntime(enabled:boolean,onError:(message:string)=>void,preferences:AppPreferences){
  const native=isDesktopNativeVoiceRuntime();
  const webVoice=useVoice(enabled&&!native,onError,preferences);
  const nativeVoice=useNativeVoice(enabled&&native,onError,preferences);
  return native?nativeVoice:webVoice;
}
