import { useId, useState, type FormEvent } from 'react';
import { BookOpen, Heart, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/useLibrary';
import { sources, sourceLabels, type Source } from '../types/contracts';
import { GameCollection, ViewToggle } from '../components/GameCollection';
import { button, EmptyState, input, Modal, primaryButton } from '../components/ui';
import { Listbox } from '../components/Listbox';
import { safeUrl } from '../lib/format';
import { PageHeading } from '../components/PageHeading';

function AddGame({ onClose }: { onClose: () => void }) {
  const save = useLibrary((s) => s.save);
  const [error, setError] = useState('');
  const sourceLabelId = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    const url = String(data.get('url') || '').trim();
    const source = data.get('source') as Source;
    const domain = { romsfun: 'romsfun.com', romspure: 'romspure.cc', romsgames: 'romsgames.net', wowroms: 'wowroms.com' }[source];
    if (!title) { setError('Informe o nome do jogo.'); return; }
    if (url && (!safeUrl(url) || ![domain, `www.${domain}`].includes(new URL(url).hostname))) { setError('Informe uma URL HTTPS da fonte selecionada ou deixe em branco.'); return; }
    save({ title, console: String(data.get('console') || '').trim() || null, source, url: url || null, icon: null, size: null, downloads: null }); onClose();
  }
  return <Modal title="Adicionar jogo à biblioteca" onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="text-xs leading-6 text-muted">Salve uma referência local. Nenhum arquivo será baixado ou marcado como concluído.</p><label className="block space-y-2 text-xs"><span>Nome do jogo</span><input name="title" className={input} required maxLength={200} autoFocus /></label><label className="block space-y-2 text-xs"><span>Console <span className="text-muted">(opcional)</span></span><input name="console" className={input} maxLength={100} /></label><div className="space-y-2 text-xs"><span id={sourceLabelId} className="block">Fonte de referência</span><Listbox<Source> name="source" ariaLabelledBy={sourceLabelId} defaultValue={sources[0]} className="w-full" options={sources.map((source) => ({ value: source, label: sourceLabels[source] }))} /></div><label className="block space-y-2 text-xs"><span>URL do jogo <span className="text-muted">(opcional)</span></span><input name="url" type="url" className={input} placeholder="https://…" maxLength={2048} /></label>{error && <p role="alert" className="text-xs text-danger">{error}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" className={button} onClick={onClose}>Cancelar</button><button className={primaryButton} type="submit">Adicionar jogo</button></div></form></Modal>;
}

export function LibraryPage({ favorites = false }: { favorites?: boolean }) {
  const entries = useLibrary((s) => s.entries);
  const remove = useLibrary((s) => s.remove);
  const [query, setQuery] = useState('');
  const [consoleName, setConsole] = useState('');
  const [sort, setSort] = useState('recent');
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const available = entries.filter((e) => favorites ? e.favorite : e.inLibrary);
  const consoles = [...new Set(available.flatMap((e) => e.console ? [e.console] : []))].sort();
  const filtered = available.filter((e) => (e.title || '').toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!consoleName || e.console === consoleName)).sort((a, b) => sort === 'name' ? (a.title || '').localeCompare(b.title || '') : b.addedAt.localeCompare(a.addedAt));
  return <div className="space-y-4 sm:space-y-5">
    <PageHeading
      eyebrow={favorites ? 'Seus jogos preferidos' : 'Seu acervo pessoal'}
      title={favorites ? 'Favoritos' : 'Minha biblioteca'}
      description={favorites ? 'Os clássicos que merecem um lugar especial.' : 'Seus jogos, em um só lugar.'}
      icon={favorites ? Heart : BookOpen}
      palette={favorites ? 'coral' : 'orange'}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-inset px-2.5 py-1 text-[10px] font-medium text-muted sm:px-3 sm:py-1.5 sm:text-[11px]">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${favorites ? 'bg-brand-coral' : 'bg-accent'}`} />
        <strong className="font-semibold tabular-nums text-ink">{available.length}</strong> {available.length === 1 ? 'jogo' : 'jogos'}
      </span>
      {!favorites && <button onClick={() => setAdding(true)} className={primaryButton}><Plus size={14} />Adicionar jogo</button>}
    </PageHeading>
    <div className="retro-rise flex flex-col gap-2 rounded-2xl border border-line bg-inset/70 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 sm:p-3" style={{ '--stagger': 1 } as import('react').CSSProperties}>
      <div className="relative w-full sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input aria-label="Pesquisar na biblioteca" placeholder="Buscar na sua coleção" value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} bg-surface pl-9 text-xs`} /></div>
      <div className="grid grid-cols-2 gap-1.5 sm:contents">
        <Listbox ariaLabel="Console da biblioteca" value={consoleName} onChange={setConsole} className="w-full sm:w-auto" options={[{ value: '', label: 'Todos os consoles' }, ...consoles.map((name) => ({ value: name, label: name }))]} />
        <Listbox ariaLabel="Ordenar biblioteca" value={sort} onChange={setSort} className="w-full sm:w-auto" options={[{ value: 'recent', label: 'Adicionados recentemente' }, { value: 'name', label: 'Nome: A–Z' }]} />
      </div>
      <div className="flex items-center justify-end gap-2 sm:ml-auto">{!favorites && available.length > 0 && <button className={button} onClick={() => setManaging(!managing)}>{managing ? 'Concluir' : 'Gerenciar'}</button>}<ViewToggle /></div>
    </div>
    {filtered.length ? <>{managing && <div className="retro-rise rounded-2xl border border-line bg-surface p-3.5 shadow-sm sm:rounded-[20px] sm:p-5"><h2 className="mb-2.5 text-xs font-semibold text-ink">Remover referências da biblioteca</h2><div className="divide-y divide-line">{filtered.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate text-xs">{item.title}</span><button className={button} aria-label={`Remover ${item.title} da biblioteca`} onClick={() => remove(item.id)}><Trash2 size={12} />Remover</button></div>)}</div></div>}<GameCollection items={filtered} /></> : <EmptyState icon={favorites ? Heart : BookOpen} title={available.length ? 'Nenhum jogo com esses filtros' : favorites ? 'Nenhum favorito ainda' : 'Sua biblioteca está vazia'} description={available.length ? 'Tente outro nome ou selecione outro console.' : favorites ? 'Marque seus jogos preferidos para encontrá-los facilmente.' : 'Encontre seus clássicos e comece sua coleção.'}><Link to="/explore" className={button}>Explorar jogos</Link></EmptyState>}
    {adding && <AddGame onClose={() => setAdding(false)} />}
  </div>;
}
