import type { ReactNode } from 'react';

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div><h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>{description && <p className="mt-1 text-xs text-muted">{description}</p>}</div>
    {action}
  </div>;
}
