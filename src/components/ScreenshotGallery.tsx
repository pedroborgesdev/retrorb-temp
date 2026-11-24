import { useEffect, useState } from 'react';
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
  return <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">Capturas de tela</h2><span className="text-xs text-muted">{available.length} imagens</span></div><div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">{available.map((url, i) => <button key={`${url}:${i}`} aria-label={`Ampliar imagem ${i + 1}`} onClick={() => setActive(i)} className="group relative w-[85%] shrink-0 snap-start overflow-hidden rounded-xl border border-line bg-canvas transition duration-150 motion-safe:hover:-translate-y-0.5 hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"><Artwork src={url} title={`Screenshot ${i + 1}`} className="aspect-video w-full rounded-xl" fit="contain" /><Expand size={18} className="absolute right-3 top-3 rounded-md bg-canvas/90 p-1 text-ink opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100" /></button>)}</div>
    {active !== null && <Modal title={`Captura ${active + 1} de ${available.length}`} onClose={() => setActive(null)} wide><div data-console-gallery><Artwork src={available[active]} title={`Screenshot ${active + 1}`} className="h-[55dvh] max-h-[65dvh] min-h-40 w-full" fit="contain" /><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><button className={button} onClick={() => setActive((active - 1 + available.length) % available.length)} disabled={available.length < 2}><ChevronLeft size={15} />Anterior</button><span className="hidden text-[10px] text-muted sm:inline">← → navegar · Esc fechar</span><button className={button} onClick={() => setActive((active + 1) % available.length)} disabled={available.length < 2}>Próxima<ChevronRight size={15} /></button></div></div></Modal>}
  </section>;
}
