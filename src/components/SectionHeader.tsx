import type { ReactNode } from 'react';

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2 sm:mb-3.5 sm:gap-3">
    <div><h2 className="font-display text-sm font-semibold tracking-tight text-ink sm:text-base">{title}</h2>{description && <p className="mt-0.5 text-[11px] text-muted sm:text-xs">{description}</p>}</div>
    {action}
  </div>;
}
