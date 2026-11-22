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
  notification: string | null;
  adminModalOpen: boolean;

  loadForSong: (songId: string, durationSec?: number, lyrics?: LyricLine[]) => Promise<BestPartMetadata | null>;
  jumpToBestPart: () => Promise<boolean>;
  runAiDetection: (lyrics?: LyricLine[], heatmap?: HeatmapData) => Promise<BestPartMetadata>;
  saveAndVerify: (startSec: number, endSec: number, method?: BestPartDetectionMethod) => Promise<BestPartMetadata>;
  setAdminModalOpen: (open: boolean) => void;
  clearNotification: () => void;
}

export const useBestPart = create<BestPartState>()((set, get) => ({
  currentSongId: null,
  metadata: null,
  status: 'idle',
  notification: null,
  adminModalOpen: false,

  setAdminModalOpen: (open: boolean) => set({ adminModalOpen: open }),
  clearNotification: () => set({ notification: null }),

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
        verified: false,
        method: detected.method,
        confidence: detected.confidence,
        updatedAt: Date.now(),
      };
      // Cache candidate in repository
      await saveBestPart(meta);
    }

    const status = meta.verified ? 'ready' : 'unverified';
    set({ metadata: meta, status });
    return meta;
  },

  jumpToBestPart: async () => {
    const player = usePlayer.getState();
    const nowPlaying = player.nowPlaying;
    if (!nowPlaying?.videoId) return false;

    const { metadata } = get();
    let meta = metadata;

    if (!meta || meta.songId !== nowPlaying.videoId) {
      meta = await get().loadForSong(nowPlaying.videoId, nowPlaying.durationSec ?? 0);
    }

    if (!meta) {
      set({
        notification: 'No Best Part available for this song yet. Click to add.',
        status: 'unavailable',
        adminModalOpen: true,
      });
      return false;
    }

    // PART 5: Missing or unverified Best Part behavior
    // If not verified, do not jump to a random timestamp without confirmation
    if (!meta.verified) {
      set({
        notification: `Best Part (${formatTime(meta.startSec)} - ${formatTime(meta.endSec)}) is unverified. Open editor to review.`,
        status: 'unverified',
        adminModalOpen: true,
      });
      return false;
    }

    // PART 2: Actual Button Functionality
    // 3. Immediately seek the existing audio player to the Best Part start timestamp
    player.seek(meta.startSec);

    // 4. Start playback from that position (do not restart song, keep existing player)
    const audio = getAudio();
    if (audio && audio.paused) {
      void audio.play().catch(() => {});
    }

    set({
      notification: `Playing Best Part (${formatTime(meta.startSec)} - ${formatTime(meta.endSec)})`,
    });

    setTimeout(() => {
      if (get().notification?.startsWith('Playing Best Part')) {
        set({ notification: null });
      }
    }, 3500);

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
      verified: false,
      method: detected.method,
      confidence: detected.confidence,
      title: metadata?.title || player.nowPlaying?.title,
      artist: metadata?.artist || player.nowPlaying?.artist,
      updatedAt: Date.now(),
    };

    await saveBestPart(updated);
    set({ metadata: updated, status: 'unverified' });
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
      notification: `Best Part verified (${formatTime(startSec)} - ${formatTime(endSec)})`,
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
