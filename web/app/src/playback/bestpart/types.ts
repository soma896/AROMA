export type BestPartDetectionMethod =
  | 'ai'
  | 'heatmap'
  | 'lyrics'
  | 'energy'
  | 'manual'
  | 'heuristic'
  | 'fallback';

export interface BestPartMetadata {
  songId: string;
  startSec: number;
  endSec: number;
  verified: boolean;
  method: BestPartDetectionMethod;
  confidence?: number;
  title?: string;
  artist?: string;
  updatedAt?: number;
}

export interface BestPartDetectionResult {
  startSec: number;
  endSec: number;
  method: BestPartDetectionMethod;
  confidence: number;
  details?: {
    chorusDetected?: boolean;
    heatmapPeak?: boolean;
    lyricSnippet?: string;
    detectedLanguage?: string;
  };
}
