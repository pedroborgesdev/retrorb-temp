import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import "./fallout.css";

/** Original retro-futuristic UI kit, loosely inspired by mid-century industrial dashboards.
 * Not affiliated with or endorsed by Fallout / Bethesda / Vault-Tec.
 */
export type FalloutThemeName = "vault" | "wasteland" | "pipboy";
export type FalloutTexture = "grid" | "dots" | "scanlines" | "none";
export type FalloutDensity = "compact" | "comfortable";

export interface FalloutThemeProps extends HTMLAttributes<HTMLDivElement> {
  theme?: FalloutThemeName;
  texture?: FalloutTexture;
  worn?: boolean;
  children: ReactNode;
}
export function FalloutTheme({ theme = "vault", texture = "grid", worn = true, className = "", children, ...rest }: FalloutThemeProps) {
  return <div data-fm-theme={theme} data-fm-texture={texture} data-fm-worn={worn} className={`fm-root ${className}`} {...rest}>{children}</div>;
}

export function FalloutSectionHeading({ number, children }: { number: string; children: ReactNode }) {
  return <div className="fm-section-heading"><span className="fm-section-number">{number}</span><h2>{children}</h2><span className="fm-section-rule" /></div>;
}

export type FalloutButtonKind = "primary" | "secondary" | "danger" | "terminal";
export interface FalloutButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: FalloutButtonKind;
  icon?: ReactNode;
  children: ReactNode;
}
export function FalloutButton({ kind = "primary", icon, className = "", children, type = "button", ...rest }: FalloutButtonProps) {
  return <button type={type} data-kind={kind} className={`fm-button ${className}`} {...rest}>
    {icon && <span className="fm-button-icon" aria-hidden="true">{icon}</span>}
    <span>{children}</span><span className="fm-button-end" aria-hidden="true">›</span>
  </button>;
}

export interface FalloutPanelProps extends HTMLAttributes<HTMLElement> {
  title: string;
  code?: string;
  children: ReactNode;
  footer?: ReactNode;
  display?: "standard" | "terminal";
}
export function FalloutPanel({ title, code = "SYS-01", children, footer, display = "standard", className = "", ...rest }: FalloutPanelProps) {
  return <section className={`fm-panel ${display === "terminal" ? "fm-panel-terminal" : ""} ${className}`} {...rest}>
    <div className="fm-panel-head"><span className="fm-indicator" aria-hidden="true"/><strong>{title}</strong><code>{code}</code></div>
    <div className="fm-panel-body">{children}</div>
    {footer && <div className="fm-panel-footer">{footer}</div>}
  </section>;
}

export interface FalloutGameCardProps {
  title: string;
  image: string;
  source: string;
  console: string;
  size: string;
  downloads: number | string;
  catalogCode?: string;
  density?: FalloutDensity;
  coverFit?: "contain" | "cover";
  favorite?: boolean;
  onFavoriteChange?: (favorite: boolean) => void;
  href?: string;
  onOpen?: () => void;
  className?: string;
}
export function FalloutGameCard({ title, image, source, console, size, downloads, catalogCode = "ARCHIVE", density = "compact", coverFit = "contain", favorite = false, onFavoriteChange, href, onOpen, className = "" }: FalloutGameCardProps) {
  const img = <img src={image} alt={`Capa de ${title}`} loading="lazy" className={`fm-game-image ${coverFit === "cover" ? "fm-image-cover" : ""}`}/>;
  const aria = `Ver detalhes de ${title}`;
  return <article className={`fm-game-card ${density === "comfortable" ? "fm-game-cozy" : ""} ${className}`}>
    <header className="fm-game-header"><span className="fm-indicator"/><span className="fm-game-header-label">GAME ARCHIVE</span><span className="fm-game-index">{catalogCode}</span></header>
    <div className="fm-game-art">
      {href ? <a href={href} className="fm-cover-action" aria-label={aria}>{img}</a>
        : onOpen ? <button type="button" className="fm-cover-action" onClick={onOpen} aria-label={aria}>{img}</button>
        : <div className="fm-cover-action">{img}</div>}
      <span className="fm-source">{source}</span>
      <button type="button" className="fm-favorite" aria-pressed={favorite} aria-label={favorite ? `Remover ${title} dos favoritos` : `Favoritar ${title}`} disabled={!onFavoriteChange} onClick={() => onFavoriteChange?.(!favorite)}>{favorite ? "♥" : "♡"}</button>
    </div>
    <div className="fm-game-details">
      <h3 title={title}>{title}</h3>
      <div className="fm-game-console"><span aria-hidden="true">▣</span><span>{console}</span></div>
      <div className="fm-game-stats"><span><small>SIZE</small>{size}</span><span><small>DL / COUNT</small>↓ {downloads}</span></div>
    </div>
    <div className="fm-game-bottom" aria-hidden="true"><i/><span>●</span><i/></div>
  </article>;
}

export type FalloutBadgeKind = "info" | "warning" | "success" | "danger";
export function FalloutBadge({ kind = "info", children }: { kind?: FalloutBadgeKind; children: ReactNode }) {
  return <span className="fm-badge" data-kind={kind}><span className="fm-badge-dot"/> {children}</span>;
}
export function FalloutKeycap({ children }: { children: ReactNode }) { return <kbd className="fm-keycap">{children}</kbd>; }

export interface FalloutProgressProps { value: number; label?: string; max?: number; }
export function FalloutProgress({ value, label = "TRANSFERÊNCIA", max = 100 }: FalloutProgressProps) {
  const percent = Math.round(Math.max(0, Math.min(100, (value / (max || 1)) * 100)));
  return <div className="fm-progress-wrap"><div className="fm-progress-label"><span>{label}</span><span>{percent}%</span></div>
    <div className="fm-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span style={{width: `${percent}%`}}/></div></div>;
}
export interface FalloutTabsProps { tabs: {value: string; label: string}[]; value: string; onChange: (value: string) => void; }
export function FalloutTabs({ tabs, value, onChange }: FalloutTabsProps) {
  return <div className="fm-tabs" role="tablist" aria-label="Navegação">{tabs.map(tab =>
    <button type="button" key={tab.value} role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)}>{tab.label}</button>
  )}</div>;
}
export interface FalloutInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> { label: string; }
export function FalloutInput({ label, id, className = "", ...rest }: FalloutInputProps) {
  const internalId = useId();
  return <div className={`fm-input-wrap ${className}`}><label htmlFor={id || internalId}>{label}</label>
    <input id={id || internalId} {...rest}/></div>;
}
export interface FalloutToggleProps { label: string; checked: boolean; onChange: (checked:boolean)=>void; disabled?:boolean; }
export function FalloutToggle({ label, checked, onChange, disabled }: FalloutToggleProps) {
  return <label className="fm-toggle-line"><span>{label}</span><button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="fm-toggle"><span/></button></label>;
}
export interface FalloutNoticeProps { heading: string; children: ReactNode; kind?: "warning" | "success"; }
export function FalloutNotice({ heading, children, kind = "success" }: FalloutNoticeProps) {
  return <div className="fm-notice" data-kind={kind} role="status"><span className="fm-notice-symbol" aria-hidden="true">{kind === "warning" ? "!" : "✓"}</span><div><strong>{heading}</strong><p>{children}</p></div><span className="fm-notice-code" aria-hidden="true">SYS-OK</span></div>;
}
export interface FalloutTerminalProps { title?: string; lines: {label: string; value: string}[]; }
export function FalloutTerminal({ title = "PIP TERMINAL", lines }: FalloutTerminalProps) {
  return <section className="fm-terminal"><div className="fm-terminal-top"><span>▣ {title}</span><span>CONNECTED ●</span></div><div className="fm-terminal-lines">{lines.map((line, i) => <div key={`${i}-${line.label}`}><span>› {line.label}</span><strong>{line.value}</strong></div>)}</div><div className="fm-terminal-foot">[ DATA ] &nbsp; [ INVENTORY ] &nbsp; [ SYSTEM ]</div></section>;
}
