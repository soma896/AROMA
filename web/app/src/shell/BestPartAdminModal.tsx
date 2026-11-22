import { Check, Clock, Play, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLyrics } from '@/lyrics/useLyrics';
import { formatTime, useBestPart } from '@/playback/bestpart/useBestPart';
import { getAudio, usePlayer } from '@/state/player';

export function BestPartAdminModal() {
  const isOpen = useBestPart((s) => s.adminModalOpen);
  const setOpen = useBestPart((s) => s.setAdminModalOpen);
  const metadata = useBestPart((s) => s.metadata);
  const saveAndVerify = useBestPart((s) => s.saveAndVerify);
  const runAiDetection = useBestPart((s) => s.runAiDetection);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const lyrics = useLyrics();

  const [startSec, setStartSec] = useState<number>(45);
  const [endSec, setEndSec] = useState<number>(75);
  const [isDetecting, setIsDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (metadata) {
      setStartSec(metadata.startSec);
      setEndSec(metadata.endSec);
    } else if (nowPlaying?.durationSec) {
      setStartSec(Math.round(nowPlaying.durationSec * 0.3));
      setEndSec(Math.round(nowPlaying.durationSec * 0.3) + 30);
    }
  }, [metadata, nowPlaying]);

  if (!isOpen) return null;

  const audio = getAudio();
  const currentPos = audio?.currentTime ?? 0;

  const handleSetCurrentAsStart = () => {
    const pos = Math.round(currentPos * 10) / 10;
    setStartSec(pos);
    if (endSec <= pos) setEndSec(pos + 30);
  };

  const handleSetCurrentAsEnd = () => {
    const pos = Math.round(currentPos * 10) / 10;
    if (pos > startSec) setEndSec(pos);
  };

  const handleTestPlay = () => {
    usePlayer.getState().seek(startSec);
    if (audio && audio.paused) {
      void audio.play().catch(() => {});
    }
  };

  const handleRunAi = async () => {
    setIsDetecting(true);
    try {
      const detected = await runAiDetection(lyrics.data?.lines ?? []);
      setStartSec(detected.startSec);
      setEndSec(detected.endSec);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAndVerify(startSec, endSec, 'manual');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Best Part Timestamp Editor"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#161622]/95 p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h3 className="text-lg font-bold">Best Part Editor</h3>
        <p className="mt-1 truncate text-xs text-white/60">
          {nowPlaying?.title} {nowPlaying?.artist ? `— ${nowPlaying.artist}` : ''}
        </p>

        {/* Status / Method Badge */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-purple-300 border border-purple-500/30">
            Method: {metadata?.method ?? 'pending'}
          </span>
          {metadata?.confidence && (
            <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-blue-300 border border-blue-500/30">
              Confidence: {Math.round(metadata.confidence * 100)}%
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 border ${
              metadata?.verified
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
          >
            {metadata?.verified ? 'Verified' : 'Unverified'}
          </span>
        </div>

        {/* Inputs */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">
              Start Time ({formatTime(startSec)})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                max={nowPlaying?.durationSec ?? 600}
                value={startSec}
                onChange={(e) => setStartSec(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm font-mono text-white focus:border-purple-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSetCurrentAsStart}
              className="mt-1.5 text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1"
            >
              <Clock size={11} /> Use current playhead ({formatTime(currentPos)})
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">
              End Time ({formatTime(endSec)})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                max={nowPlaying?.durationSec ?? 600}
                value={endSec}
                onChange={(e) => setEndSec(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm font-mono text-white focus:border-purple-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSetCurrentAsEnd}
              className="mt-1.5 text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1"
            >
              <Clock size={11} /> Use current playhead
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTestPlay}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-semibold hover:bg-white/10 active:scale-95 transition-all"
            >
              <Play size={13} fill="currentColor" /> Test Play Section
            </button>

            <button
              type="button"
              onClick={() => void handleRunAi()}
              disabled={isDetecting}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              <Sparkles size={13} /> {isDetecting ? 'Analyzing...' : 'AI Auto-Detect'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || endSec <= startSec}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-lg hover:from-purple-500 hover:to-indigo-500 active:scale-95 transition-all disabled:opacity-50"
          >
            <Check size={14} strokeWidth={2.5} /> {saving ? 'Saving...' : 'Verify & Save Best Part'}
          </button>
        </div>
      </div>
    </div>
  );
}
