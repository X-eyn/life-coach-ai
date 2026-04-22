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
  if (peaks.length === 0) return new Array(count).fill(0) as number[];
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
 * Uses RMS (root-mean-square) per window for perceptually accurate bar heights —
 * RMS matches perceived loudness far better than raw max-peak picking.
 * Falls back to a flat zero array (no fake data) if decoding fails.
 */
export async function decodeWaveformPeaks(file: File, count: number): Promise<number[]> {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return new Array(count).fill(0) as number[];

  const ctx = new Ctor();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));

    // Mix all channels to mono for a single amplitude trace
    const numCh = decoded.numberOfChannels;
    const frameCount = decoded.length;
    const mono = new Float32Array(frameCount);
    for (let c = 0; c < numCh; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < frameCount; i++) mono[i] += ch[i] ?? 0;
    }
    if (numCh > 1) {
      for (let i = 0; i < frameCount; i++) mono[i] /= numCh;
    }

    const spc = Math.floor(frameCount / count);
    const raw: number[] = [];

    for (let i = 0; i < count; i++) {
      const start = i * spc;
      const end = Math.min(start + spc, frameCount);
      let sumSq = 0;
      for (let j = start; j < end; j++) {
        const s = mono[j] ?? 0;
        sumSq += s * s;
      }
      // RMS amplitude for this window
      raw.push(Math.sqrt(sumSq / Math.max(1, end - start)));
    }

    // Normalise to [0, 1]
    const peak = Math.max(...raw, 0.001);
    const normalised = raw.map((v) => v / peak);

    // Mild log-scaling so quiet sections are still visible but loud sections
    // don't overshadow everything (log base 10 of 1 + v*9 maps 0→0, 1→1)
    const logScaled = normalised.map((v) =>
      v < 0.001 ? 0 : Math.log(1 + v * 9) / Math.log(10),
    );
    const logPeak = Math.max(...logScaled, 0.001);
    return logScaled.map((v) => v / logPeak);
  } catch {
    // Return zeros — do NOT generate fake random data
    return new Array(count).fill(0) as number[];
  } finally {
    await ctx.close().catch(() => {});
  }
}
