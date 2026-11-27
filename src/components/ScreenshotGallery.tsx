import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { Artwork, button, Modal } from './ui';
import { safeUrl } from '../lib/format';

export function ScreenshotGallery({ images }: { images: string[] | null }) {
  const available = (images || []).filter((image) => safeUrl(image));
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (active === null) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); setActive((value) => ((value ?? 0) - 1 + available.length) % available.length); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setActive((value) => ((value ?? 0) + 1) % available.length); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [active, available.length]);
  if (!available.length) return null;

  const gridClass =
    available.length === 1
      ? 'grid grid-cols-1 max-w-xl'
      : available.length === 2
        ? '-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0'
        : '-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3';

  return (
    <section className="retro-rise rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold tracking-tight text-ink sm:text-base">Capturas de tela</h2>
        <span className="rounded-full border border-line bg-inset/80 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted">
          {available.length} {available.length === 1 ? 'imagem' : 'imagens'}
        </span>
      </div>
      <div className={gridClass}>
        {available.map((url, i) => (
          <button
            key={`${url}:${i}`}
            aria-label={`Ampliar imagem ${i + 1}`}
            onClick={() => setActive(i)}
            style={{ '--stagger': i } as CSSProperties}
            className={`retro-rise group relative overflow-hidden rounded-xl border border-line bg-inset/60 p-1 transition-all duration-200 ease-out active:scale-[0.98] hover:-translate-y-0.5 hover:border-brand-orange/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              available.length === 1 ? 'w-full' : 'w-[78%] shrink-0 snap-start sm:w-auto'
            }`}
          >
            <Artwork src={url} title={`Screenshot ${i + 1}`} className="aspect-video w-full rounded-lg bg-surface/60 transition-transform duration-200 ease-out group-hover:scale-[1.03]" fit="contain" />
            <Expand size={18} className="absolute right-3 top-3 rounded-lg border border-line bg-surface/95 p-1 text-ink opacity-0 shadow transition-all duration-150 group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        ))}
      </div>
      {active !== null && (
        <Modal title={`Captura ${active + 1} de ${available.length}`} onClose={() => setActive(null)} wide>
          <div data-console-gallery>
            <Artwork src={available[active]} title={`Screenshot ${active + 1}`} className="h-[55dvh] max-h-[65dvh] min-h-40 w-full rounded-xl bg-inset/70" fit="contain" />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button className={button} onClick={() => setActive((active - 1 + available.length) % available.length)} disabled={available.length < 2}>
                <ChevronLeft size={15} />Anterior
              </button>
              <span className="hidden font-mono text-[10px] text-muted sm:inline">← → navegar · Esc fechar</span>
              <button className={button} onClick={() => setActive((active + 1) % available.length)} disabled={available.length < 2}>
                Próxima<ChevronRight size={15} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
