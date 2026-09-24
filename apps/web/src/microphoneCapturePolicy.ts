type PatchedMediaDevices = MediaDevices & { __shakechatOriginalGetUserMedia?: MediaDevices['getUserMedia'] };
type PatchedTrackPrototype = MediaStreamTrack & { __shakechatOriginalApplyConstraints?: MediaStreamTrack['applyConstraints'] };

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

function forceAudioTrackAgcOff(constraints?: MediaTrackConstraints): MediaTrackConstraints | undefined {
  if (!constraints) return constraints;
  return { ...constraints, autoGainControl: false };
}

function installGetUserMediaPolicy() {
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
    console.info('[voice] browser AGC disabled at microphone capture');
  } catch (error) {
    try {
      mediaDevices.getUserMedia = wrapped;
      mediaDevices.__shakechatOriginalGetUserMedia = original;
      console.info('[voice] browser AGC disabled through direct MediaDevices override');
    } catch {
      console.warn('[voice] could not override browser microphone capture policy', error);
    }
  }
}

function installTrackConstraintPolicy() {
  if (typeof MediaStreamTrack === 'undefined' || !MediaStreamTrack.prototype?.applyConstraints) return;
  const prototype = MediaStreamTrack.prototype as PatchedTrackPrototype;
  if (prototype.__shakechatOriginalApplyConstraints) return;

  const original = prototype.applyConstraints;
  const wrapped: MediaStreamTrack['applyConstraints'] = function (this: MediaStreamTrack, constraints?: MediaTrackConstraints) {
    return original.call(this, this.kind === 'audio' ? forceAudioTrackAgcOff(constraints) : constraints);
  };

  try {
    Object.defineProperty(prototype, '__shakechatOriginalApplyConstraints', {
      configurable: true,
      value: original,
    });
    Object.defineProperty(prototype, 'applyConstraints', {
      configurable: true,
      writable: true,
      value: wrapped,
    });
    console.info('[voice] browser AGC locked off for live audio constraint updates; ShakeChat AGC owns gain');
  } catch (error) {
    console.warn('[voice] could not lock browser AGC off for track constraints', error);
  }
}

installGetUserMediaPolicy();
installTrackConstraintPolicy();

export { forceAudioTrackAgcOff, forceBrowserAgcOff };
