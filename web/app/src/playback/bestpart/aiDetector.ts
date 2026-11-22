import { isGap, type LyricLine } from '@/lyrics/model';
import type { BestPartDetectionResult } from './types';

export interface HeatmapData {
  segmentMs: number;
  intensity: number[];
}

const SKIP_HEAD_SEC = 5;
const SKIP_TAIL_SEC = 25;
const MIN_SONG_SEC = 45;
const DEFAULT_BEST_PART_DURATION_SEC = 30;

/**
 * Normalizes lyric lines across diverse languages (Telugu, Hindi, Tamil, English, etc.)
 * by preserving Unicode letter characters and digits while removing punctuation and excess whitespace.
 */
export function normalizeLyricText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the primary chorus / hook timestamp from synchronized lyric lines.
 * Works seamlessly across Indian languages (Telugu, Hindi, Tamil) and English.
 */
export function detectChorusFromLyrics(lines: LyricLine[], durationSec = 0): { startSec: number; endSec: number; snippet: string } | null {
  if (durationSec > 0 && durationSec < MIN_SONG_SEC) return null;
  const timed = lines.filter((l) => l.timeMs >= 0 && !isGap(l) && l.text.trim().length > 0);
  if (timed.length < 4) return null;

  const normalized = timed.map((l) => normalizeLyricText(l.text));
  const counts = new Map<string, number>();

  for (const text of normalized) {
    if (text.length >= 3) {
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }

  // A chorus must repeat at least 2 times
  if (maxCount < 2) return null;

  const maxDurationLimitSec = durationSec > 0 ? durationSec - SKIP_TAIL_SEC : Number.MAX_SAFE_INTEGER;

  // Find the earliest occurrence of a top-repeated line that begins after the intro
  const firstIndex = normalized.findIndex((text, idx) => {
    const timeSec = timed[idx]!.timeMs / 1000;
    return (counts.get(text) ?? 0) === maxCount && timeSec >= SKIP_HEAD_SEC && timeSec <= maxDurationLimitSec;
  });

  if (firstIndex === -1) return null;

  // Walk backwards over preceding lines of the same stanza (hook lines often follow initial chorus line)
  let startIndex = firstIndex;
  while (startIndex - 1 >= 0) {
    const prevText = normalized[startIndex - 1]!;
    const prevTimeSec = timed[startIndex - 1]!.timeMs / 1000;
    const count = counts.get(prevText) ?? 0;
    if (count < 2 || count < maxCount - 1) break;
    if (prevTimeSec < SKIP_HEAD_SEC || firstIndex - startIndex >= 4) break;
    startIndex--;
  }

  const startSec = Math.max(0, timed[startIndex]!.timeMs / 1000 - 0.25);
  // Estimate chorus end: look ahead ~3-5 lines or +30 seconds
  let endSec = startSec + DEFAULT_BEST_PART_DURATION_SEC;
  const lookaheadIndex = Math.min(timed.length - 1, startIndex + 6);
  if (lookaheadIndex > startIndex) {
    const nextStanzaTimeSec = timed[lookaheadIndex]!.timeMs / 1000;
    if (nextStanzaTimeSec > startSec + 15 && nextStanzaTimeSec <= startSec + 45) {
      endSec = nextStanzaTimeSec;
    }
  }

  if (durationSec > 0) {
    endSec = Math.min(endSec, durationSec - 5);
  }

  return {
    startSec: Math.round(startSec * 10) / 10,
    endSec: Math.round(endSec * 10) / 10,
    snippet: timed[startIndex]!.text.trim(),
  };
}

/**
 * Analyzes YouTube's "Most Replayed" heatmap intensity curve.
 * Identifies where listeners drag back to and where the biggest sustained rise occurs.
 */
export function detectPeakFromHeatmap(heatmap: HeatmapData, durationSec = 0): { startSec: number; endSec: number } | null {
  const n = heatmap.intensity.length;
  const segSec = heatmap.segmentMs / 1000;
  const totalDuration = durationSec > 0 ? durationSec : n * segSec;

  if (totalDuration < MIN_SONG_SEC || n < 10) return null;

  // 1. Moving average smoothing (half-window ~4.5s)
  const half = Math.max(1, Math.round(4.5 / segSec));
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    const from = Math.max(0, i - half);
    const to = Math.min(n - 1, i + half);
    for (let j = from; j <= to; j++) {
      sum += heatmap.intensity[j]!;
      count++;
    }
    smooth[i] = sum / count;
  }

  // 2. Baseline trend using median around each segment (window ~45s)
  const wide = Math.max(3, Math.round(45 / segSec));
  const trend = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(1, i - wide);
    const to = Math.min(n - 1, i + wide);
    const windowSlice = Array.from(smooth.slice(from, to + 1)).sort((a, b) => a - b);
    trend[i] = windowSlice[Math.floor(windowSlice.length / 2)] ?? 0.05;
  }

  // 3. Find candidates outside head and tail
  const headSec = Math.max(SKIP_HEAD_SEC, 2 * segSec);
  const tailSec = totalDuration - SKIP_TAIL_SEC;
  let bestIdx = -1;
  let maxRise = 0;

  for (let i = 0; i < n; i++) {
    const time = i * segSec;
    if (time < headSec || time > tailSec) continue;
    const tFloor = Math.max(0.05, trend[i]!);
    const rise = smooth[i]! / tFloor - 1;
    if (rise > maxRise && rise >= 0.08 && smooth[i]! - trend[i]! >= 0.03) {
      maxRise = rise;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;

  // 4. Trace back to where the heat started climbing
  const floorRise = maxRise * 0.5;
  let startIdx = bestIdx;
  while (startIdx > 0 && startIdx * segSec >= headSec) {
    const tFloor = Math.max(0.05, trend[startIdx - 1]!);
    const prevRise = smooth[startIdx - 1]! / tFloor - 1;
    if (prevRise < floorRise) break;
    startIdx--;
  }

  const startSec = Math.max(0, startIdx * segSec);
  const endSec = Math.min(totalDuration, startSec + DEFAULT_BEST_PART_DURATION_SEC);

  return {
    startSec: Math.round(startSec * 10) / 10,
    endSec: Math.round(endSec * 10) / 10,
  };
}

/** Snaps a target timestamp to the nearest lyric line start (-250ms lead-in). */
export function snapToLyricLine(targetSec: number, lines: LyricLine[]): number {
  const lineTimesSec = lines
    .filter((l) => l.timeMs >= 0 && !isGap(l))
    .map((l) => l.timeMs / 1000);

  if (lineTimesSec.length === 0) return Math.max(0, targetSec - 0.5);

  const candidates = lineTimesSec.filter((t) => t >= targetSec - 4 && t <= targetSec + 2);
  if (candidates.length === 0) return Math.max(0, targetSec - 0.5);

  let best = candidates[0]!;
  let bestDist = Math.abs(best - targetSec);
  for (const t of candidates) {
    const dist = Math.abs(t - targetSec) + (t > targetSec ? 1.5 : 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }

  return Math.max(0, Math.round((best - 0.25) * 10) / 10);
}

/** Fallback timestamp heuristic when no heatmap or synced lyrics exist. */
export function calculateFallbackBestPart(durationSec: number): { startSec: number; endSec: number } {
  if (durationSec <= 0) {
    return { startSec: 45, endSec: 75 };
  }
  if (durationSec < MIN_SONG_SEC) {
    return { startSec: 0, endSec: Math.min(30, durationSec) };
  }
  const start = Math.min(durationSec - SKIP_TAIL_SEC, Math.max(20, Math.round(durationSec * 0.32)));
  const end = Math.min(durationSec, start + DEFAULT_BEST_PART_DURATION_SEC);
  return { startSec: start, endSec: end };
}

/**
 * Comprehensive AI Detection engine for identifying the Best Part of any song.
 * Integrates multi-language lyrics chorus analysis, YouTube heatmap peaks, and musical structure.
 */
export function detectBestPart(options: {
  songId: string;
  durationSec?: number;
  lyrics?: LyricLine[];
  heatmap?: HeatmapData;
}): BestPartDetectionResult {
  const duration = options.durationSec ?? 0;
  const lines = options.lyrics ?? [];
  const heatmap = options.heatmap;

  const chorus = lines.length >= 4 ? detectChorusFromLyrics(lines, duration) : null;
  const heatPeak = heatmap ? detectPeakFromHeatmap(heatmap, duration) : null;

  // Case 1: Both Heatmap and Lyric Chorus are available
  if (heatPeak && chorus) {
    // If they corroborate each other (within 8 seconds)
    const delta = Math.abs(heatPeak.startSec - chorus.startSec);
    if (delta <= 8) {
      const snappedStart = snapToLyricLine(Math.min(heatPeak.startSec, chorus.startSec), lines);
      const endSec = Math.max(snappedStart + 20, Math.max(heatPeak.endSec, chorus.endSec));
      return {
        startSec: snappedStart,
        endSec,
        method: 'ai',
        confidence: 0.96,
        details: {
          chorusDetected: true,
          heatmapPeak: true,
          lyricSnippet: chorus.snippet,
        },
      };
    }

    // Favor chorus if distinct, snapped cleanly
    const snappedStart = snapToLyricLine(chorus.startSec, lines);
    return {
      startSec: snappedStart,
      endSec: chorus.endSec,
      method: 'ai',
      confidence: 0.90,
      details: {
        chorusDetected: true,
        heatmapPeak: true,
        lyricSnippet: chorus.snippet,
      },
    };
  }

  // Case 2: Only Lyric Chorus available
  if (chorus) {
    const snappedStart = snapToLyricLine(chorus.startSec, lines);
    return {
      startSec: snappedStart,
      endSec: chorus.endSec,
      method: 'lyrics',
      confidence: 0.86,
      details: {
        chorusDetected: true,
        lyricSnippet: chorus.snippet,
      },
    };
  }

  // Case 3: Only Heatmap available
  if (heatPeak) {
    const snappedStart = snapToLyricLine(heatPeak.startSec, lines);
    return {
      startSec: snappedStart,
      endSec: heatPeak.endSec,
      method: 'heatmap',
      confidence: 0.84,
      details: {
        heatmapPeak: true,
      },
    };
  }

  // Case 4: Fallback heuristic
  const fallback = calculateFallbackBestPart(duration);
  return {
    startSec: fallback.startSec,
    endSec: fallback.endSec,
    method: 'fallback',
    confidence: 0.52,
  };
}
