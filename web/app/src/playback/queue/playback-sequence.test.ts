// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';

function track(videoId: string, title = videoId): Track {
  return {
    videoId,
    title,
    artists: [{ name: 'Artist', id: null }],
    album: null,
    durationSec: 180,
    explicit: false,
    thumbnail: null,
    index: null,
    plays: null,
  };
}

describe('Playback sequence scenarios', () => {
  it('Scenario 1: Autoplay refills radio into queue and what happens when playlist reaches end', async () => {
    const tracks = [track('song-A', 'Song A'), track('song-B', 'Song B')];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: true,
    });

    usePlayer.getState().playTracks(tracks, 0, source);

    // Simulate autoplay adding tracks
    usePlayer.setState((s) => ({
      queue: [
        ...s.queue,
        { entryId: 'auto-1', track: track('auto-1', 'Radio Song 1'), tier: 'autoplay', source: null },
        { entryId: 'auto-2', track: track('auto-2', 'Radio Song 2'), tier: 'autoplay', source: null },
      ]
    }));

    // Next -> plays Song B
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Next -> reaches end of context playlist with autoplay=true:
    // Transitions to radio
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Radio Song 1');
  });

  it('Scenario 2: Repeat ALL when playlist reaches end with autoplay in queue', async () => {
    const tracks = [track('song-A', 'Song A'), track('song-B', 'Song B')];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'all',
      autoplay: true,
    });

    usePlayer.getState().playTracks(tracks, 0, source);

    // Simulate autoplay adding tracks into queue
    usePlayer.setState((s) => ({
      queue: [
        ...s.queue,
        { entryId: 'auto-1', track: track('auto-1', 'Radio Song 1'), tier: 'autoplay', source: null },
      ]
    }));

    // Next -> plays Song B
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Next -> Playlist ended! Repeat is ALL.
    // Expected: Repeat should loop back to Song A!
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');
  });

  it('Scenario 3: Shuffle disabled must preserve original playlist order', async () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
      track('song-D', 'Song D'),
    ];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    // Start with Song B (index 1)
    usePlayer.getState().playTracks(tracks, 1, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Toggle shuffle ON
    usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(true);

    // Toggle shuffle OFF
    usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(false);

    // Expected: The upcoming queue should be Song C, then Song D
    // (preserving original playlist order)
    const upcoming = usePlayer.getState().queue.slice(usePlayer.getState().index + 1);
    expect(upcoming.map(q => q.track.title)).toEqual(['Song C', 'Song D']);
  });

  it('Scenario 4: Starting a playlist when shuffle was ALREADY true', async () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
      track('song-D', 'Song D'),
    ];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: true, // User had shuffle turned on!
      repeat: 'off',
      autoplay: false,
    });

    // User clicks Song B (index 1)
    usePlayer.getState().playTracks(tracks, 1, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Now user disables shuffle
    usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(false);

    // What is the queue order now?
    const queueTitles = usePlayer.getState().queue.map(q => q.track.title);
    expect(queueTitles).toEqual(['Song B', 'Song C', 'Song D', 'Song A']);
  });

  it('Scenario 5: When playlist ends and repeat is OFF and autoplay is OFF, stop playback', async () => {
    const tracks = [track('song-A', 'Song A'), track('song-B', 'Song B')];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 0, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');

    // Next -> plays Song B
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Next -> playlist ends!
    usePlayer.getState().next();
    await new Promise(r => setTimeout(r, 20));
    // Must remain on Song B and stop/pause (no random songs!)
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');
  });

  it('Scenario 6: Previous button follows the same queue sequence', async () => {
    const tracks = [track('song-A', 'Song A'), track('song-B', 'Song B'), track('song-C', 'Song C')];
    const source = { title: 'Test Album', type: 'album' as const, id: 'test-album' };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 2, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song C');

    // Previous -> plays Song B
    usePlayer.getState().previous();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');

    // Previous -> plays Song A
    usePlayer.getState().previous();
    await new Promise(r => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');
  });

  it('Scenario 7: Drag-and-drop reorders upcoming songs in playback queue', () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
      track('song-D', 'Song D'),
      track('song-E', 'Song E'),
    ];
    const source = { title: 'Test Album', type: 'album' as const };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 0, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');
    expect(usePlayer.getState().index).toBe(0);

    // Initial queue: Song A (playing at index 0), B (1), C (2), D (3), E (4)
    // Drag Song E from index 4 up to index 1 (immediately after Song A)
    usePlayer.getState().move(4, 1);

    // Expected new order: Song A, Song E, Song B, Song C, Song D
    const titles = usePlayer.getState().queue.map((q) => q.track.title);
    expect(titles).toEqual(['Song A', 'Song E', 'Song B', 'Song C', 'Song D']);
    // Currently playing song at index 0 remains Song A
    expect(usePlayer.getState().index).toBe(0);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');

    // Drag Song B from index 2 down to index 4 (end)
    usePlayer.getState().move(2, 4);
    const titles2 = usePlayer.getState().queue.map((q) => q.track.title);
    expect(titles2).toEqual(['Song A', 'Song E', 'Song C', 'Song D', 'Song B']);
  });

  it('Scenario 8: Play Next moves upcoming song immediately after currently playing song', () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
      track('song-D', 'Song D'),
    ];
    const source = { title: 'Test Album', type: 'album' as const };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 0, source);
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song A');

    // Currently: Song A (0), Song B (1), Song C (2), Song D (3)
    // User selects "Play Next" on Song D (which is already in the queue at index 3)
    usePlayer.getState().playNext([tracks[3]!]);

    // Expected: Song D MOVES immediately after Song A (at index 1), with no duplicates
    const titles = usePlayer.getState().queue.map((q) => q.track.title);
    expect(titles).toEqual(['Song A', 'Song D', 'Song B', 'Song C']);
    expect(usePlayer.getState().queue).toHaveLength(4);

    // Test movePlayNext directly: Move Song C (currently at index 3) to play next
    usePlayer.getState().movePlayNext(3);
    const titles2 = usePlayer.getState().queue.map((q) => q.track.title);
    expect(titles2).toEqual(['Song A', 'Song C', 'Song D', 'Song B']);
  });

  it('Scenario 9: Play Next inserts new song and preserves new order when song ends', async () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
    ];
    const source = { title: 'Test Album', type: 'album' as const };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 0, source);

    // Add a new track with Play Next
    const newTrack = track('song-X', 'Song X');
    usePlayer.getState().playNext([newTrack]);

    // Queue is now: Song A (playing), Song X, Song B, Song C
    const titles = usePlayer.getState().queue.map((q) => q.track.title);
    expect(titles).toEqual(['Song A', 'Song X', 'Song B', 'Song C']);

    // Advance to next song (simulating song ending)
    usePlayer.getState().next();
    await new Promise((r) => setTimeout(r, 20));

    // Next song playing must be Song X!
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song X');

    // Advance again -> plays Song B
    usePlayer.getState().next();
    await new Promise((r) => setTimeout(r, 20));
    expect(usePlayer.getState().nowPlaying?.title).toBe('Song B');
  });

  it('Scenario 10: Multiple Play Next selections work correctly', () => {
    const tracks = [
      track('song-A', 'Song A'),
      track('song-B', 'Song B'),
      track('song-C', 'Song C'),
    ];
    const source = { title: 'Test Album', type: 'album' as const };

    usePlayer.setState({
      queue: [],
      index: -1,
      nowPlaying: null,
      status: 'idle',
      shuffle: false,
      repeat: 'off',
      autoplay: false,
    });

    usePlayer.getState().playTracks(tracks, 0, source);

    // 1st Play Next: Song 1
    usePlayer.getState().playNext([track('song-1', 'Song 1')]);
    expect(usePlayer.getState().queue.map((q) => q.track.title)).toEqual(['Song A', 'Song 1', 'Song B', 'Song C']);

    // 2nd Play Next: Song 2
    usePlayer.getState().playNext([track('song-2', 'Song 2')]);
    expect(usePlayer.getState().queue.map((q) => q.track.title)).toEqual(['Song A', 'Song 2', 'Song 1', 'Song B', 'Song C']);

    // Multiple tracks array Play Next: [Song 3, Song 4]
    usePlayer.getState().playNext([track('song-3', 'Song 3'), track('song-4', 'Song 4')]);
    expect(usePlayer.getState().queue.map((q) => q.track.title)).toEqual([
      'Song A',
      'Song 3',
      'Song 4',
      'Song 2',
      'Song 1',
      'Song B',
      'Song C',
    ]);
  });
});
