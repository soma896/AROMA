import { config } from '@/config';
import type { AuthResponse, HistoryItem, User, UserPlaylist } from './types';

function getApiBase(): string {
  if (import.meta.env.DEV) {
    return '';
  }
  return config.partyServerUrl || '';
}

function getHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to authenticate with Google');
  }
  return res.json();
}

export async function fetchCurrentUser(token: string): Promise<User> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/me`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    throw new Error('Session invalid or expired');
  }
  const data = await res.json();
  return data.user;
}

export async function logoutUser(token: string | null): Promise<void> {
  if (!token) return;
  const base = getApiBase();
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: getHeaders(token),
  }).catch(() => undefined);
}

export async function fetchUserLikes(token: string): Promise<string[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/likes`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.likes || [];
}

export async function saveUserLike(token: string, videoId: string, liked: boolean): Promise<string[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/likes`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ videoId, liked }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.likes || [];
}

export async function fetchUserHistory(token: string): Promise<HistoryItem[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/history`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function recordUserHistory(token: string, item: HistoryItem): Promise<HistoryItem[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/history`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(item),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function fetchUserPlaylists(token: string): Promise<UserPlaylist[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/playlists`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.playlists || [];
}

export async function saveUserPlaylist(token: string, pl: Partial<UserPlaylist> & { title: string }): Promise<UserPlaylist> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/user/playlists`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(pl),
  });
  if (!res.ok) throw new Error('Failed to save playlist');
  return res.json();
}

export async function deleteUserPlaylist(token: string, playlistId: string): Promise<void> {
  const base = getApiBase();
  await fetch(`${base}/api/user/playlists/${encodeURIComponent(playlistId)}`, {
    method: 'DELETE',
    headers: getHeaders(token),
  });
}
