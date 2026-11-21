import { LogoMark } from './LogoMark';
import { usePlayer } from '@/state/player';

export interface AromaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'sidebar' | 'mobile';
  showTagline?: boolean;
  className?: string;
  animateBars?: boolean;
}

/**
 * Official AROMA Brand Lockup:
 * - Haloed Musical 'A' Mark
 * - 'Aroma' Wordmark (clean modern geometric typography)
 * - 4 Gradient Equalizer Bars (violet -> purple -> magenta -> pink)
 * - Optional "Your Music. Your World." tagline
 */
export function AromaLogo({
  size = 'md',
  showTagline = false,
  className = '',
  animateBars,
}: AromaLogoProps) {
  const status = usePlayer((s) => s.status);
  const isPlaying = animateBars ?? status === 'playing';

  // Sizing configurations
  const config = {
    sm: {
      markSize: 20,
      textSize: 'text-[16px] leading-[20px]',
      equalizerHeight: 'h-4',
      barWidth: 'w-[2.5px]',
      gap: 'gap-1.5',
      barsGap: 'gap-[2px]',
      taglineSize: 'text-[9px] tracking-[0.14em]',
    },
    mobile: {
      markSize: 22,
      textSize: 'text-[17px] leading-[22px]',
      equalizerHeight: 'h-[18px]',
      barWidth: 'w-[3px]',
      gap: 'gap-2',
      barsGap: 'gap-[2.5px]',
      taglineSize: 'text-[10px] tracking-[0.15em]',
    },
    sidebar: {
      markSize: 26,
      textSize: 'text-[20px] leading-[24px]',
      equalizerHeight: 'h-5',
      barWidth: 'w-[3.5px]',
      gap: 'gap-2.5',
      barsGap: 'gap-[3px]',
      taglineSize: 'text-[10px] tracking-[0.16em]',
    },
    md: {
      markSize: 28,
      textSize: 'text-[22px] leading-[26px]',
      equalizerHeight: 'h-6',
      barWidth: 'w-1',
      gap: 'gap-3',
      barsGap: 'gap-1',
      taglineSize: 'text-[11px] tracking-[0.16em]',
    },
    lg: {
      markSize: 44,
      textSize: 'text-[32px] leading-[36px]',
      equalizerHeight: 'h-8',
      barWidth: 'w-[5px]',
      gap: 'gap-3.5',
      barsGap: 'gap-1.5',
      taglineSize: 'text-[13px] tracking-[0.2em]',
    },
  }[size];

  return (
    <div className={`inline-flex flex-col items-start select-none ${className}`}>
      <div className={`inline-flex items-center ${config.gap}`}>
        {/* Brand Mark with Glowing Halo */}
        <LogoMark size={config.markSize} className="text-white drop-shadow-[0_2px_10px_rgba(168,85,247,0.35)]" />

        {/* Wordmark + Equalizer */}
        <div className="inline-flex items-center gap-1.5 font-bold tracking-[-0.02em]">
          <span className="font-semibold text-white">
            Aroma
          </span>

          {/* 4 Official Equalizer Bars */}
          <div className={`inline-flex items-end ${config.barsGap} ${config.equalizerHeight} pb-0.5`}>
            {/* Bar 1: Violet/Indigo */}
            <span
              className={`${config.barWidth} rounded-full bg-gradient-to-t from-indigo-600 to-indigo-400 ${isPlaying ? 'animate-pulse' : ''}`}
              style={{
                height: '38%',
                animationDuration: '1.1s',
                animationDelay: '0.1s',
              }}
            />
            {/* Bar 2: Purple */}
            <span
              className={`${config.barWidth} rounded-full bg-gradient-to-t from-purple-600 to-purple-400 ${isPlaying ? 'animate-pulse' : ''}`}
              style={{
                height: '68%',
                animationDuration: '0.9s',
                animationDelay: '0.3s',
              }}
            />
            {/* Bar 3: Magenta */}
            <span
              className={`${config.barWidth} rounded-full bg-gradient-to-t from-fuchsia-600 to-pink-500 shadow-[0_0_8px_rgba(217,70,239,0.5)] ${isPlaying ? 'animate-pulse' : ''}`}
              style={{
                height: '100%',
                animationDuration: '1.2s',
                animationDelay: '0s',
              }}
            />
            {/* Bar 4: Pink/Rose */}
            <span
              className={`${config.barWidth} rounded-full bg-gradient-to-t from-pink-600 to-rose-400 ${isPlaying ? 'animate-pulse' : ''}`}
              style={{
                height: '58%',
                animationDuration: '1.0s',
                animationDelay: '0.2s',
              }}
            />
          </div>
        </div>
      </div>

      {showTagline && (
        <span className={`mt-0.5 font-medium uppercase text-white/70 ${config.taglineSize}`}>
          Your Music. Your World.
        </span>
      )}
    </div>
  );
}
