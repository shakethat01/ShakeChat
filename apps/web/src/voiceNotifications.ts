export type VoiceSound = 'join' | 'leave' | 'stream-start' | 'stream-stop' | 'viewer';
const notes: Record<VoiceSound, number[]> = {
  join: [520, 780],
  leave: [650, 390],
  'stream-start': [659, 880, 1175],
  'stream-stop': [660, 440],
  viewer: [880, 1100],
};
const gainMultiplier: Record<VoiceSound, number> = {
  join: 1,
  leave: 1,
  'stream-start': 1.35,
  'stream-stop': 1,
  viewer: 1,
};
let context: AudioContext | undefined;

export function createVoiceSoundGate(windowMs = 180) {
  const lastByEvent = new Map<VoiceSound, number>();
  return (event: VoiceSound, now = Date.now()) => {
    const previous = lastByEvent.get(event);
    if (previous !== undefined && now - previous < windowMs) return false;
    lastByEvent.set(event, now);
    return true;
  };
}

const canPlaySound = createVoiceSoundGate();

export function playVoiceSound(event: VoiceSound, volume: number, outputDevice = '') {
  if (!volume || typeof AudioContext === 'undefined') return;
  // Suppress duplicate copies of the same LiveKit event, but do not let a
  // channel join/leave sound swallow a stream-start notification.
  if (!canPlaySound(event)) return;
  try {
    context ??= new AudioContext();
    const audio = context;
    const start = async () => {
      if (audio.state === 'suspended') await audio.resume();
      const output = audio as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      await output.setSinkId?.(outputDevice || 'default').catch(() => undefined);
      const now = audio.currentTime;
      notes[event].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const t = now + index * 0.095;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, t);
        const peak = Math.min(100, Math.max(0, volume)) / 100 * 0.12 * gainMultiplier[event];
        gain.gain.linearRampToValueAtTime(peak, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(t); oscillator.stop(t + 0.1);
      });
    };
    void start().catch(() => undefined);
  } catch { /* Notification failures never interrupt voice. */ }
}
