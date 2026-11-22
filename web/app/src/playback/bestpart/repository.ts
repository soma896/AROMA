import { config } from '@/config';
import type { BestPartDetectionMethod, BestPartMetadata } from './types';

const STORAGE_KEY = 'aroma_best_parts_v1';
const memoryCache = new Map<string, BestPartMetadata>();

function loadLocalStore(): Record<string, BestPartMetadata> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BestPartMetadata>) : {};
  } catch {
    return {};
  }
}

function saveLocalStore(data: Record<string, BestPartMetadata>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // LocalStorage quota may be exceeded
  }
}

// Pre-fill memory cache from local store
if (typeof window !== 'undefined') {
  const local = loadLocalStore();
  for (const [id, meta] of Object.entries(local)) {
    memoryCache.set(id, meta);
  }
}

/**
 * Retrieves the Best Part metadata for a given songId (videoId).
 * Checks memory cache -> localStorage -> Go backend server.
 */
export async function getBestPart(songId: string): Promise<BestPartMetadata | null> {
  if (!songId) return null;

  // 1. Check memory cache
  const cached = memoryCache.get(songId);
  if (cached) return cached;

  // 2. Check localStorage
  const local = loadLocalStore();
  if (local[songId]) {
    memoryCache.set(songId, local[songId]!);
    return local[songId]!;
  }

  // 3. Query Go backend server
  try {
    const serverUrl = config.partyServerUrl || '';
    if (serverUrl) {
      const resp = await fetch(`${serverUrl}/api/best-part/${encodeURIComponent(songId)}`, {
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as BestPartMetadata;
        if (data && data.songId) {
          memoryCache.set(songId, data);
          local[songId] = data;
          saveLocalStore(local);
          return data;
        }
      }
    }
  } catch {
    // Network failure or offline
  }

  return null;
}

/**
 * Persists Best Part metadata both locally and to the backend server.
 */
export async function saveBestPart(meta: BestPartMetadata): Promise<BestPartMetadata> {
  const updated: BestPartMetadata = {
    ...meta,
    updatedAt: meta.updatedAt || Date.now(),
  };

  // 1. Update memory
  memoryCache.set(meta.songId, updated);

  // 2. Update localStorage
  const local = loadLocalStore();
  local[meta.songId] = updated;
  saveLocalStore(local);

  // 3. Sync to Go backend asynchronously
  try {
    const serverUrl = config.partyServerUrl || '';
    if (serverUrl) {
      void fetch(`${serverUrl}/api/best-part/${encodeURIComponent(meta.songId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    }
  } catch {
    // Network failure ignored
  }

  return updated;
}

/**
 * Marks and saves verified Best Part timestamps for a song.
 */
export async function verifyBestPart(
  songId: string,
  startSec: number,
  endSec: number,
  method: BestPartDetectionMethod = 'manual',
  extra?: { title?: string; artist?: string; confidence?: number },
): Promise<BestPartMetadata> {
  return saveBestPart({
    songId,
    startSec: Math.max(0, startSec),
    endSec: Math.max(startSec + 5, endSec),
    verified: true,
    method,
    confidence: extra?.confidence ?? 1.0,
    title: extra?.title,
    artist: extra?.artist,
    updatedAt: Date.now(),
  });
}

/** Returns all cached Best Part entries. */
export function getAllBestParts(): BestPartMetadata[] {
  return Array.from(memoryCache.values());
}
