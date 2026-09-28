type Counter = { time: number; frames: number; bytes: number };
export type StreamMetrics = { width: number; height: number; fps?: number; kbps?: number; limitation?: string };

/** Each RTP stream has its own counters; never label a capture target as measured FPS. */
export class StreamStats {
  private previous = new Map<string, Counter>();
  sample(report: RTCStatsReport | undefined, local: boolean): StreamMetrics {
    let best: StreamMetrics = { width: 0, height: 0 };
    const current = new Map<string, Counter>();
    report?.forEach(stat => {
      if (stat.type !== (local ? 'outbound-rtp' : 'inbound-rtp') || stat.isRemote || (stat.kind ?? stat.mediaType) !== 'video') return;
      const counter = { time: Number(stat.timestamp), frames: Number(local ? stat.framesEncoded : stat.framesDecoded), bytes: Number(local ? stat.bytesSent : stat.bytesReceived) };
      const last = this.previous.get(stat.id);
      current.set(stat.id, counter);
      const seconds = last ? (counter.time - last.time) / 1000 : 0;
      const deltaValid = !!last && seconds > 0 && seconds < 15 && counter.frames >= last.frames;
      const measured = typeof stat.framesPerSecond === 'number' && Number.isFinite(stat.framesPerSecond) ? stat.framesPerSecond : deltaValid ? (counter.frames - last!.frames) / seconds : undefined;
      const value: StreamMetrics = {
        width: Number(stat.frameWidth) || 0, height: Number(stat.frameHeight) || 0,
        fps: measured === undefined ? undefined : Math.round(measured),
        kbps: last && seconds > 0 && seconds < 15 && counter.bytes >= last.bytes ? Math.round((counter.bytes - last.bytes) * 8 / seconds / 1000) : undefined,
        limitation: stat.qualityLimitationReason !== 'none' ? stat.qualityLimitationReason : undefined,
      };
      if (value.width * value.height >= best.width * best.height) best = value;
    });
    this.previous = current;
    return best;
  }
}
