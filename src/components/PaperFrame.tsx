import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { brand, retroColors, type FrameColor } from '../lib/colors';
import { frameGeometry, type FrameShape, type PaperProfile } from '../lib/frameGeometry';

export type PaperFrameProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  contentClassName?: string;
  palette?: FrameColor;
  color?: string;
  dotColor?: string;
  paperColor?: string;
  shape?: FrameShape;
  profile?: PaperProfile;
  radius?: number;
  surface?: 'vivid' | 'theme';
  /** Corner cut in pixels, bounded to 0–24. */
  cut?: number;
  /** Edge displacement in pixels, bounded to 0–12; never rotates content. */
  irregularity?: number;
  /** Paper border thickness in pixels, bounded to 1–10. */
  borderWidth?: number;
  texture?: 'dots' | 'grid' | 'none';
  /** Texture spacing in pixels, bounded to 12–40. */
  patternSize?: number;
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const paddingClasses = { none: '', sm: 'p-5 sm:p-6', md: 'p-6 sm:p-8', lg: 'px-7 py-10 sm:px-12 sm:py-12' };

/** Decorative paper layers resize with the content; controls remain outside the clipping. */
export function PaperFrame({
  children,
  className = '',
  palette = 'teal',
  color,
  dotColor,
  paperColor,
  shape = 'rounded', profile = 'classic', radius = 18, surface = 'vivid', cut = 16, irregularity = 6, borderWidth = shape === 'rounded' ? 3 : 5,
  texture = 'dots', patternSize = 22, padding = 'lg',
  contentClassName = '',
  style,
  ...props
}: PaperFrameProps) {
  const geometry = frameGeometry({ shape, profile, radius, cut, irregularity, borderWidth, patternSize });
  const fill = color ?? (surface === 'theme' ? 'var(--retro-game-card)' : retroColors[palette]);
  const frameStyle = {
    '--frame-color': fill,
    '--frame-ink': surface === 'theme' ? 'var(--retro-ink)' : brand.tinta,
    '--frame-paper': paperColor ?? (shape === 'rounded' ? `color-mix(in srgb, ${fill} 75%, ${brand.papel})` : brand.papel),
    '--frame-fill': fill,
    '--frame-dots': dotColor ?? brand.papel,
    '--frame-shape': geometry.clipPath,
    '--frame-inner-shape': geometry.innerClipPath,
    '--frame-border': `${geometry.borderWidth}px`,
    '--frame-pattern-size': `${geometry.patternSize}px`,
    // A colored paper panel is a light surface even inside the dark shell.
    // Scope semantic tokens so labels, forms and nested controls keep contrast.
    ...(surface === 'vivid' ? {
      '--retro-ink': brand.tinta,
      '--retro-muted': brand.tinta,
      '--retro-canvas': brand.papel,
      '--retro-surface': brand.papel,
      '--retro-hover': `color-mix(in srgb, ${brand.papel} 90%, ${brand.tinta})`,
      '--retro-line': `color-mix(in srgb, ${brand.papel} 35%, ${brand.tinta})`,
      '--retro-accent': brand.tinta,
      '--retro-on-accent': brand.papel,
      '--retro-danger': `color-mix(in srgb, ${brand.coral} 45%, ${brand.tinta})`,
      colorScheme: 'light',
    } : {}),
    ...style,
  } as CSSProperties;

  return <div {...props} data-paper-frame={shape} data-frame-surface={surface} data-frame-texture={texture} style={frameStyle} className={`relative isolate min-w-0 text-[color:var(--frame-ink)] ${className}`}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 drop-shadow-[0_4px_0_rgb(0_0_0/0.12)]">
      <div className="absolute inset-0 bg-[var(--frame-paper)] [clip-path:var(--frame-shape)]" />
      <div className="absolute inset-[var(--frame-border)] overflow-hidden bg-[var(--frame-fill)] [clip-path:var(--frame-inner-shape)]">
        {texture !== 'none' && <div className={`absolute inset-0 opacity-25 [background-size:var(--frame-pattern-size)_var(--frame-pattern-size)] ${texture === 'dots' ? '[background-image:radial-gradient(circle,var(--frame-dots)_1.2px,transparent_1.8px)]' : '[background-image:linear-gradient(var(--frame-dots)_1px,transparent_1px),linear-gradient(90deg,var(--frame-dots)_1px,transparent_1px)]'}`} />}
      </div>
    </div>
    <div className={`relative ${paddingClasses[padding]} ${contentClassName}`}>{children}</div>
  </div>;
}
