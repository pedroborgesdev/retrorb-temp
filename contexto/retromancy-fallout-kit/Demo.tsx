import { useState } from "react";
import {
  FalloutBadge, FalloutButton, FalloutGameCard, FalloutInput, FalloutKeycap,
  FalloutNotice, FalloutPanel, FalloutProgress, FalloutSectionHeading,
  FalloutTabs, FalloutTerminal, FalloutTheme, FalloutToggle,
  type FalloutThemeName, type FalloutTexture, type FalloutDensity
} from "./FalloutUI";

const games = [
  { title:"Pokemon Crystal Maeson", image: new URL("./assets/cover-1.webp", import.meta.url).href, console:"Game Boy Color",size:"1.06 MB",downloads:"416" },
  { title:"Pokemon – Origin HeartGold", image: new URL("./assets/cover-2.webp", import.meta.url).href, console:"Nintendo DS",size:"74.87 MB",downloads:"17,8 mil" },
  { title:"Pokemon Ghost Grey Version", image: new URL("./assets/cover-3.webp", import.meta.url).href, console:"Game Boy Advance",size:"30.04 MB",downloads:"2.513" },
  { title:"Red Hot Poker", image: new URL("./assets/cover-4.webp", import.meta.url).href, console:"Xbox 360",size:"27.96 MB",downloads:"0" },
  { title:"Poker Stacker 2", image: new URL("./assets/cover-5.webp", import.meta.url).href, console:"Xbox 360",size:"12.92 MB",downloads:"1" },
  { title:"Poker Stacker", image: new URL("./assets/cover-6.webp", import.meta.url).href, console:"Xbox 360",size:"4.6 MB",downloads:"0" },
];
export default function Demo() {
  const [theme,setTheme]=useState<FalloutThemeName>("vault");
  const [texture,setTexture]=useState<FalloutTexture>("grid");
  const [worn,setWorn]=useState(true);
  const [density,setDensity]=useState<FalloutDensity>("compact");
  const [fit,setFit]=useState<"contain"|"cover">("contain");
  const [favorites,setFavorites]=useState<number[]>([]);
  const [tab,setTab]=useState("games");
  const [progress,setProgress]=useState(72);
  const [effects,setEffects]=useState(true);
  const [selected,setSelected]=useState("");
  return <FalloutTheme theme={theme} texture={texture} worn={worn} className="min-h-screen p-4 sm:p-8">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 border-b-2 border-[var(--fm-line)] pb-5">
        <span className="font-mono text-xs font-bold uppercase tracking-[.2em] text-[var(--fm-accent)]">RETROMANCY / ARCHIVE SYSTEM v.02</span>
        <h1 className="mt-3 text-3xl font-black uppercase sm:text-5xl">THE ATOMIC ARCHIVE</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--fm-muted)]">Coleção retrô-futurista de componentes inspirados em terminais industriais, painéis nucleares e computadores dos anos 1950.</p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-[var(--fm-line)] bg-[var(--fm-head)] p-4 sm:grid-cols-5">
        <label className="text-xs font-bold">TEMA<select className="mt-2 w-full bg-[var(--fm-bg)] p-2" value={theme} onChange={e=>setTheme(e.target.value as FalloutThemeName)}><option value="vault">Vault / Azul</option><option value="wasteland">Wasteland</option><option value="pipboy">Pip-Boy / Verde</option></select></label>
        <label className="text-xs font-bold">TEXTURA<select className="mt-2 w-full bg-[var(--fm-bg)] p-2" value={texture} onChange={e=>setTexture(e.target.value as FalloutTexture)}><option value="grid">Grade</option><option value="dots">Bolinhas</option><option value="scanlines">Scanlines</option><option value="none">Nenhuma</option></select></label>
        <label className="text-xs font-bold">DENSIDADE<select className="mt-2 w-full bg-[var(--fm-bg)] p-2" value={density} onChange={e=>setDensity(e.target.value as FalloutDensity)}><option value="compact">Compacto</option><option value="comfortable">Detalhado</option></select></label>
        <label className="text-xs font-bold">CAPAS<select className="mt-2 w-full bg-[var(--fm-bg)] p-2" value={fit} onChange={e=>setFit(e.target.value as "contain"|"cover")}><option value="contain">Inteiras</option><option value="cover">Preencher</option></select></label>
        <label className="flex items-center gap-2 self-end text-xs font-bold"><input type="checkbox" checked={worn} onChange={e=>setWorn(e.target.checked)} /> METAL USADO</label>
      </div>
      <FalloutSectionHeading number="01">Game archives</FalloutSectionHeading>
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${density === "compact" ? "md:grid-cols-3 xl:grid-cols-6" : "md:grid-cols-3"}`}>
        {games.map((game,i)=><FalloutGameCard key={i} {...game} source="RomsFun" catalogCode={`ARCH-0${i+1}`} density={density} coverFit={fit} favorite={favorites.includes(i)} onFavoriteChange={v=>setFavorites(xs=>v?[...xs,i]:xs.filter(x=>x!==i))} onOpen={()=>setSelected(game.title)} />)}
      </div>
      {selected && <p className="mt-3 font-mono text-xs text-[var(--fm-accent)]">SELECIONADO: {selected}</p>}
      <FalloutSectionHeading number="02">Buttons &amp; controls</FalloutSectionHeading>
      <div className="flex flex-wrap gap-3"><FalloutButton icon="▶">Iniciar jogo</FalloutButton><FalloutButton kind="secondary" icon="↓">Download</FalloutButton><FalloutButton kind="danger" icon="!">Remover</FalloutButton><FalloutButton kind="terminal" icon=">_">Abrir terminal</FalloutButton></div>
      <FalloutSectionHeading number="03">Panels &amp; terminal</FalloutSectionHeading>
      <div className="grid gap-4 md:grid-cols-2">
        <FalloutPanel title="Biblioteca" code="INV-001" footer="42 GAMES INDEXED  •  SYSTEM ONLINE"><h3 className="text-2xl font-black uppercase">Minha coleção</h3><p className="mt-3 text-sm">Seus clássicos organizados como um catálogo técnico de abrigo nuclear.</p></FalloutPanel>
        <FalloutTerminal title="ARCHIVE STATUS" lines={[{label:"SOURCE",value:"ROMSFUN"},{label:"GAMES AVAILABLE",value:"042"},{label:"STORAGE",value:"72%"},{label:"SYSTEM",value:"ONLINE"}]}/>
      </div>
      <FalloutSectionHeading number="04">Labels &amp; indicators</FalloutSectionHeading>
      <div className="flex flex-wrap items-center gap-3"><FalloutBadge>VERIFIED</FalloutBadge><FalloutBadge kind="warning">CAUTION</FalloutBadge><FalloutBadge kind="success">INSTALLED</FalloutBadge><FalloutBadge kind="danger">ERROR</FalloutBadge><FalloutKeycap>A</FalloutKeycap><FalloutKeycap>B</FalloutKeycap><FalloutKeycap>X</FalloutKeycap></div>
      <FalloutSectionHeading number="05">Navigation &amp; system</FalloutSectionHeading>
      <FalloutPanel title="Navegação" code="SYS-NAV"><FalloutTabs tabs={[{value:"games",label:"Games"},{value:"consoles",label:"Consoles"},{value:"favorites",label:"Favorites"}]} value={tab} onChange={setTab}/><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><FalloutProgress value={progress} label="DOWNLOAD STATUS"/><input aria-label="Ajustar progresso" type="range" min="0" max="100" value={progress} onChange={e=>setProgress(Number(e.target.value))} className="mt-3 w-full accent-[var(--fm-accent)]"/></div><div className="space-y-4"><FalloutInput label="SEARCH DATABASE" placeholder="> Pokémon..."/><FalloutToggle label="ACTIVE SYSTEM" checked={effects} onChange={setEffects}/></div></div></FalloutPanel>
      <div className="mt-4"><FalloutNotice heading="TRANSFER COMPLETED">O jogo foi adicionado à sua biblioteca com sucesso.</FalloutNotice></div>
    </div>
  </FalloutTheme>;
}
