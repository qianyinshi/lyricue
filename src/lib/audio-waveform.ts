export interface AudioWaveform {
  min: Float32Array;
  max: Float32Array;
  durationMs: number;
  binMs: number;
  peak: number;
}

/** Real channel extrema in 1 ms bins, retained without keeping the decoded PCM. */
export function buildAudioWaveform(channels: Float32Array[], sampleRate: number): AudioWaveform {
  const length = channels[0]?.length ?? 0;
  const binSize = Math.max(1, Math.round(sampleRate / 1000));
  const count = Math.ceil(length / binSize);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  let peak = 0;
  for (let bin = 0; bin < count; bin++) {
    const end = Math.min(length, (bin + 1) * binSize);
    let low = 0, high = 0;
    for (const channel of channels) {
      for (let cursor = bin * binSize; cursor < end; cursor++) {
        const sample = channel[cursor];
        low = Math.min(low, sample);
        high = Math.max(high, sample);
      }
    }
    min[bin] = low;
    max[bin] = high;
    peak = Math.max(peak, -low, high);
  }
  return { min, max, durationMs: length / sampleRate * 1000, binMs: binSize / sampleRate * 1000, peak };
}
