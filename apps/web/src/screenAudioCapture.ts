type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  systemAudio?: 'include' | 'exclude';
  windowAudio?: 'system' | 'window' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
};

type ExtendedAudioConstraints = MediaTrackConstraints & {
  restrictOwnAudio?: ConstrainBoolean;
  suppressLocalAudioPlayback?: ConstrainBoolean;
};

type SupportedDisplayAudioConstraints = MediaTrackSupportedConstraints & {
  restrictOwnAudio?: boolean;
};

export function withSystemAudioOptions(
  options: DisplayMediaStreamOptions | undefined,
  supported: SupportedDisplayAudioConstraints = {},
): DisplayMediaStreamOptions {
  const wantsAudio = options?.audio !== undefined && options.audio !== false;
  if (!wantsAudio) return options ?? { video: true };

  const requestedAudio = options?.audio;
  const audio: ExtendedAudioConstraints = {
    ...(typeof requestedAudio === 'object' ? requestedAudio : {}),
    suppressLocalAudioPlayback: false,
    ...(supported.restrictOwnAudio ? { restrictOwnAudio: true } : {}),
  };

  return {
    ...(options ?? {}),
    audio,
    systemAudio: 'include',
    windowAudio: 'system',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'include',
  } as ExtendedDisplayMediaStreamOptions;
}

let installed = false;

export function installSystemAudioDisplayCapture() {
  if (installed || typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return;

  const mediaDevices = navigator.mediaDevices;
  const originalGetDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);
  const supported = (typeof mediaDevices.getSupportedConstraints === 'function'
    ? mediaDevices.getSupportedConstraints()
    : {}) as SupportedDisplayAudioConstraints;

  const getDisplayMedia = async (options?: DisplayMediaStreamOptions) => {
    const enhanced = withSystemAudioOptions(options, supported);
    const stream = await originalGetDisplayMedia(enhanced);
    const audioAvailable = stream.getAudioTracks().length > 0;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shakechat:screen-audio-capture', {
        detail: { available: audioAvailable },
      }));
    }

    if (options?.audio && !audioAvailable) {
      console.warn('[voice] screen share started without a system-audio track', enhanced);
    }
    return stream;
  };

  Object.defineProperty(mediaDevices, 'getDisplayMedia', {
    configurable: true,
    writable: true,
    value: getDisplayMedia,
  });
  installed = true;
}

installSystemAudioDisplayCapture();
