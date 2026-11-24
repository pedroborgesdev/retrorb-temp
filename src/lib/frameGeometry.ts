export type FrameShape = 'paper' | 'rounded' | 'cut' | 'ticket';
export const paperProfiles = ['classic', 'steps', 'slant', 'torn'] as const;
export type PaperProfile = typeof paperProfiles[number];
type GeometryOptions = { shape: FrameShape; cut: number; irregularity: number; borderWidth: number; patternSize: number; profile?: PaperProfile; radius?: number };

const clamp = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Fixed pixel offsets keep a rectangular silhouette on both wide and tall panels. */
export function frameGeometry(options: GeometryOptions) {
  const cut = clamp(options.cut, 0, 24, 16);
  const edge = clamp(options.irregularity, 0, 12, 6);
  const end = (n: number) => `calc(100% - ${n}px)`;
  const borderWidth = clamp(options.borderWidth, 1, 10, 5);
  const radius = clamp(options.radius ?? 18, 0, 40, 18);
  // Each profile changes the placement and number of vertices, not only their depth.
  const paper: Record<PaperProfile, string> = {
    classic: `0 ${edge}px, 29% ${edge}px, 35% ${edge * 2}px, 67% ${edge}px, ${end(cut)} 0, 100% ${cut}px, ${end(edge)} 60%, 100% ${end(edge)}, 72% 100%, 43% ${end(edge)}, 28% 100%, ${cut}px ${end(edge)}, 0 ${end(cut)}, ${edge}px 51%`,
    steps: `${cut}px 0, 57% 0, 57% ${edge * 2}px, ${end(edge)} ${edge}px, 100% 36%, ${end(edge)} 70%, 100% ${end(cut)}, 78% 100%, 78% ${end(edge * 2)}, 21% 100%, 0 ${end(edge)}, ${edge}px 62%, 0 ${cut}px`,
    slant: `0 ${cut}px, 74% 0, 100% ${edge * 2}px, ${end(edge)} 44%, 100% ${end(cut)}, 31% 100%, 0 ${end(edge * 2)}, ${edge}px 27%`,
    torn: `${edge}px 0, 22% ${edge * 2}px, 47% 0, 66% ${edge}px, 83% 0, 100% ${cut}px, ${end(edge * 2)} 30%, 100% 67%, ${end(edge)} 100%, 70% ${end(edge * 2)}, 49% 100%, 27% ${end(edge)}, ${cut}px 100%, 0 75%, ${edge * 2}px 48%, 0 19%`,
  };
  const shapes: Record<Exclude<FrameShape, 'rounded'>, string> = {
    cut: `${cut}px 0, ${end(edge)} 0, 100% ${cut}px, 100% ${end(cut)}, ${end(cut)} 100%, ${edge}px 100%, 0 ${end(cut)}, 0 ${cut}px`,
    ticket: `${cut}px 0, ${end(cut)} 0, 100% ${cut}px, 100% calc(50% - ${edge}px), ${end(edge)} 50%, 100% calc(50% + ${edge}px), 100% ${end(cut)}, ${end(cut)} 100%, ${cut}px 100%, 0 ${end(cut)}, 0 calc(50% + ${edge}px), ${edge}px 50%, 0 calc(50% - ${edge}px), 0 ${cut}px`,
    paper: paper[options.profile ?? 'classic'],
  };
  const clipPath = options.shape === 'rounded' ? `inset(0 round ${radius}px)` : `polygon(${shapes[options.shape]})`;
  return {
    clipPath,
    innerClipPath: options.shape === 'rounded' ? `inset(0 round ${Math.max(0, radius - borderWidth)}px)` : clipPath,
    borderWidth,
    patternSize: clamp(options.patternSize, 12, 40, 22),
  };
}
