export const RNNOISE_VAD_OPEN_PROBABILITY = 0.7;
export const RNNOISE_VAD_ATTACK_KEEP_PROBABILITY = 0.58;
export const RNNOISE_VAD_KEEP_PROBABILITY = 0.3;
export const RNNOISE_VAD_MIN_SPEECH_MS = 60;
export const RNNOISE_VAD_FRESH_MS = 180;

export class RnnoiseVadState {
  probability = 0;
  updatedAt = Number.NEGATIVE_INFINITY;
  private speechSince = 0;

  push(probability: number, now: number) {
    const next = Math.max(0, Math.min(1, Number.isFinite(probability) ? probability : 0));
    this.probability = next;
    this.updatedAt = now;

    if (next >= RNNOISE_VAD_OPEN_PROBABILITY) {
      if (!this.speechSince) this.speechSince = now;
    } else if (next < RNNOISE_VAD_ATTACK_KEEP_PROBABILITY) {
      // A desk/keyboard impact often produces one or two very confident frames and
      // then collapses immediately. Reset the attack timer instead of allowing those
      // isolated frames to accumulate into a false speech open.
      this.speechSince = 0;
    }
  }

  hasData() {
    return Number.isFinite(this.updatedAt);
  }

  isFresh(now: number) {
    return this.hasData() && now - this.updatedAt <= RNNOISE_VAD_FRESH_MS;
  }

  isSpeechStable(now: number) {
    return this.isFresh(now)
      && this.probability >= RNNOISE_VAD_ATTACK_KEEP_PROBABILITY
      && Boolean(this.speechSince)
      && now - this.speechSince >= RNNOISE_VAD_MIN_SPEECH_MS;
  }

  shouldKeepOpen(now: number) {
    return this.isFresh(now) && this.probability >= RNNOISE_VAD_KEEP_PROBABILITY;
  }

  reset() {
    this.probability = 0;
    this.updatedAt = Number.NEGATIVE_INFINITY;
    this.speechSince = 0;
  }
}
