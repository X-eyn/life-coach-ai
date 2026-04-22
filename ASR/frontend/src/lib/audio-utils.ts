// Shared audio utilities — imported by waveform-player, mini-waveform, and library save flow.

export const SPEAKER_COLORS = ['#cf5a43', '#1f7e7a', '#3456d6', '#c9900e'] as const;

export const MINI_PEAKS_COUNT = 30;
export const FULL_PEAKS_COUNT = 600;

/**
 * Downsamples a peaks array to `count` entries using average pooling within each window.
 * Average pooling preserves the loud/quiet contrast so the thumbnail matches the main waveform
 * (max-pooling would collapse everything to the envelope, making bars look uniformly tall).
 */
export function downsamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return Array.from({ length: count }, () => 0.3);
  if (peaks.length <= count) {
    return Array.from({ length: count }, (_, i) => {
      const src = Math.min(Math.floor((i / count) * peaks.length), peaks.length - 1);
      return peaks[src] ?? 0;
    });
  }
  const ratio = peaks.length / count;
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), peaks.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += peaks[j] ?? 0;
    return sum / Math.max(1, end - start);
  });
}

/**
 * Decodes `count` amplitude peak samples from an audio File using Web Audio API.
 * Applies log scaling so quiet speech still registers visually.
 */
export async function decodeWaveformPeaks(file: File, count: number): Promise<number[]> {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return Array.from({ length: count }, () => 0.3);

  const ctx = new Ctor();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const ch = decoded.getChannelData(0);
    const spc = Math.floor(ch.length / count);
    const raw: number[] = [];

    for (let i = 0; i < count; i++) {
      const start = i * spc;
      const end = Math.min(start + spc, ch.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(ch[j] ?? 0);
        if (abs > max) max = abs;
      }
      raw.push(max);
    }

    const peak = Math.max(...raw, 0.001);
    const normalised = raw.map((v) => v / peak);
    const logScaled = normalised.map((v) =>
      v < 0.001 ? 0 : Math.log(1 + v * 9) / Math.log(10),
    );
    const logPeak = Math.max(...logScaled, 0.001);
    return logScaled.map((v) => v / logPeak);
  } catch {
    return Array.from({ length: count }, (_, i) =>
      Math.max(0.05, Math.abs(Math.sin(i * 0.25 + 0.5)) * 0.8),
    );
  } finally {
    await ctx.close().catch(() => {});
  }
}
