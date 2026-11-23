// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { line, type LyricLine } from '@/lyrics/model';
import { usePlayer } from '@/state/player';
import {
  calculateFallbackBestPart,
  detectBestPart,
  detectChorusFromLyrics,
  detectPeakFromHeatmap,
  normalizeLyricText,
  snapToLyricLine,
  type HeatmapData,
} from './aiDetector';
import { getBestPart, saveBestPart, verifyBestPart } from './repository';
import { useBestPart } from './useBestPart';

describe('Best Part AI Detection Engine', () => {
  it('normalizes multi-lingual lyrics correctly (Telugu, Hindi, English)', () => {
    // English
    expect(normalizeLyricText("Don't stop the music!  ")).toBe('dont stop the music');

    // Telugu: 'పడ్డానండి ప్రేమలో'
    const telugu = 'పడ్డానండి ప్రేమలో!';
    expect(normalizeLyricText(telugu)).toBe('పడ్డానండి ప్రేమలో');

    // Hindi: 'तुझे देखा तो ये जाना सनम'
    const hindi = 'तुझे देखा तो, ये जाना सनम...';
    expect(normalizeLyricText(hindi)).toBe('तुझे देखा तो ये जाना सनम');
  });

  it('detects repeated Telugu chorus from timed lyrics', () => {
    // Simulating Telugu song with chorus repeated in Pallavi and after Charanams
    const lyrics: LyricLine[] = [
      line(2_000, 'సంగీతం మొదలయ్యింది'), // Intro (skipped)
      line(15_000, 'పడ్డానండి ప్రేమలో మరి'), // Chorus Line 1
      line(19_000, 'పిచ్చి పట్టి తిరిగాను నిన్నే కోరి'), // Chorus Line 2
      line(45_000, 'మొదటి చరణం ఒక అందమైన పాట'),
      line(50_000, 'గుండెలోన దాగున్న మాట'),
      line(75_000, 'పడ్డానండి ప్రేమలో మరి'), // Chorus Repeat 1
      line(79_000, 'పిచ్చి పట్టి తిరిగాను నిన్నే కోరి'),
      line(110_000, 'రెండవ చరణం సాగెను మురిసి'),
      line(140_000, 'పడ్డానండి ప్రేమలో మరి'), // Chorus Repeat 2
      line(144_000, 'పిచ్చి పట్టి తిరిగాను నిన్నే కోరి'),
    ];

    const detected = detectChorusFromLyrics(lyrics, 180);
    expect(detected).not.toBeNull();
    // Earliest chorus starts at 15s (15.0 - 0.25 = 14.75 -> rounded 14.8s)
    expect(detected!.startSec).toBeGreaterThanOrEqual(14);
    expect(detected!.startSec).toBeLessThanOrEqual(16);
    expect(detected!.snippet).toContain('పడ్డానండి');
  });

  it('detects repeated English chorus hook', () => {
    const lyrics: LyricLine[] = [
      line(4_000, 'Instrumental intro'),
      line(12_000, 'Verse one starts here'),
      line(16_000, 'Walking down the lonely road'),
      line(30_000, 'This is the best part of the song'), // Chorus
      line(34_000, 'We are singing out loud together'),
      line(60_000, 'Verse two another story'),
      line(80_000, 'This is the best part of the song'), // Chorus repeat
      line(84_000, 'We are singing out loud together'),
    ];

    const detected = detectChorusFromLyrics(lyrics, 150);
    expect(detected).not.toBeNull();
    expect(detected!.startSec).toBeGreaterThanOrEqual(29);
    expect(detected!.startSec).toBeLessThanOrEqual(31);
    expect(detected!.snippet).toBe('This is the best part of the song');
  });

  it('returns null when lyrics do not repeat (no chorus)', () => {
    const verses: LyricLine[] = [
      line(10_000, 'First verse unique words'),
      line(25_000, 'Second verse completely different words'),
      line(40_000, 'Third verse also completely new sentence'),
      line(55_000, 'Fourth line nothing repeats here at all'),
    ];
    expect(detectChorusFromLyrics(verses, 120)).toBeNull();
  });

  it('detects peak rise from YouTube replayed heatmap', () => {
    // 100 segments of 2s each = 200s song
    const intensity = new Array(100).fill(0.3);
    // Add peak rise around segment 40-50 (80s - 100s)
    for (let i = 40; i <= 50; i++) {
      intensity[i] = 0.95;
    }

    const heatmap: HeatmapData = {
      segmentMs: 2000,
      intensity,
    };

    const peak = detectPeakFromHeatmap(heatmap, 200);
    expect(peak).not.toBeNull();
    // Peak onset around segment 40 (80 seconds)
    expect(peak!.startSec).toBeGreaterThanOrEqual(70);
    expect(peak!.startSec).toBeLessThanOrEqual(85);
  });

  it('corroborates heatmap peak and lyrics chorus with high confidence', () => {
    const lyrics: LyricLine[] = [
      line(10_000, 'Intro line'),
      line(42_000, 'Dimaak Kharaab hook line'),
      line(70_000, 'Middle verse'),
      line(110_000, 'Dimaak Kharaab hook line'),
    ];

    const intensity = new Array(80).fill(0.25);
    for (let i = 20; i <= 25; i++) {
      intensity[i] = 0.9; // 2s * 21 = 42s
    }

    const result = detectBestPart({
      songId: 'dimaak_kharaab',
      durationSec: 160,
      lyrics,
      heatmap: { segmentMs: 2000, intensity },
    });

    expect(result.method).toBe('ai');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.startSec).toBeGreaterThanOrEqual(41);
    expect(result.startSec).toBeLessThanOrEqual(43);
  });

  it('snaps cleanly to nearest lyric line start (-250ms lead-in)', () => {
    const lines: LyricLine[] = [
      line(30_000, 'Line 1'),
      line(45_200, 'Line 2'), // 45.2s
      line(60_000, 'Line 3'),
    ];

    // Target 45.5s should snap to 45.2s - 0.25s = 44.95s (approx 45.0s)
    const snapped = snapToLyricLine(45.5, lines);
    expect(snapped).toBeCloseTo(45.0, 1);
  });

  it('uses fallback when no lyrics or heatmap available', () => {
    const fallback = calculateFallbackBestPart(200);
    expect(fallback.startSec).toBeGreaterThanOrEqual(40);
    expect(fallback.endSec).toBeGreaterThan(fallback.startSec);
  });
});

describe('Best Part Repository & Storage', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('saves and retrieves Best Part metadata', async () => {
    await saveBestPart({
      songId: 'song_test_1',
      startSec: 35.5,
      endSec: 65.5,
      verified: true,
      method: 'ai',
      confidence: 0.94,
      title: 'Paddanandi',
      artist: 'Udit Narayan',
    });

    const meta = await getBestPart('song_test_1');
    expect(meta).not.toBeNull();
    expect(meta!.startSec).toBe(35.5);
    expect(meta!.endSec).toBe(65.5);
    expect(meta!.verified).toBe(true);
    expect(meta!.method).toBe('ai');
  });

  it('verifies Best Part with admin action', async () => {
    const verified = await verifyBestPart('song_test_2', 50, 80, 'manual', {
      title: 'Student No 1',
    });

    expect(verified.verified).toBe(true);
    expect(verified.startSec).toBe(50);
    expect(verified.endSec).toBe(80);
    expect(verified.method).toBe('manual');
  });
});

describe('Best Part Player Interaction & Seeking', () => {
  it('seeks existing player to Best Part timestamp without recreating player', async () => {
    // Setup player state
    usePlayer.setState({
      nowPlaying: {
        videoId: 'song_demo_best',
        title: 'Student No 1',
        artist: 'Keeravani',
        durationSec: 240,
        artworkUrl: null,
        streamInfo: null,
        stream: null,
      },
      status: 'playing',
    });

    // Save verified metadata
    await verifyBestPart('song_demo_best', 64.5, 94.5, 'manual');

    // Load into useBestPart
    await useBestPart.getState().loadForSong('song_demo_best', 240);

    const seekSpy = vi.spyOn(usePlayer.getState(), 'seek');

    // Trigger jumpToBestPart
    const jumped = await useBestPart.getState().jumpToBestPart();
    expect(jumped).toBe(true);
    expect(seekSpy).toHaveBeenCalledWith(64.5);
    // Button is marked heard so it disappears
    expect(useBestPart.getState().heardTracks['song_demo_best']).toBe(true);
    // Does not show popups / notifications
    expect(useBestPart.getState().notification).toBeNull();

    // Clicking again jumps back to the same start timestamp
    await useBestPart.getState().jumpToBestPart();
    expect(seekSpy).toHaveBeenLastCalledWith(64.5);
  });

  it('marks track as heard and does not display any toast or popups on click', async () => {
    usePlayer.setState({
      nowPlaying: {
        videoId: 'song_clean_jump',
        title: 'Song Clean Jump',
        artist: 'Artist',
        durationSec: 200,
        artworkUrl: null,
        streamInfo: null,
        stream: null,
      },
      status: 'playing',
    });

    await verifyBestPart('song_clean_jump', 50, 80, 'manual');
    await useBestPart.getState().loadForSong('song_clean_jump', 200);
    const jumped = await useBestPart.getState().jumpToBestPart();
    expect(jumped).toBe(true);
    expect(useBestPart.getState().heardTracks['song_clean_jump']).toBe(true);
    expect(useBestPart.getState().notification).toBeNull();
  });
});
