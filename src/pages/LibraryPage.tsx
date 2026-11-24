import { useState, type FormEvent } from 'react';
import { BookOpen, Heart, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/useLibrary';
import { sources, sourceLabels, type Source } from '../types/contracts';
import { GameCollection, ViewToggle } from '../components/GameCollection';
import { button, EmptyState, input, Modal, primaryButton, select } from '../components/ui';
import { safeUrl } from '../lib/format';
import { PageHeading } from '../components/PageHeading';

function AddGame({ onClose }: { onClose: () => void }) {
  const save = useLibrary((s) => s.save);
  const [error, setError] = useState('');
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
  return <Modal title="Adicionar jogo à biblioteca" onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="text-xs leading-6 text-muted">Salve uma referência local. Nenhum arquivo será baixado ou marcado como concluído.</p><label className="block space-y-2 text-xs"><span>Nome do jogo</span><input name="title" className={input} required maxLength={200} autoFocus /></label><label className="block space-y-2 text-xs"><span>Console <span className="text-muted">(opcional)</span></span><input name="console" className={input} maxLength={100} /></label><label className="block space-y-2 text-xs"><span>Fonte de referência</span><select name="source" className={`${select} w-full`}>{sources.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}</select></label><label className="block space-y-2 text-xs"><span>URL do jogo <span className="text-muted">(opcional)</span></span><input name="url" type="url" className={input} placeholder="https://…" maxLength={2048} /></label>{error && <p role="alert" className="text-xs text-danger">{error}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" className={button} onClick={onClose}>Cancelar</button><button className={primaryButton} type="submit">Adicionar jogo</button></div></form></Modal>;
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
  return <div className="space-y-6"><PageHeading eyebrow={favorites ? 'Seus jogos preferidos' : 'Seu acervo pessoal'} title={favorites ? 'Favoritos' : 'Minha biblioteca'} description={favorites ? 'Os clássicos que merecem um lugar especial.' : 'Seus jogos, em um só lugar.'} icon={favorites ? Heart : BookOpen}>{!favorites && <button onClick={() => setAdding(true)} className={primaryButton}><Plus size={14} />Adicionar jogo</button>}</PageHeading>
    <div className="flex flex-wrap items-center gap-3"><div className="relative w-full max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input aria-label="Pesquisar na biblioteca" placeholder="Buscar na sua coleção" value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} pl-9 text-xs`} /></div><select aria-label="Console da biblioteca" className={select} value={consoleName} onChange={(e) => setConsole(e.target.value)}><option value="">Todos os consoles</option>{consoles.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Ordenar biblioteca" className={select} value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Adicionados recentemente</option><option value="name">Nome: A–Z</option></select><div className="ml-auto flex items-center gap-2">{!favorites && available.length > 0 && <button className={button} onClick={() => setManaging(!managing)}>{managing ? 'Concluir' : 'Gerenciar'}</button>}<ViewToggle /></div></div>
    {filtered.length ? <><GameCollection items={filtered} />{managing && <div className="rounded-lg border border-line bg-surface p-4"><h2 className="mb-3 text-xs font-medium">Remover referências da biblioteca</h2><div className="divide-y divide-line">{filtered.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-2"><span className="text-xs">{item.title}</span><button className={button} aria-label={`Remover ${item.title} da biblioteca`} onClick={() => remove(item.id)}><Trash2 size={12} />Remover</button></div>)}</div></div>}</> : <EmptyState icon={favorites ? Heart : BookOpen} title={available.length ? 'Nenhum jogo com esses filtros' : favorites ? 'Nenhum favorito ainda' : 'Sua biblioteca está vazia'} description={available.length ? 'Tente outro nome ou selecione outro console.' : favorites ? 'Marque seus jogos preferidos para encontrá-los facilmente.' : 'Encontre seus clássicos e comece sua coleção.'}><Link to="/explore" className={button}>Explorar jogos</Link></EmptyState>}
    {adding && <AddGame onClose={() => setAdding(false)} />}
  </div>;
}
