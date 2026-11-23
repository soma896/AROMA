import { useEffect, useState } from 'react';
import { useBestPart } from '@/playback/bestpart/useBestPart';
import { getAudio } from '@/state/player';
import { BestPartMusicIcon } from './BestPartButton';
import {
  BackwardIcon,
  ForwardIcon,
  LyricsActiveIcon,
  LyricsIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  UpNextIcon,
} from '@/components/icons/Transport';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { Lcd } from './Lcd';
import { fadeForVolume, VolumeControl } from './VolumeControl';

const control = 'grid place-items-center rounded-full transition-all duration-150 disabled:opacity-40';
// Shuffle and repeat: secondary, and the key colour when on, with subtle violet glow.
const toggle = `${control} size-7 text-secondary hover:text-primary aria-pressed:text-key aria-pressed:drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]`;
const transport = `${control} size-8 text-primary hover:bg-white/10 active:scale-95`;
const action = 'grid h-7 w-6 place-items-center rounded-full text-primary hover:bg-white/10 transition-colors aria-pressed:text-key';
// The actions the volume level slides in over: they fade out while it's open.
const fading = `${action} ${fadeForVolume}`;

/** The floating glass player pill (report §1). */
export function PlayerBar() {
  const sidePanel = useUi((s) => s.sidePanel);
  const toggleSidePanel = useUi((s) => s.toggleSidePanel);
  const setFullScreen = useUi((s) => s.setFullScreen);
  const jumpToBestPart = useBestPart((s) => s.jumpToBestPart);
  const metadata = useBestPart((s) => s.metadata);
  const heardTracks = useBestPart((s) => s.heardTracks);
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? null);
  // The queue's entry for what's playing: the track menu needs the full track.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const isHeard = videoId ? !!heardTracks[videoId] : false;
  const startSec = metadata?.songId === videoId ? metadata.startSec : 0;

  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

  const isBestPartVisible = startSec > 0 && currentTime < startSec - 0.4 && !isHeard;

  return (
    <>
      {/* The side panel overlays the page; the pill re-centres in what's left. */}
    <div
      className="pointer-events-none absolute right-0 bottom-(--player-bottom-offset) left-(--web-navigation-width) z-[calc(var(--z-web-chrome)-1)] flex justify-center px-5 transition-[padding-inline-end] duration-(--duration-panel) ease-panel data-[panel-open=true]:pe-[calc(var(--side-panel-width)+20px)] max-sm:hidden"
      data-panel-open={sidePanel !== null}
    >
      <div
        className="glass-pill group/pill pointer-events-auto relative grid h-(--player-pill-height) w-[min(668px,100%)] grid-cols-[184px_minmax(180px,427px)_minmax(57px,auto)] items-center rounded-pill px-4"
        role="region"
        aria-label="Player"
      >
        <div className="flex items-center justify-between pr-2">
          <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
            <ShuffleIcon size={28} />
          </button>
          <div className="flex items-center gap-1.5">
            <button className={transport} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
              <BackwardIcon size={26} />
            </button>
            <button className={transport} disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
            </button>
            <button className={transport} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
              <ForwardIcon size={26} />
            </button>
          </div>
          <button
            className={toggle}
            aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
            aria-pressed={repeat !== 'off'}
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={28} /> : <RepeatIcon size={28} />}
          </button>
        </div>

        <div className="h-full min-w-0 px-4">
          <Lcd />
        </div>

        <div
          className="group/actions relative flex items-center justify-end gap-[9px]"
          data-volume-open={volumeOpen || undefined}
          onPointerLeave={() => setVolumeOpen(false)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setVolumeOpen(false);
          }}
        >
          <FavoriteButton videoId={videoId} className={fading} />
          {track && <TrackMenu track={track} className={fading} placement="above-end" />}
          {isBestPartVisible && (
            <button
              className={`${fading} text-purple-300 hover:text-white`}
              aria-label="Best Part"
              title="Jump to Best Part"
              onClick={() => void jumpToBestPart()}
            >
              <BestPartMusicIcon className="size-4" />
            </button>
          )}
          {/* Always here: the panel itself says whether this track has lyrics, and from where. */}
          <button className={fading} aria-label="Lyrics" aria-pressed={sidePanel === 'lyrics'} onClick={() => toggleSidePanel('lyrics')}>
            {sidePanel === 'lyrics' ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
          </button>
          <button
            className={fading}
            aria-label="Up Next"
            aria-pressed={sidePanel === 'up-next'}
            onClick={() => toggleSidePanel('up-next')}
          >
            <UpNextIcon size={18} />
          </button>
          <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={action} />
        </div>
      </div>
    </div>
    {/* Mobile compact player bar */}
    {hasTrack && (
      <div className="pointer-events-auto fixed inset-x-2.5 bottom-[calc(58px+max(8px,env(safe-area-inset-bottom)))] z-[calc(var(--z-web-chrome)-1)] hidden max-sm:flex flex-col rounded-2xl border border-white/10 bg-[#161426]/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-2xl overflow-hidden">
        <div className="flex items-center justify-between p-2">
          <div
            className="flex flex-1 min-w-0 items-center gap-2.5 cursor-pointer pr-2"
            onClick={() => setFullScreen(true)}
          >
            {nowPlaying?.artworkUrl && (
              <img
                src={nowPlaying.artworkUrl}
                alt=""
                className="size-10 rounded-lg object-cover flex-none shadow-sm"
              />
            )}
            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-semibold text-white">{nowPlaying?.title}</span>
              <span className="truncate text-[11px] text-white/60">
                {nowPlaying?.artist || (playing ? 'Playing' : 'Paused')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            {isBestPartVisible && (
              <button
                type="button"
                className="flex h-7 items-center pl-2.5 pr-3 gap-1.5 rounded-full shadow-sm transition-all hover:brightness-110 active:scale-95 select-none"
                style={{
                  background:
                    'linear-gradient(rgba(255, 255, 255, 0.17), rgba(255, 255, 255, 0.17)) padding-box, linear-gradient(180deg, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.20) 100%) border-box',
                  border: '1px solid transparent',
                  borderRadius: '9999px',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
                onClick={() => void jumpToBestPart()}
                aria-label="Best Part"
              >
                <BestPartMusicIcon className="w-3.5 h-3 text-white flex-none" />
                <span className="text-[11px] font-semibold text-white leading-none select-none">
                  Best Part
                </span>
              </button>
            )}
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-white hover:bg-white/10 active:scale-95"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-95"
              disabled={!hasNext}
              onClick={next}
              aria-label="Next track"
            >
              <ForwardIcon size={18} />
            </button>
          </div>
        </div>
        {/* Subtle mobile progress indicator */}
        <div className="h-[2px] w-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-[width] duration-300"
            style={{
              width: `${Math.min(100, Math.max(0, (currentTime / ((track?.durationSec ?? 0) || 1)) * 100))}%`,
            }}
          />
        </div>
      </div>
    )}
  </>
  );
}
