import markSvg from '@/assets/logo-mark.svg?raw';

// Aroma official logo mark:
// Circular halo gradient + modern 'A' letterform with negative-space 8th musical note.
const markup = markSvg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-flex', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
