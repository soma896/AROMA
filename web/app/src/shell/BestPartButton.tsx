import { CheckCircle2, Music, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLyrics } from '@/lyrics/useLyrics';
import { useBestPart } from '@/playback/bestpart/useBestPart';
import { usePlayer } from '@/state/player';
import { BestPartAdminModal } from './BestPartAdminModal';

export function BestPartButton() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const metadata = useBestPart((s) => s.metadata);
  const status = useBestPart((s) => s.status);
  const notification = useBestPart((s) => s.notification);
  const jumpToBestPart = useBestPart((s) => s.jumpToBestPart);
  const loadForSong = useBestPart((s) => s.loadForSong);
  const setAdminModalOpen = useBestPart((s) => s.setAdminModalOpen);
  const lyricsQuery = useLyrics();

  const lastLoadedId = useRef<string | null>(null);

  // Automatically load or detect Best Part when a new song plays
  useEffect(() => {
    if (nowPlaying?.videoId && nowPlaying.videoId !== lastLoadedId.current) {
      lastLoadedId.current = nowPlaying.videoId;
      void loadForSong(
        nowPlaying.videoId,
        nowPlaying.durationSec ?? 0,
        lyricsQuery.data?.lines ?? [],
      );
    }
  }, [nowPlaying?.videoId, nowPlaying?.durationSec, lyricsQuery.data?.lines, loadForSong]);

  if (!nowPlaying) return null;

  const isVerified = metadata?.verified === true;

  return (
    <div className="relative inline-flex flex-col items-center">
      {/* 
        EXACT BUTTON DESIGN AS SPECIFIED IN REFERENCE SCREENSHOT:
        - Rounded pill-shaped button.
        - Translucent lavender/purple background.
        - Thin white border.
        - White music note icon.
        - Bold white text: "Best Part".
        - Centered below album artwork.
      */}
      <button
        type="button"
        onClick={() => void jumpToBestPart()}
        onContextMenu={(e) => {
          e.preventDefault();
          setAdminModalOpen(true);
        }}
        title={
          isVerified
            ? `Jump to Best Part (${metadata?.startSec.toFixed(0)}s - ${metadata?.endSec.toFixed(0)}s). Right-click to edit.`
            : 'Best Part pending verification. Click to review or verify.'
        }
        className="group relative flex h-8 items-center gap-1.5 rounded-full border border-white/40 bg-[#8b5cf6]/25 px-4 py-1.5 shadow-[0_2px_14px_rgba(139,92,246,0.28)] backdrop-blur-md transition-all duration-150 hover:border-white/60 hover:bg-[#8b5cf6]/35 active:scale-95 disabled:opacity-50 cursor-pointer"
        aria-label="Best Part"
      >
        {/* White music note icon */}
        <Music size={14} className="text-white fill-white/20 stroke-[2.4]" aria-hidden="true" />

        {/* Bold white text: "Best Part" */}
        <span className="text-[13px] font-bold tracking-wide text-white">
          Best Part
        </span>

        {/* Subtle verification badge if verified */}
        {isVerified ? (
          <CheckCircle2 size={12} className="text-emerald-300 ml-0.5 opacity-80" aria-label="Verified" />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdminModalOpen(true);
            }}
            title="Configure / Verify timestamps (Admin)"
            className="ml-0.5 text-purple-200/70 hover:text-white"
            aria-label="Edit Best Part"
          >
            <Sparkles size={12} />
          </button>
        )}
      </button>

      {/* Floating feedback toast */}
      {notification && (
        <div className="absolute -bottom-8 z-20 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-purple-200 shadow-lg backdrop-blur-md animate-fade-in border border-purple-500/30">
          {notification}
        </div>
      )}

      {/* Admin verification modal */}
      <BestPartAdminModal />
    </div>
  );
}
