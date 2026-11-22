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
});
