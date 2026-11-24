import { useState } from 'react';
import { ArrowUpRight, Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ConsoleEntry } from '../types/contracts';

export function ConsoleCard({ console: entry, shelf = false }: { console: ConsoleEntry; shelf?: boolean }) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = entry.image?.trim();
  const route = `/explore?${new URLSearchParams({ console: entry.name })}`;
  return <Link to={route} aria-label={entry.name} className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink transition-[border-color,transform] duration-150 hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:focus-visible:scale-[1.02] ${shelf ? 'h-[160px] w-40 shrink-0 snap-start sm:h-[175px] sm:w-44 min-[1600px]:w-[calc((100%-60px)/6)]' : 'h-[210px]'}`}>
    <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-5 sm:p-6">
      {image && failedImage !== image
        ? <img src={image} alt={entry.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="max-h-full max-w-full object-contain" />
        : <span role="img" aria-label={`${entry.name} — imagem indisponível`}><Gamepad2 aria-hidden size={54} strokeWidth={1.1} className="text-muted/55" /></span>}
    </div>
    <div className="flex min-h-12 items-center justify-between gap-2 border-t border-line px-3.5 py-3">
      <h2 className="line-clamp-2 min-w-0 text-xs font-medium leading-4">{entry.name}</h2>
      <ArrowUpRight aria-hidden size={14} className="shrink-0 text-muted transition-colors group-hover:text-accent" />
    </div>
  </Link>;
}
