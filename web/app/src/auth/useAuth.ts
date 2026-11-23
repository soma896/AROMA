import { create } from 'zustand';
import {
  deleteUserPlaylist,
  fetchCurrentUser,
  fetchUserHistory,
  fetchUserLikes,
  fetchUserPlaylists,
  loginWithGoogle,
  logoutUser,
  recordUserHistory,
  saveUserLike,
  saveUserPlaylist,
} from './api';
import type { HistoryItem, User, UserPlaylist } from './types';

const TOKEN_KEY = 'aroma:auth:token';
const USER_KEY = 'aroma:auth:user';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInModalOpen: boolean;
  likes: string[];
  history: HistoryItem[];
  playlists: UserPlaylist[];

  openSignInModal: () => void;
  closeSignInModal: () => void;
  init: () => Promise<void>;
  loginWithGoogleToken: (idToken: string) => Promise<User>;
  logout: () => Promise<void>;
  toggleLike: (videoId: string) => Promise<boolean>;
  isLiked: (videoId: string) => boolean;
  addHistory: (item: { videoId: string; title: string; artist: string; artworkUrl?: string; durationSec?: number }) => Promise<void>;
  createPlaylist: (title: string, description?: string) => Promise<UserPlaylist>;
  deletePlaylist: (id: string) => Promise<void>;
}

export const useAuth = create<AuthState>()((set, get) => ({
  user: (() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  isLoading: false,
  signInModalOpen: false,
  likes: [],
  history: [],
  playlists: [],

  openSignInModal: () => set({ signInModalOpen: true }),
  closeSignInModal: () => set({ signInModalOpen: false }),

  init: async () => {
    const token = get().token;
    if (!token) return;
    set({ isLoading: true });
    try {
      const user = await fetchCurrentUser(token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });

      // Fetch user personal data in parallel
      const [likes, history, playlists] = await Promise.all([
        fetchUserLikes(token),
        fetchUserHistory(token),
        fetchUserPlaylists(token),
      ]);
      set({ likes, history, playlists });
    } catch (err) {
      console.warn('Session expired or invalid, signing out:', err);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({ user: null, token: null, isAuthenticated: false, isLoading: false, likes: [], history: [], playlists: [] });
    }
  },

  loginWithGoogleToken: async (idToken: string) => {
    set({ isLoading: true });
    try {
      const resp = await loginWithGoogle(idToken);
      localStorage.setItem(TOKEN_KEY, resp.token);
      localStorage.setItem(USER_KEY, JSON.stringify(resp.user));
      set({
        user: resp.user,
        token: resp.token,
        isAuthenticated: true,
        isLoading: false,
        signInModalOpen: false,
      });

      // Load user isolated data
      const [likes, history, playlists] = await Promise.all([
        fetchUserLikes(resp.token),
        fetchUserHistory(resp.token),
        fetchUserPlaylists(resp.token),
      ]);
      set({ likes, history, playlists });
      return resp.user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    const token = get().token;
    set({ isLoading: true });
    try {
      if (token) {
        await logoutUser(token);
      }
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        likes: [],
        history: [],
        playlists: [],
      });
    }
  },

  toggleLike: async (videoId: string) => {
    const { token, likes } = get();
    const currentlyLiked = likes.includes(videoId);
    const nextLiked = !currentlyLiked;

    // Optimistic update
    const newLikes = nextLiked ? [videoId, ...likes.filter((id) => id !== videoId)] : likes.filter((id) => id !== videoId);
    set({ likes: newLikes });

    if (token) {
      try {
        const synced = await saveUserLike(token, videoId, nextLiked);
        set({ likes: synced });
      } catch (err) {
        console.error('Failed to save like:', err);
        set({ likes }); // Revert on failure
      }
    }
    return nextLiked;
  },

  isLiked: (videoId: string) => {
    return get().likes.includes(videoId);
  },

  addHistory: async (item) => {
    const { token, history } = get();
    const historyItem: HistoryItem = {
      ...item,
      playedAt: Date.now(),
    };
    // Optimistic bump
    const updated = [historyItem, ...history.filter((h) => h.videoId !== item.videoId)].slice(0, 200);
    set({ history: updated });

    if (token) {
      try {
        const synced = await recordUserHistory(token, historyItem);
        set({ history: synced });
      } catch (err) {
        console.warn('Failed to record history on backend:', err);
      }
    }
  },

  createPlaylist: async (title: string, description?: string) => {
    const { token, playlists } = get();
    if (!token) throw new Error('Must be signed in to create playlists');
    const pl = await saveUserPlaylist(token, { title, description, tracks: [] });
    set({ playlists: [...playlists, pl] });
    return pl;
  },

  deletePlaylist: async (id: string) => {
    const { token, playlists } = get();
    if (!token) return;
    set({ playlists: playlists.filter((p) => p.id !== id) });
    await deleteUserPlaylist(token, id);
  },
}));

// Initialize auth automatically when store loads
if (typeof window !== 'undefined') {
  void useAuth.getState().init();
}
