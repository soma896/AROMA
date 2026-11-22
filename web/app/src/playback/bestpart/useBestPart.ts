import { create } from 'zustand';
import type { LyricLine } from '@/lyrics/model';
import { getAudio, usePlayer } from '@/state/player';
import { detectBestPart, type HeatmapData } from './aiDetector';
import { getBestPart, saveBestPart, verifyBestPart } from './repository';
import type { BestPartDetectionMethod, BestPartMetadata } from './types';

export interface BestPartState {
  currentSongId: string | null;
  metadata: BestPartMetadata | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'unverified';
  heardTracks: Record<string, boolean>;
  notification: string | null;
  adminModalOpen: boolean;

  loadForSong: (songId: string, durationSec?: number, lyrics?: LyricLine[]) => Promise<BestPartMetadata | null>;
  jumpToBestPart: () => Promise<boolean>;
  setHeard: (songId: string, heard: boolean) => void;
  runAiDetection: (lyrics?: LyricLine[], heatmap?: HeatmapData) => Promise<BestPartMetadata>;
  saveAndVerify: (startSec: number, endSec: number, method?: BestPartDetectionMethod) => Promise<BestPartMetadata>;
  setAdminModalOpen: (open: boolean) => void;
  clearNotification: () => void;
}

export const useBestPart = create<BestPartState>()((set, get) => ({
  currentSongId: null,
  metadata: null,
  status: 'idle',
  heardTracks: {},
  notification: null,
  adminModalOpen: false,

  setAdminModalOpen: (open: boolean) => set({ adminModalOpen: open }),
  clearNotification: () => set({ notification: null }),
  setHeard: (songId: string, heard: boolean) =>
    set((s) => ({ heardTracks: { ...s.heardTracks, [songId]: heard } })),

  loadForSong: async (songId: string, durationSec = 0, lyrics: LyricLine[] = []) => {
    if (!songId) {
      set({ currentSongId: null, metadata: null, status: 'idle' });
      return null;
    }

    set({ currentSongId: songId, status: 'loading' });

    // 1. Check existing repository metadata
    let meta = await getBestPart(songId);

    // 2. If no saved metadata exists yet, run AI detection in background
    if (!meta) {
      const detected = detectBestPart({
        songId,
        durationSec,
        lyrics,
      });

      meta = {
        songId,
        startSec: detected.startSec,
        endSec: detected.endSec,
        verified: true, // auto-verified by AI detection so Best Part is ready for all songs
        method: detected.method,
        confidence: detected.confidence,
        updatedAt: Date.now(),
      };
      // Cache in repository
      await saveBestPart(meta);
    }

    set({ metadata: meta, status: 'ready' });
    return meta;
  },

  jumpToBestPart: async () => {
    const player = usePlayer.getState();
    const nowPlaying = player.nowPlaying;
    if (!nowPlaying?.videoId) return false;

    let { metadata } = get();
    if (!metadata || metadata.songId !== nowPlaying.videoId) {
      metadata = await get().loadForSong(nowPlaying.videoId, nowPlaying.durationSec ?? 0);
    }

    if (!metadata || metadata.startSec <= 0) {
      return false;
    }

    // 1. Immediately seek the existing audio player to the Best Part start timestamp
    player.seek(metadata.startSec);

    // 2. Start playback from that position (do not restart song, keep existing player)
    const audio = getAudio();
    if (audio && audio.paused) {
      void audio.play().catch(() => {});
    }

    // 3. Mark track as heard so the Best Part button immediately disappears
    set((s) => ({
      heardTracks: { ...s.heardTracks, [nowPlaying.videoId]: true },
      notification: null,
    }));

    return true;
  },

  runAiDetection: async (lyrics?: LyricLine[], heatmap?: HeatmapData) => {
    const { currentSongId, metadata } = get();
    const player = usePlayer.getState();
    const songId = currentSongId || player.nowPlaying?.videoId;
    if (!songId) throw new Error('No song currently playing');

    const durationSec = player.nowPlaying?.durationSec ?? 0;
    const detected = detectBestPart({
      songId,
      durationSec,
      lyrics,
      heatmap,
    });

    const updated: BestPartMetadata = {
      songId,
      startSec: detected.startSec,
      endSec: detected.endSec,
      verified: true,
      method: detected.method,
      confidence: detected.confidence,
      title: metadata?.title || player.nowPlaying?.title,
      artist: metadata?.artist || player.nowPlaying?.artist,
      updatedAt: Date.now(),
    };

    await saveBestPart(updated);
    set({ metadata: updated, status: 'ready' });
    return updated;
  },

  saveAndVerify: async (startSec: number, endSec: number, method: BestPartDetectionMethod = 'manual') => {
    const { currentSongId, metadata } = get();
    const player = usePlayer.getState();
    const songId = currentSongId || player.nowPlaying?.videoId;
    if (!songId) throw new Error('No song currently playing');

    const verified = await verifyBestPart(songId, startSec, endSec, method, {
      title: metadata?.title || player.nowPlaying?.title,
      artist: metadata?.artist || player.nowPlaying?.artist,
      confidence: 1.0,
    });

    set({
      metadata: verified,
      status: 'ready',
      adminModalOpen: false,
      notification: null,
    });

    return verified;
  },
}));

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}
