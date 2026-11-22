import { useEffect, useRef, useState } from 'react';
import { useLyrics } from '@/lyrics/useLyrics';
import { useBestPart } from '@/playback/bestpart/useBestPart';
import { getAudio, usePlayer } from '@/state/player';
import { BestPartAdminModal } from './BestPartAdminModal';

/**
 * Exact BitChord / Aroma beamed musical note vector icon.
 * Matches BitChordIcons.MusicNote (SF Music Note) from the reference image.
 */
function BestPartMusicIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      {/* Note heads */}
      <ellipse cx="7.1" cy="17.7" rx="2.9" ry="2.5" />
      <ellipse cx="17.1" cy="15.9" rx="2.9" ry="2.5" />
      {/* Stems and top beam */}
      <path
        d="M10 17.7V6.7L20 4.9v11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BestPartButton() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const metadata = useBestPart((s) => s.metadata);
  const heardTracks = useBestPart((s) => s.heardTracks);
  const setHeard = useBestPart((s) => s.setHeard);
  const jumpToBestPart = useBestPart((s) => s.jumpToBestPart);
  const loadForSong = useBestPart((s) => s.loadForSong);
  const setAdminModalOpen = useBestPart((s) => s.setAdminModalOpen);
  const lyricsQuery = useLyrics();

  const [currentTime, setCurrentTime] = useState<number>(0);
  const lastLoadedId = useRef<string | null>(null);

  const videoId = nowPlaying?.videoId ?? null;
  const isHeard = videoId ? !!heardTracks[videoId] : false;
  const startSec = metadata?.songId === videoId ? metadata.startSec : 0;

  // Track playback time from audio element
  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;

    const onTimeUpdate = () => {
      const pos = audio.currentTime;
      setCurrentTime(pos);

      // If the song naturally plays into the Best Part, mark it heard so button disappears
      if (videoId && startSec > 0) {
        if (pos >= startSec - 0.4 && !isHeard) {
          setHeard(videoId, true);
        } else if (pos < startSec - 3.0 && isHeard) {
          // If the user seeks backwards to before the best part, reset heard so button reappears
          setHeard(videoId, false);
        }
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoId, startSec, isHeard, setHeard]);

  // Load Best Part metadata on song change
  useEffect(() => {
    if (videoId && videoId !== lastLoadedId.current) {
      lastLoadedId.current = videoId;
      void loadForSong(
        videoId,
        nowPlaying?.durationSec ?? 0,
        lyricsQuery.data?.lines ?? [],
      );
    }
  }, [videoId, nowPlaying?.durationSec, lyricsQuery.data?.lines, loadForSong]);

  if (!nowPlaying) return null;

  // The button ONLY appears when before the Best Part and not yet heard
  const isAhead = startSec > 0 && currentTime < startSec - 0.4;
  const isVisible = isAhead && !isHeard;

  return (
    <>
      <div
        className={`flex justify-center transition-all duration-300 ease-out ${
          isVisible
            ? 'opacity-100 scale-100 pointer-events-auto h-8 my-3'
            : 'opacity-0 scale-90 pointer-events-none h-0 my-0 overflow-hidden'
        }`}
      >
        {/*
          EXACT BUTTON DESIGN AS PROVIDED IN USER'S CLOSE-UP IMAGE:
          - Rounded pill-shaped button.
          - Translucent frosted glass background: bg-white/[0.18] (subtly transparent).
          - Hairline translucent white rim: border border-white/30.
          - Exact SF / BitChordIcons.MusicNote beamed eighth notes (15px).
          - Bold white text: "Best Part" (W700, 13px).
          - Sizing & padding: pl-3 pr-3.5 py-[7px] gap-[6px] h-[32px].
          - Centered below album artwork.
          - Seamless seeking on click with 0 popups/toasts, disappearing once reached.
        */}
        <button
          type="button"
          onClick={() => void jumpToBestPart()}
          onContextMenu={(e) => {
            e.preventDefault();
            setAdminModalOpen(true);
          }}
          className="flex h-[32px] items-center pl-3 pr-3.5 py-[7px] gap-[6px] rounded-full border border-white/30 bg-white/[0.18] shadow-[0_2px_8px_rgba(0,0,0,0.15)] backdrop-blur-xl transition-all duration-200 hover:border-white/45 hover:bg-white/[0.24] active:scale-95 cursor-pointer select-none"
          aria-label="Best Part"
        >
          {/* Beamed music note icon (15px) */}
          <BestPartMusicIcon className="size-[15px] text-white flex-none" />

          {/* Bold white text: "Best Part" */}
          <span className="text-[13px] font-bold text-white tracking-normal leading-none select-none">
            Best Part
          </span>
        </button>
      </div>

      <BestPartAdminModal />
    </>
  );
}
export { BestPartMusicIcon };
