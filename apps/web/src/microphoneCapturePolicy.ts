type PatchedMediaDevices = MediaDevices & { __shakechatOriginalGetUserMedia?: MediaDevices['getUserMedia'] };

function forceBrowserAgcOff(constraints?: MediaStreamConstraints): MediaStreamConstraints | undefined {
  if (!constraints?.audio) return constraints;
  const audio = constraints.audio === true ? {} : constraints.audio;
  return {
    ...constraints,
    audio: {
      ...audio,
      autoGainControl: false,
    },
  };
}

function installMicrophoneCapturePolicy() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  const mediaDevices = navigator.mediaDevices as PatchedMediaDevices;
  if (mediaDevices.__shakechatOriginalGetUserMedia) return;

  const original = mediaDevices.getUserMedia.bind(mediaDevices);
  const wrapped: MediaDevices['getUserMedia'] = constraints => original(forceBrowserAgcOff(constraints));

  try {
    Object.defineProperty(mediaDevices, '__shakechatOriginalGetUserMedia', {
      configurable: true,
      value: original,
    });
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: wrapped,
    });
    console.info('[voice] browser AGC disabled; ShakeChat speech-aware AGC owns microphone gain');
  } catch (error) {
    try {
      mediaDevices.getUserMedia = wrapped;
      mediaDevices.__shakechatOriginalGetUserMedia = original;
      console.info('[voice] browser AGC disabled through direct MediaDevices override');
    } catch {
      console.warn('[voice] could not override browser AGC capture policy', error);
    }
  }
}

installMicrophoneCapturePolicy();

export { forceBrowserAgcOff };
