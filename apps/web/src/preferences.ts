export type AccentTheme = 'ember' | 'tide' | 'mono';
export type InterfaceDensity = 'cozy' | 'compact';
export type VoiceInputMode = 'voice_activity' | 'push_to_talk';
export type CameraQuality = 'balanced' | '720p30' | '1080p30' | '1080p60';
export type ScreenQuality = 'balanced' | 'source' | '720p30' | '1080p30' | '1080p60' | '1080p120' | '1080p144' | '1440p30' | '1440p60' | '1440p120' | '1440p144';

export type AppPreferences = {
  theme: AccentTheme;
  density: InterfaceDensity;
  reduceMotion: boolean;
  cameraQuality: CameraQuality;
  screenQuality: ScreenQuality;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceInputMode: VoiceInputMode;
  pushToTalkKey: string;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'ember',
  density: 'cozy',
  reduceMotion: false,
  cameraQuality: 'balanced',
  screenQuality: '1080p30',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceInputMode: 'voice_activity',
  pushToTalkKey: 'Backquote',
};

const STORAGE_KEY = 'shakechat.preferences.v10';

function isTheme(value: unknown): value is AccentTheme { return value === 'ember' || value === 'tide' || value === 'mono'; }
function isDensity(value: unknown): value is InterfaceDensity { return value === 'cozy' || value === 'compact'; }
function isCameraQuality(value: unknown): value is CameraQuality { return value === 'balanced' || value === '720p30' || value === '1080p30' || value === '1080p60'; }
function isScreenQuality(value: unknown): value is ScreenQuality { return value === 'balanced' || value === 'source' || value === '720p30' || value === '1080p30' || value === '1080p60' || value === '1080p120' || value === '1080p144' || value === '1440p30' || value === '1440p60' || value === '1440p120' || value === '1440p144'; }
function isVoiceInputMode(value: unknown): value is VoiceInputMode { return value === 'voice_activity' || value === 'push_to_talk'; }

export function loadPreferences(): AppPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<AppPreferences>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_PREFERENCES.theme,
      density: isDensity(parsed.density) ? parsed.density : DEFAULT_PREFERENCES.density,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
      cameraQuality: isCameraQuality(parsed.cameraQuality) ? parsed.cameraQuality : DEFAULT_PREFERENCES.cameraQuality,
      screenQuality: isScreenQuality(parsed.screenQuality) ? parsed.screenQuality : DEFAULT_PREFERENCES.screenQuality,
      echoCancellation: typeof parsed.echoCancellation === 'boolean' ? parsed.echoCancellation : DEFAULT_PREFERENCES.echoCancellation,
      noiseSuppression: typeof parsed.noiseSuppression === 'boolean' ? parsed.noiseSuppression : DEFAULT_PREFERENCES.noiseSuppression,
      autoGainControl: typeof parsed.autoGainControl === 'boolean' ? parsed.autoGainControl : DEFAULT_PREFERENCES.autoGainControl,
      voiceInputMode: isVoiceInputMode(parsed.voiceInputMode) ? parsed.voiceInputMode : DEFAULT_PREFERENCES.voiceInputMode,
      pushToTalkKey: typeof parsed.pushToTalkKey === 'string' && parsed.pushToTalkKey.trim() ? parsed.pushToTalkKey : DEFAULT_PREFERENCES.pushToTalkKey,
    };
  } catch { return DEFAULT_PREFERENCES; }
}

export function persistPreferences(preferences: AppPreferences) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* private storage mode */ }
}

export function applyPreferences(preferences: AppPreferences) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.scTheme = preferences.theme;
  root.dataset.scDensity = preferences.density;
  root.dataset.scMotion = preferences.reduceMotion ? 'reduced' : 'full';
}

export function cameraCaptureFor(quality: CameraQuality) {
  if (quality === '720p30') return { resolution: { width: 1280, height: 720, frameRate: 30 }, frameRate: 30 };
  if (quality === '1080p30') return { resolution: { width: 1920, height: 1080, frameRate: 30 }, frameRate: 30 };
  if (quality === '1080p60') return { resolution: { width: 1920, height: 1080, frameRate: 60 }, frameRate: 60 };
  return undefined;
}

type ScreenProfile = { width?: number; height?: number; frameRate?: number; maxBitrate?: number; maxFramerate?: number; degradationPreference?: 'maintain-resolution' | 'maintain-framerate' | 'balanced'; label: string };

const SCREEN_PROFILES: Record<ScreenQuality, ScreenProfile> = {
  balanced: { label: 'Otomatik' },
  source: { width: 7680, height: 4320, frameRate: 144, maxBitrate: 60_000_000, maxFramerate: 144, degradationPreference: 'maintain-resolution', label: 'Kaynak · native (8K/144 tavan)' },
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 4_000_000, maxFramerate: 30, degradationPreference: 'maintain-resolution', label: '720p · 30 FPS' },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 8_000_000, maxFramerate: 30, degradationPreference: 'maintain-resolution', label: '1080p · 30 FPS' },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 12_000_000, maxFramerate: 60, degradationPreference: 'balanced', label: '1080p · 60 FPS' },
  '1080p120': { width: 1920, height: 1080, frameRate: 120, maxBitrate: 20_000_000, maxFramerate: 120, degradationPreference: 'maintain-framerate', label: '1080p · 120 FPS' },
  '1080p144': { width: 1920, height: 1080, frameRate: 144, maxBitrate: 24_000_000, maxFramerate: 144, degradationPreference: 'maintain-framerate', label: '1080p · 144 FPS' },
  '1440p30': { width: 2560, height: 1440, frameRate: 30, maxBitrate: 14_000_000, maxFramerate: 30, degradationPreference: 'maintain-resolution', label: '2K / 1440p · 30 FPS' },
  '1440p60': { width: 2560, height: 1440, frameRate: 60, maxBitrate: 20_000_000, maxFramerate: 60, degradationPreference: 'balanced', label: '2K / 1440p · 60 FPS' },
  '1440p120': { width: 2560, height: 1440, frameRate: 120, maxBitrate: 34_000_000, maxFramerate: 120, degradationPreference: 'maintain-framerate', label: '2K / 1440p · 120 FPS' },
  '1440p144': { width: 2560, height: 1440, frameRate: 144, maxBitrate: 42_000_000, maxFramerate: 144, degradationPreference: 'maintain-framerate', label: '2K / 1440p · 144 FPS' },
};

export function screenCaptureFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  if (!profile.width || !profile.height || !profile.frameRate) return undefined;
  return { width: profile.width, height: profile.height, frameRate: profile.frameRate };
}

export function screenPublishFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  if (!profile.maxBitrate || !profile.maxFramerate) return undefined;
  return {
    // Explicit quality profiles are intentionally single-layer. With screen-share
    // simulcast enabled LiveKit also publishes a half-resolution layer; a viewer
    // can legitimately be subscribed to that 1280x720 layer even while the
    // publisher is capturing 2560x1440. For a small private room, explicit
    // profiles should mean "send the selected source layer".
    simulcast: false,
    screenShareEncoding: { maxBitrate: profile.maxBitrate, maxFramerate: profile.maxFramerate, priority: 'high' as const },
    degradationPreference: profile.degradationPreference,
  };
}

export function screenReceiveFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  if (quality === 'balanced') return undefined;
  return {
    width: profile.width || 7680,
    height: profile.height || 4320,
    fps: profile.maxFramerate || profile.frameRate || 144,
  };
}

export function cameraQualityLabel(quality: CameraQuality) {
  return quality === 'balanced' ? 'Otomatik' : quality.replace('p', 'p · ').replace('30', '30 FPS').replace('60', '60 FPS');
}

export function screenQualityLabel(quality: ScreenQuality) {
  return SCREEN_PROFILES[quality].label;
}


export function pushToTalkKeyLabel(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const labels: Record<string, string> = {
    Backquote: '`',
    Space: 'Boşluk',
    ShiftLeft: 'Sol Shift',
    ShiftRight: 'Sağ Shift',
    ControlLeft: 'Sol Ctrl',
    ControlRight: 'Sağ Ctrl',
    AltLeft: 'Sol Alt',
    AltRight: 'Sağ Alt',
    CapsLock: 'Caps Lock',
    Tab: 'Tab',
  };
  return labels[code] || code.replace(/^Arrow/, 'Ok ');
}
