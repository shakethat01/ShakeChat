export type AccentTheme = 'ember' | 'tide' | 'mono';
export type InterfaceDensity = 'cozy' | 'compact';
export type VoiceInputMode = 'voice_activity' | 'push_to_talk';
export type CameraQuality = 'balanced' | '720p30' | '1080p30' | '1080p60';
export type ScreenQuality = 'low' | 'medium' | 'high' | 'ultra';

export type AppPreferences = {
  theme: AccentTheme;
  density: InterfaceDensity;
  reduceMotion: boolean;
  cameraQuality: CameraQuality;
  screenQuality: ScreenQuality;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  voiceInputMode: VoiceInputMode;
  pushToTalkKey: string;
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'ember',
  density: 'cozy',
  reduceMotion: false,
  cameraQuality: 'balanced',
  screenQuality: 'high',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
  noiseGateEnabled: true,
  noiseGateThreshold: -48,
  voiceInputMode: 'voice_activity',
  pushToTalkKey: 'Backquote',
};

const STORAGE_KEY = 'shakechat.preferences.v10';

function isTheme(value: unknown): value is AccentTheme { return value === 'ember' || value === 'tide' || value === 'mono'; }
function isDensity(value: unknown): value is InterfaceDensity { return value === 'cozy' || value === 'compact'; }
function isCameraQuality(value: unknown): value is CameraQuality { return value === 'balanced' || value === '720p30' || value === '1080p30' || value === '1080p60'; }
function isScreenQuality(value: unknown): value is ScreenQuality { return value === 'low' || value === 'medium' || value === 'high' || value === 'ultra'; }
function isVoiceInputMode(value: unknown): value is VoiceInputMode { return value === 'voice_activity' || value === 'push_to_talk'; }

const LEGACY_SCREEN_QUALITY: Record<string, ScreenQuality> = {
  balanced: 'medium',
  source: 'ultra',
  '720p30': 'medium',
  '1080p30': 'high',
  '1080p60': 'high',
  '1080p120': 'high',
  '1080p144': 'high',
  '1440p30': 'ultra',
  '1440p60': 'ultra',
  '1440p120': 'ultra',
  '1440p144': 'ultra',
};

function parseScreenQuality(value: unknown): ScreenQuality {
  if (isScreenQuality(value)) return value;
  if (typeof value === 'string' && LEGACY_SCREEN_QUALITY[value]) return LEGACY_SCREEN_QUALITY[value];
  return DEFAULT_PREFERENCES.screenQuality;
}

export function clampNoiseGateThreshold(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_PREFERENCES.noiseGateThreshold;
  return Math.max(-70, Math.min(-25, Math.round(value)));
}

export function loadPreferences(): AppPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<AppPreferences> & { screenQuality?: unknown };
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_PREFERENCES.theme,
      density: isDensity(parsed.density) ? parsed.density : DEFAULT_PREFERENCES.density,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
      cameraQuality: isCameraQuality(parsed.cameraQuality) ? parsed.cameraQuality : DEFAULT_PREFERENCES.cameraQuality,
      screenQuality: parseScreenQuality(parsed.screenQuality),
      echoCancellation: typeof parsed.echoCancellation === 'boolean' ? parsed.echoCancellation : DEFAULT_PREFERENCES.echoCancellation,
      noiseSuppression: typeof parsed.noiseSuppression === 'boolean' ? parsed.noiseSuppression : DEFAULT_PREFERENCES.noiseSuppression,
      autoGainControl: typeof parsed.autoGainControl === 'boolean' ? parsed.autoGainControl : DEFAULT_PREFERENCES.autoGainControl,
      noiseGateEnabled: typeof parsed.noiseGateEnabled === 'boolean' ? parsed.noiseGateEnabled : DEFAULT_PREFERENCES.noiseGateEnabled,
      noiseGateThreshold: clampNoiseGateThreshold(typeof parsed.noiseGateThreshold === 'number' ? parsed.noiseGateThreshold : DEFAULT_PREFERENCES.noiseGateThreshold),
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

type ScreenProfile = {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
  maxFramerate: number;
  degradationPreference: 'maintain-framerate';
  label: string;
};

const SCREEN_PROFILES: Record<ScreenQuality, ScreenProfile> = {
  low: {
    width: 854, height: 480, frameRate: 60,
    maxBitrate: 1_500_000, maxFramerate: 60,
    degradationPreference: 'maintain-framerate',
    label: 'Low · 854×480 · 60 FPS · 1.5 Mbps',
  },
  medium: {
    width: 1280, height: 720, frameRate: 60,
    maxBitrate: 3_500_000, maxFramerate: 60,
    degradationPreference: 'maintain-framerate',
    label: 'Medium · 1280×720 · 60 FPS · 3.5 Mbps',
  },
  high: {
    width: 1920, height: 1080, frameRate: 60,
    maxBitrate: 6_000_000, maxFramerate: 60,
    degradationPreference: 'maintain-framerate',
    label: 'High · 1920×1080 · 60 FPS · 6 Mbps',
  },
  ultra: {
    width: 2560, height: 1440, frameRate: 144,
    maxBitrate: 14_000_000, maxFramerate: 144,
    degradationPreference: 'maintain-framerate',
    label: 'Ultra · 2560×1440 · 144 FPS · 14 Mbps',
  },
};

export function screenCaptureFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  return { width: profile.width, height: profile.height, frameRate: profile.frameRate };
}

export function screenPublishFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  return {
    simulcast: false,
    screenShareEncoding: {
      maxBitrate: profile.maxBitrate,
      maxFramerate: profile.maxFramerate,
      priority: 'high' as const,
    },
    degradationPreference: profile.degradationPreference,
  };
}

export function screenReceiveFor(quality: ScreenQuality) {
  const profile = SCREEN_PROFILES[quality];
  return { width: profile.width, height: profile.height, fps: profile.maxFramerate };
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
