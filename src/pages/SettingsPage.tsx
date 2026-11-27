import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, Check, ExternalLink, Eye, EyeOff, Info, KeyRound, Layers3, Palette, RotateCcw, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { desktopApi } from '../api/desktop';
import { DEFAULT_HF_MODEL, HF_MODEL_PRESETS } from '../api/ai';
import { useLibrary, type Preferences } from '../store/useLibrary';
import { sources, sourceLabels } from '../types/contracts';
import { SourceMark } from '../components/SourceMark';
import { button, input } from '../components/ui';
import { Listbox } from '../components/Listbox';
import { PageHeading } from '../components/PageHeading';
import { accentOptions } from '../lib/colors';

function Setting({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3.5 last:border-0 sm:py-4"><div className="min-w-0 flex-1 basis-56"><h3 className="text-xs font-medium text-ink">{title}</h3><p className="mt-1 max-w-lg text-[11px] leading-4 text-muted sm:leading-5">{description}</p></div>{children}</div>;
}

const categories = [
  { name: 'Geral', icon: SlidersHorizontal },
  { name: 'Aparência', icon: Palette },
  { name: 'Downloads', icon: ArrowDownToLine },
  { name: 'Fontes', icon: Layers3 },
  { name: 'IA', icon: Sparkles },
  { name: 'Sobre', icon: Info },
] as const;
type CategoryName = (typeof categories)[number]['name'];

export function SettingsPage() {
  const [params] = useSearchParams();
  const preferences = useLibrary((s) => s.preferences);
  const set = useLibrary((s) => s.setPreferences);
  const errors = useLibrary((s) => s.sourceErrors);
  const clearRecents = useLibrary((s) => s.clearRecents);
  const [category, setCategory] = useState<CategoryName>(() => (params.get('tab')?.toLowerCase() === 'ia' ? 'IA' : 'Geral'));
  const [showKey, setShowKey] = useState(false);
  const recents = useLibrary((s) => s.recents);
  const hasHfKey = Boolean(preferences.hfApiKey.trim());
  const currentModel = preferences.hfModel.trim() || DEFAULT_HF_MODEL;

  return <div className="space-y-4 sm:space-y-5">
    <PageHeading eyebrow="Do seu jeito" title="Configurações" description="Personalize sua experiência no RetroOrb." icon={Settings2} palette="coral" />
    <div className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[192px_minmax(0,1fr)]">
      <div data-console-tabs aria-label="Categorias de configurações" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-inset/60 p-1.5 lg:flex-col lg:self-start">
        {categories.map(({ name, icon: Icon }) => {
          const active = category === name;
          return (
            <button
              data-console-tab
              key={name}
              aria-pressed={active}
              onClick={() => setCategory(name)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-colors sm:px-3.5 sm:py-2 sm:text-sm ${
                active
                  ? 'border-accent/30 bg-surface text-accent shadow-xs'
                  : 'border-transparent text-muted hover:bg-hover/60 hover:text-ink'
              }`}
            >
              <Icon size={14} aria-hidden="true" className="shrink-0" />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <section className="retro-rise relative min-w-0 max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface px-4 shadow-sm sm:rounded-[20px] sm:px-6" style={{ '--stagger': 1 } as import('react').CSSProperties}>
        <div
          aria-hidden="true"
          className="retro-spectrum pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            backgroundImage:
              'linear-gradient(90deg, var(--retro-orange) 0%, var(--retro-coral) 45%, var(--retro-gold) 75%, var(--retro-orange) 100%)',
          }}
        />
        <div className="overflow-x-hidden">
        <div key={category} className="retro-tab-enter">
        {category === 'Geral' && <><Setting title="Idioma" description="Interface disponível em português do Brasil."><Listbox ariaLabel="Idioma" disabled value="pt-BR" options={[{ value: 'pt-BR', label: 'Português (Brasil)' }]} /></Setting><Setting title="Iniciar com o sistema" description="A inicialização automática ainda não está integrada ao ambiente desktop."><span className="text-[10px] text-muted">Indisponível</span></Setting><Setting title="Pesquisas recentes" description={`${recents.length} pesquisas armazenadas neste dispositivo.`}><button className={button} disabled={!recents.length} onClick={clearRecents}>Limpar histórico</button></Setting></>}
        {category === 'Aparência' && <><Setting title="Tema" description="Escolha a aparência da interface."><Listbox<Preferences['theme']> ariaLabel="Tema" value={preferences.theme} onChange={(theme) => set({ theme })} options={[{ value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }]} /></Setting><Setting title="Cor de destaque" description="Uma cor para seus botões e seleções."><div className="flex gap-2">{(Object.keys(accentOptions) as (keyof typeof accentOptions)[]).map((color) => <button key={color} aria-label={`Destaque ${accentOptions[color].label}`} aria-pressed={preferences.accent === color} onClick={() => set({ accent: color })} style={{ backgroundColor: accentOptions[color].color }} className={`flex size-8 items-center justify-center rounded-lg text-brand-ink shadow-xs ring-offset-2 ring-offset-surface transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${preferences.accent === color ? 'ring-1 ring-ink' : ''}`}>{preferences.accent === color && <Check size={14} className="retro-pop" />}</button>)}</div></Setting><Setting title="Tamanho dos cards" description="Veja mais jogos por linha ou dê mais espaço às capas."><Listbox<Preferences['cardSize']> ariaLabel="Tamanho dos cards" value={preferences.cardSize} onChange={(cardSize) => set({ cardSize })} options={[{ value: 'comfortable', label: 'Confortável' }, { value: 'compact', label: 'Compacto' }]} /></Setting><Setting title="Densidade" description="Ajuste o espaço disponível ao redor do conteúdo."><Listbox<Preferences['density']> ariaLabel="Densidade" value={preferences.density} onChange={(density) => set({ density })} options={[{ value: 'comfortable', label: 'Confortável' }, { value: 'compact', label: 'Compacta' }]} /></Setting></>}
        {category === 'Downloads' && <><Setting title="Pasta de destino" description={desktopApi.available ? 'Os pacotes são gravados em roms/, na raiz do aplicativo, sem extração.' : 'Na edição web, o navegador escolhe a pasta e salva o arquivo sem sair da página do jogo.'}><span className="text-[10px] text-muted">{desktopApi.available ? 'roms/' : 'Gerenciada pelo navegador'}</span></Setting><Setting title="Progresso e cancelamento" description={desktopApi.available ? 'A tela Downloads mostra bytes, porcentagem e falhas. Cancelar interrompe a transferência e apaga o arquivo parcial.' : 'O navegador controla o progresso. A tela Downloads não recebe esse andamento na edição web.'}><span className="text-[10px] text-muted">{desktopApi.available ? 'Na tela Downloads' : 'No navegador'}</span></Setting></>}
        {category === 'Fontes' && sources.map((source) => <div key={source} className="border-b border-line last:border-0"><Setting title={sourceLabels[source]} description={preferences.enabledSources.includes(source) ? 'Incluída nas pesquisas e na aba Todas.' : 'Esta fonte não será consultada.'}><div className="flex items-center gap-4"><SourceMark source={source} /><button role="switch" aria-checked={preferences.enabledSources.includes(source)} aria-label={`Habilitar ${sourceLabels[source]}`} onClick={() => set({ enabledSources: preferences.enabledSources.includes(source) ? preferences.enabledSources.filter((s) => s !== source) : [...preferences.enabledSources, source] })} className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${preferences.enabledSources.includes(source) ? 'bg-accent' : 'bg-line'}`}><span className={`size-4 rounded-full bg-white transition-transform ${preferences.enabledSources.includes(source) ? 'translate-x-4' : ''}`} /></button><Link aria-label={`Explorar jogos de ${sourceLabels[source]}`} to={`/explore?${new URLSearchParams({ q: params.get('q') || '', source, ...(params.get('console') ? { console: params.get('console')! } : {}) })}`} className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-accent"><ExternalLink size={13} />Explorar</Link></div></Setting>{errors[source] && <p className="mb-4 flex items-start gap-2 text-[11px] leading-5 text-danger"><Info size={13} className="mt-1 shrink-0" />{errors[source]?.message}</p>}</div>)}
        {category === 'IA' && (
          <>
            <Setting
              title="Chave do Hugging Face"
              description="Usada pelo backend local para consultar o Inference Router do Hugging Face ao gerar descrições na página do jogo. Fica salva apenas neste navegador."
            >
              <div className="flex w-full flex-col gap-2 sm:max-w-sm">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <KeyRound size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      aria-label="Chave do Hugging Face"
                      type={showKey ? 'text' : 'password'}
                      value={preferences.hfApiKey}
                      onChange={(event) => set({ hfApiKey: event.target.value })}
                      placeholder="hf_..."
                      autoComplete="off"
                      spellCheck={false}
                      className={`${input} pl-9 pr-9 font-mono text-xs`}
                    />
                    <button
                      type="button"
                      aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                      onClick={() => setShowKey((visible) => !visible)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {hasHfKey && (
                    <button type="button" className={button} onClick={() => set({ hfApiKey: '' })}>
                      Limpar
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`inline-flex items-center gap-1.5 font-medium ${hasHfKey ? 'text-success' : 'text-muted'}`}>
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${hasHfKey ? 'bg-success' : 'bg-line'}`} />
                    {hasHfKey ? 'Configurada' : 'Não configurada'}
                  </span>
                  <span className="text-muted">Permissão recomendada: Inference Providers</span>
                </div>
              </div>
            </Setting>

            <Setting
              title="Modelo de inferência"
              description="Informe qualquer modelo compatível no Hugging Face Router (organizacao/modelo ou modelo:provedor). Padrão: openai/gpt-oss-120b."
            >
              <div className="flex w-full flex-col gap-2 sm:max-w-sm">
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label="Modelo do Hugging Face"
                    type="text"
                    value={preferences.hfModel}
                    onChange={(event) => set({ hfModel: event.target.value })}
                    placeholder={DEFAULT_HF_MODEL}
                    spellCheck={false}
                    className={`${input} font-mono text-xs`}
                  />
                  {currentModel !== DEFAULT_HF_MODEL && (
                    <button
                      type="button"
                      title="Restaurar modelo padrão"
                      aria-label="Restaurar modelo padrão"
                      className={button}
                      onClick={() => set({ hfModel: DEFAULT_HF_MODEL })}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {HF_MODEL_PRESETS.map((preset) => {
                    const selected = currentModel === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => set({ hfModel: preset })}
                        className={`rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors ${
                          selected
                            ? 'border-accent/50 bg-accent/15 font-semibold text-accent'
                            : 'border-line bg-inset/70 text-muted hover:border-muted/60 hover:text-ink'
                        }`}
                      >
                        {preset}
                        {preset === DEFAULT_HF_MODEL ? ' · padrão' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Setting>
          </>
        )}
        {category === 'Sobre' && <><Setting title="RetroOrb" description="Um lugar para encontrar, organizar e redescobrir seus jogos retrô."><span className="text-xs text-muted">v0.1.0</span></Setting><Setting title="Seus dados" description="Biblioteca, favoritos e preferências ficam no armazenamento local deste perfil. Limpar os dados do navegador remove essa coleção."><Info size={17} className="text-muted" /></Setting><Setting title="Fontes independentes" description="Metadados e disponibilidade dos arquivos são fornecidos pelos respectivos provedores. Acesse apenas conteúdo autorizado."><span className="text-[10px] text-muted">4 integrações</span></Setting></>}
        </div>
        </div>
      </section>
    </div>
  </div>;
}
