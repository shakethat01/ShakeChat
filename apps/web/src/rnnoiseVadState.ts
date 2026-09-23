export const RNNOISE_VAD_OPEN_PROBABILITY = 0.52;
export const RNNOISE_VAD_KEEP_PROBABILITY = 0.28;
export const RNNOISE_VAD_MIN_SPEECH_MS = 20;
export const RNNOISE_VAD_FRESH_MS = 140;

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
    } else if (next < RNNOISE_VAD_KEEP_PROBABILITY) {
      this.speechSince = 0;
    }
  }

  isFresh(now: number) {
    return now - this.updatedAt <= RNNOISE_VAD_FRESH_MS;
  }

  isSpeechStable(now: number) {
    return this.isFresh(now) && this.probability >= RNNOISE_VAD_OPEN_PROBABILITY && Boolean(this.speechSince) && now - this.speechSince >= RNNOISE_VAD_MIN_SPEECH_MS;
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
