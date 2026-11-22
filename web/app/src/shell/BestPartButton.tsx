import { useEffect, useRef, useState } from 'react';
import { useLyrics } from '@/lyrics/useLyrics';
import { useBestPart } from '@/playback/bestpart/useBestPart';
import { getAudio, usePlayer } from '@/state/player';
import { BestPartAdminModal } from './BestPartAdminModal';

/**
 * Exact beamed pair of musical notes (♫).
 * Reconstructed 1:1 from the user's reference screenshot pixel grid.
 */
function BestPartMusicIcon({ className = 'w-[15px] h-[13.5px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 18"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Tilted oval note heads */}
      <ellipse cx="4.8" cy="13.6" rx="3.2" ry="2.4" transform="rotate(-15 4.8 13.6)" />
      <ellipse cx="14.4" cy="11.8" rx="3.2" ry="2.4" transform="rotate(-15 14.4 11.8)" />
      {/* Stems & connecting beam */}
      <path
        d="M7.4 13.6V3.8L17.2 2.1V11.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Solid filled beam bar */}
      <path
        d="M6.8 4.6L17.6 2.8V1.0L6.8 2.8Z"
        fill="currentColor"
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
            ? 'opacity-100 scale-100 pointer-events-auto h-[34px] my-2.5'
            : 'opacity-0 scale-90 pointer-events-none h-0 my-0 overflow-hidden'
        }`}
      >
        {/*
          EXACT BUTTON SHAPE AND STYLE AS PROVIDED IN USER'S REFERENCE IMAGE:
          - Rounded pill / stadium capsule shape (border-radius: 9999px).
          - Translucent frosted glass background: rgba(255, 255, 255, 0.17) with backdrop-filter: blur(16px).
          - Hairline specular rim: linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0.20)).
          - Beamed pair of eighth notes icon (15px x 13.5px) in crisp solid white.
          - "Best Part" label in crisp white, semi-bold (font-semibold, 13px, leading-none).
          - Proportions & padding: h-[34px], pl-3, pr-3.5, gap-[7px].
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
          className="inline-flex h-[34px] items-center pl-3 pr-3.5 gap-[7px] rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-all duration-200 hover:brightness-110 active:scale-95 cursor-pointer select-none"
          style={{
            background:
              'linear-gradient(rgba(255, 255, 255, 0.17), rgba(255, 255, 255, 0.17)) padding-box, linear-gradient(180deg, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.20) 100%) border-box',
            border: '1px solid transparent',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
          aria-label="Best Part"
        >
          {/* Beamed music note icon */}
          <BestPartMusicIcon className="w-[15px] h-[13.5px] text-white flex-none" />

          {/* Clean white text: "Best Part" */}
          <span className="text-[13px] font-semibold tracking-normal text-white leading-none select-none">
            Best Part
          </span>
        </button>
      </div>

      <BestPartAdminModal />
    </>
  );
}
export { BestPartMusicIcon };
