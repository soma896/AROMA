export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture: string;
  createdAt: number;
  lastLogin: number;
}

export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryItem {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationSec?: number;
  playedAt: number;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: number;
}
