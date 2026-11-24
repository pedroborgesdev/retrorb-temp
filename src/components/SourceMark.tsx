import romsfun from '../assets/providers/romsfun.png';
import romspure from '../assets/providers/romspure.png';
import romsgames from '../assets/providers/romsgames.png';
import wowroms from '../assets/providers/wowroms.png';
import type { Source } from '../types/contracts';

const logos: Record<Source, string> = { romsfun, romspure, romsgames, wowroms };

/** Provider names remain in adjacent text; images are decorative for screen readers. */
export function SourceMark({ source, large = false, sidebar = false }: {
  source: Source;
  large?: boolean;
  sidebar?: boolean;
}) {
  const dimensions = sidebar ? 'h-6 w-6 px-0.5 md:w-20 md:px-1.5' : large ? 'h-12 w-32 px-1.5' : 'h-8 w-24 px-1.5';
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-md bg-brand-surface py-1 ${dimensions}`}>
    <img src={logos[source]} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
  </span>;
}
