import { party, useParty } from '@/party/listenTogether';
import { GripVertical, Infinity as InfinityIcon, ListStart, MoreHorizontal, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import { Artwork } from '@/components/music/Artwork';
import { formatDuration } from '@/components/music/links';
import { autoplaySectionStart, upcomingUserQueueIndices, type QueueEntry } from '@/playback/queue/timeline';
import { CROSSFADE_CHOICES, usePlayer } from '@/state/player';

// The panel's square buttons: AutoPlay (the key colour when on) and the options menu.
const square = 'grid size-7 place-items-center rounded-[6px] text-secondary hover:bg-quinary aria-pressed:text-key';
const list = 'flex flex-col gap-0.5';

/** A row in Up Next: [grip] 24px [art] 40px [title/artists] 1fr [right] auto; interactive drag-and-drop on mouse & touch. */
function Row({
  entry,
  at,
  isNext,
  dragging,
  dragOver,
  dragDirection,
  onDragStart,
  onDragOver,
  onDropAt,
  onPointerStartDrag,
}: {
  entry: QueueEntry;
  at: number;
  isNext: boolean;
  dragging: boolean;
  dragOver: boolean;
  dragDirection: 'up' | 'down' | null;
  onDragStart: (at: number) => void;
  onDragOver: (at: number) => void;
  onDropAt: (at: number) => void;
  onPointerStartDrag: (e: React.PointerEvent<HTMLElement>, at: number) => void;
}) {
  const { jumpTo, removeAt, movePlayNext } = usePlayer.getState();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const { track } = entry;

  return (
    <li
      data-queue-at={at}
      className={`group/row relative grid h-[55px] grid-cols-[24px_40px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-row px-2 transition-colors duration-150 select-none ${
        dragging
          ? 'opacity-40 scale-[0.98] ring-1 ring-purple-500/50 bg-purple-950/40 shadow-inner'
          : 'hover:bg-quinary'
      } ${
        dragOver && !dragging
          ? dragDirection === 'down'
            ? 'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:bg-gradient-to-r after:from-purple-500 after:via-violet-400 after:to-blue-400 after:shadow-[0_0_8px_rgba(168,85,247,0.8)] after:z-10'
            : 'before:absolute before:inset-x-2 before:-top-0.5 before:h-0.5 before:bg-gradient-to-r before:from-purple-500 before:via-violet-400 before:to-blue-400 before:shadow-[0_0_8px_rgba(168,85,247,0.8)] before:z-10'
          : ''
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(at);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(at);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropAt(at);
      }}
      onDoubleClick={() => jumpTo(at)}
    >
      {/* Touch & Mouse Drag Handle */}
      <div
        className="touch-none flex size-6 cursor-grab items-center justify-center rounded text-secondary/50 hover:text-primary active:cursor-grabbing hover:bg-white/5 transition-colors"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        onPointerDown={(e) => onPointerStartDrag(e, at)}
      >
        <GripVertical size={16} />
      </div>

      {/* Artwork with quick remove button */}
      <div className="relative size-10 shrink-0">
        <Artwork src={track.thumbnail} displayWidth={40} radius="var(--radius-artwork-small)" />
        <button
          className="absolute -top-1.5 -left-1.5 hidden size-[22px] place-items-center rounded-full bg-thick-material text-primary shadow-[0_1px_3px_#0004] [backdrop-filter:blur(10px)] group-hover/row:grid"
          aria-label={`Remove ${track.title}`}
          onClick={() => removeAt(at)}
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>

      {/* Title & Artist & Next badge */}
      <button className="flex min-w-0 flex-col text-start" onClick={() => jumpTo(at)} aria-label={`Play ${track.title}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate type-body text-primary font-medium">{track.title}</span>
          {isNext && (
            <span className="shrink-0 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-purple-300 uppercase">
              Up Next
            </span>
          )}
        </div>
        <span className="truncate type-callout text-secondary">{track.artists.map((a) => a.name).join(', ')}</span>
      </button>

      {/* Duration and ⋯ Options Menu */}
      <div className="relative flex items-center justify-end gap-1 pe-1">
        <span className="type-body tabular-nums text-secondary text-xs group-hover/row:invisible group-has-[[data-open]]/row:invisible">
          {formatDuration(track.durationSec)}
        </span>
        <button
          className="absolute inset-y-0 right-0 my-auto hidden size-7 place-items-center rounded-full text-key group-hover/row:grid data-open:grid hover:bg-white/10"
          aria-label={`More options for ${track.title}`}
          aria-haspopup="menu"
          data-open={anchor !== null || undefined}
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {anchor && (
        <Menu anchor={anchor} onClose={close} label={track.title}>
          <MenuItem onSelect={() => (close(), jumpTo(at))}>Play Now</MenuItem>
          <MenuItem
            icon={<ListStart size={15} />}
            onSelect={() => {
              close();
              movePlayNext(at);
            }}
          >
            Play Next
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onSelect={() => (close(), removeAt(at))}>
            Remove from Up Next
          </MenuItem>
        </Menu>
      )}
    </li>
  );
}

/** Professional drag-and-drop playback queue (mouse & touch on Windows and Android). */
export function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const localAutoplay = usePlayer((s) => s.autoplay);
  const inParty = useParty((s) => !!s.code);
  const partyAutoplay = useParty((s) => s.playback.autoplayEnabled);
  const autoplay = inParty ? partyAutoplay : localAutoplay;
  const repeat = usePlayer((s) => s.repeat);
  const crossfadeSec = usePlayer((s) => s.crossfadeSec);
  const automix = usePlayer((s) => s.automix);
  const { clearUpNext, setAutoplay, setCrossfade, setAutomix, move } = usePlayer.getState();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<{ pointerId: number; element: HTMLElement } | null>(null);
  const close = useCallback(() => setAnchor(null), []);

  const tiers = queue.map((e) => e.tier);
  const autoplayAt = autoplaySectionStart(tiers, index);
  const canClear = upcomingUserQueueIndices(tiers, index).length > 0;
  const upcoming = queue.map((entry, at) => ({ entry, at })).filter(({ at }) => at > index);
  const beforeAutoplay = upcoming.filter(({ at }) => at < autoplayAt);
  const afterAutoplay = upcoming.filter(({ at }) => at >= autoplayAt);
  const currentEntry = index >= 0 && index < queue.length ? queue[index] : null;
  const playingFrom = currentEntry?.source?.title;

  const dragDirection: 'up' | 'down' | null =
    dragFrom !== null && dragOver !== null && dragFrom !== dragOver
      ? dragFrom < dragOver
        ? 'down'
        : 'up'
      : null;

  // Pointer event handlers for touch screens (Android) and mouse (Windows)
  const handlePointerStartDrag = useCallback((e: React.PointerEvent<HTMLElement>, at: number) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if capture unsupported
    }
    activePointerRef.current = { pointerId: e.pointerId, element: target };

    setDragFrom(at);
    setDragOver(at);

    if (typeof window !== 'undefined' && 'navigator' in window && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(12);
      } catch {
        // Ignored
      }
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragFrom === null) return;
    e.preventDefault();

    // Auto-scroll when near top or bottom boundary of queue container
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const edgeThreshold = 60;
      if (e.clientY < rect.top + edgeThreshold) {
        const intensity = Math.max(2, Math.min(18, (rect.top + edgeThreshold - e.clientY) / 3));
        container.scrollTop -= intensity;
      } else if (e.clientY > rect.bottom - edgeThreshold) {
        const intensity = Math.max(2, Math.min(18, (e.clientY - (rect.bottom - edgeThreshold)) / 3));
        container.scrollTop += intensity;
      }
    }

    // Locate target row under touch/cursor
    const elem = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = elem?.closest<HTMLElement>('[data-queue-at]');
    if (rowEl && rowEl.dataset.queueAt) {
      const targetAt = Number(rowEl.dataset.queueAt);
      if (!isNaN(targetAt) && targetAt !== dragOver) {
        setDragOver(targetAt);
      }
    }
  }, [dragFrom, dragOver]);

  const handlePointerEnd = useCallback(() => {
    if (activePointerRef.current) {
      try {
        activePointerRef.current.element.releasePointerCapture(activePointerRef.current.pointerId);
      } catch {
        // Ignored
      }
      activePointerRef.current = null;
    }

    if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
      move(dragFrom, dragOver);
    }

    setDragFrom(null);
    setDragOver(null);
  }, [dragFrom, dragOver, move]);

  const rows = (items: typeof upcoming) =>
    items.map(({ entry, at }) => (
      <Row
        key={entry.entryId}
        entry={entry}
        at={at}
        isNext={at === index + 1}
        dragging={dragFrom === at}
        dragOver={dragOver === at}
        dragDirection={dragDirection}
        onDragStart={(startAt) => {
          setDragFrom(startAt);
          setDragOver(startAt);
        }}
        onDragOver={(overAt) => setDragOver(overAt)}
        onDropAt={(to) => {
          if (dragFrom !== null && dragFrom !== to) move(dragFrom, to);
          setDragFrom(null);
          setDragOver(null);
        }}
        onPointerStartDrag={handlePointerStartDrag}
      />
    ));

  return (
    <>
      <div className="flex items-center gap-1.5 px-5 pt-[23px] pb-3">
        <h3 className="flex-1 type-title-2-emphasized">Playback Queue</h3>
        {canClear && (
          <button className="mr-1 type-title-3 text-key hover:underline" onClick={clearUpNext}>
            Clear
          </button>
        )}
        <button
          className={square}
          aria-label="AutoPlay"
          title="AutoPlay: keep playing similar music when the queue ends"
          aria-pressed={autoplay}
          onClick={() => (inParty ? party.setAutoplay(!autoplay) : setAutoplay(!autoplay))}
        >
          <InfinityIcon size={16} strokeWidth={2.4} />
        </button>
        <button className={square} aria-label="Playback options" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)}>
          <MoreHorizontal size={16} />
        </button>
        {anchor && (
          <Menu anchor={anchor} onClose={close} label="Playback options">
            <MenuHeader>Crossfade</MenuHeader>
            {CROSSFADE_CHOICES.map((seconds) => (
              <MenuItem key={seconds} checked={!automix && crossfadeSec === seconds} onSelect={() => (close(), setCrossfade(seconds))}>
                {seconds === 0 ? 'Off' : `${seconds} seconds`}
              </MenuItem>
            ))}
            <MenuItem checked={automix} onSelect={() => (close(), setAutomix(true))}>
              Automix
            </MenuItem>
          </Menu>
        )}
      </div>

      {/* Currently Playing Card (Pinned at top, locked from dragging) */}
      {currentEntry && (
        <div className="mx-3 mb-2.5 rounded-xl bg-purple-950/25 border border-purple-500/25 p-2.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-purple-400 uppercase">
              <span className="size-1.5 rounded-full bg-purple-400 animate-pulse" />
              Now Playing
            </span>
            {playingFrom && (
              <span className="truncate text-xs text-secondary max-w-[170px]" title={`Playing from ${playingFrom}`}>
                from {playingFrom}
              </span>
            )}
          </div>
          <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-artwork-sm shadow-sm">
              <Artwork src={currentEntry.track.thumbnail} displayWidth={40} radius="var(--radius-artwork-small)" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate type-body font-medium text-primary">
                {currentEntry.track.title}
              </span>
              <span className="truncate type-callout text-secondary">
                {currentEntry.track.artists.map((a) => a.name).join(', ')}
              </span>
            </div>
            <span className="type-body tabular-nums text-secondary text-xs pe-1">
              {formatDuration(currentEntry.track.durationSec)}
            </span>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-20 text-center type-callout text-secondary">
          <p className="type-callout-emphasized">Nothing in Up Next</p>
          <p>
            {autoplay && repeat === 'off' && index >= 0
              ? 'AutoPlay is finding similar music.'
              : 'Songs you play next appear here.'}
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-[120px] [scrollbar-width:thin] touch-pan-y"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="px-2 pt-1 pb-1.5">
            <span className="text-xs font-semibold tracking-wider text-secondary uppercase">
              Up Next ({upcoming.length})
            </span>
          </div>

          <ol className={list}>{rows(beforeAutoplay)}</ol>

          {afterAutoplay.length > 0 && (
            <>
              <h4 className="mx-2.5 mt-[18px] mb-0.5 flex items-center gap-1.5 type-callout-emphasized text-secondary">
                <InfinityIcon size={14} strokeWidth={2.4} /> AutoPlay
              </h4>
              <p className="mx-2.5 mb-2 type-callout text-secondary">Similar music, from YouTube Music’s radio.</p>
              <ol className={list}>{rows(afterAutoplay)}</ol>
            </>
          )}
        </div>
      )}
    </>
  );
}
