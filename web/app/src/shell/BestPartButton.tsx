import { Music } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLyrics } from '@/lyrics/useLyrics';
import { useBestPart } from '@/playback/bestpart/useBestPart';
import { getAudio, usePlayer } from '@/state/player';
import { BestPartAdminModal } from './BestPartAdminModal';

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
          EXACT BUTTON DESIGN AS SPECIFIED IN REFERENCE SCREENSHOT & VIDEO:
          - Rounded pill-shaped button.
          - Translucent lavender/purple background.
          - Thin white border.
          - White music note icon.
          - Bold white text: "Best Part".
          - Centered below album artwork.
          - Clicking forwards the song to Best Part, shows nothing, and disappears.
        */}
        <button
          type="button"
          onClick={() => void jumpToBestPart()}
          onContextMenu={(e) => {
            e.preventDefault();
            setAdminModalOpen(true);
          }}
          className="flex h-8 items-center gap-1.5 rounded-full border border-white/40 bg-[#8b5cf6]/25 px-4 py-1.5 shadow-[0_2px_14px_rgba(139,92,246,0.28)] backdrop-blur-md transition-all duration-150 hover:border-white/60 hover:bg-[#8b5cf6]/35 active:scale-95 cursor-pointer"
          aria-label="Best Part"
        >
          {/* White music note icon */}
          <Music size={14} className="text-white fill-white/20 stroke-[2.4]" aria-hidden="true" />

          {/* Bold white text: "Best Part" */}
          <span className="text-[13px] font-bold tracking-wide text-white">
            Best Part
          </span>
        </button>
      </div>

      <BestPartAdminModal />
    </>
  );
}
