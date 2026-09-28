export type VoiceSound = 'join' | 'leave' | 'stream-start' | 'stream-stop' | 'viewer';
const notes: Record<VoiceSound, number[]> = { join: [520, 780], leave: [650, 390], 'stream-start': [440, 660, 880], 'stream-stop': [660, 440], viewer: [880, 1100] };
let context: AudioContext | undefined;
let lastSound = 0;

export function playVoiceSound(event: VoiceSound, volume: number, outputDevice = '') {
  if (!volume || typeof AudioContext === 'undefined') return;
  // A reconnect or a batch of events must not create a notification storm.
  if (Date.now() - lastSound < 180) return;
  lastSound = Date.now();
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
        gain.gain.linearRampToValueAtTime(Math.min(100, Math.max(0, volume)) / 100 * 0.12, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(t); oscillator.stop(t + 0.1);
      });
    };
    void start().catch(() => undefined);
  } catch { /* Notification failures never interrupt voice. */ }
}
