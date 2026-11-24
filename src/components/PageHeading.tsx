import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { FrameColor } from '../lib/colors';
import type { PaperProfile } from '../lib/frameGeometry';

export function PageHeading({ title, description, children }: {
  eyebrow: string; title: string; description: string; icon: LucideIcon; palette?: FrameColor; profile?: PaperProfile; children?: ReactNode;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="min-w-0 flex-1 basis-64"><h1 className="break-words text-[28px] font-semibold leading-tight tracking-tight">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div>
      {children}
    </div>;
}
