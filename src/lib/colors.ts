import type { CSSProperties } from 'react';
import catalog from '../../contexto/color-catalogue.json';

// The JSON is the source of truth. Components use roles, never copied hex values.
export const brand = catalog.identidade;
export const retroColors = {
  teal: brand.turquesa,
  coral: brand.coral,
  orange: brand.laranja,
  blue: catalog.paletas['Retro Pop'].find((color) => color.nome === 'Azul Piscina')!.hex,
  green: catalog.paletas['Retro Pop'].find((color) => color.nome === 'Verde Menta')!.hex,
  gold: catalog.paletas['Retro Pop'].find((color) => color.nome === 'Amarelo Solar')!.hex,
};
export type FrameColor = keyof typeof retroColors;
export const sourcePalettes = { romsfun: 'coral', romspure: 'orange', romsgames: 'teal', wowroms: 'gold' } as const;
export const sourceTextures = { romsfun: 'dots', romspure: 'grid', romsgames: 'dots', wowroms: 'grid' } as const;
export type ThemeVariables = CSSProperties & Record<`--retro-${string}`, string>;
export const accentOptions = {
  brand: { label: 'turquesa da logo', color: brand.turquesa },
  coral: { label: 'coral da logo', color: brand.coral },
  blue: { label: 'azul', color: retroColors.blue },
  green: { label: 'verde', color: retroColors.green },
};

export function themeVariables(theme: 'dark' | 'light', accent: keyof typeof accentOptions): ThemeVariables {
  const base = theme === 'light' ? catalog.bases_ui_claro : {
    fundo_principal: '#1B1C1E', fundo_card: '#26282B', card_jogo: '#26282B', borda: '#3C3F43', texto: '#F5F5F5',
  };
  const color = accentOptions[accent].color;
  return {
    '--retro-canvas': base.fundo_principal,
    '--retro-surface': base.fundo_card,
    '--retro-game-card': base.card_jogo,
    '--retro-sidebar': theme === 'dark' ? '#202123' : base.fundo_card,
    '--retro-brand-surface': catalog.bases_ui.fundo_card,
    '--retro-hover': theme === 'dark' ? '#2E3034' : `color-mix(in srgb, ${base.fundo_card} 88%, ${base.texto})`,
    '--retro-inset': theme === 'dark' ? '#222427' : base.fundo_principal,
    '--retro-line': base.borda,
    '--retro-ink': base.texto,
    '--retro-muted': theme === 'dark' ? '#A4A8AD' : `color-mix(in srgb, ${base.texto} 68%, ${base.fundo_card})`,
    '--retro-accent': theme === 'light' ? `color-mix(in srgb, ${color} 50%, ${brand.tinta})` : color,
    '--retro-on-accent': theme === 'light' ? brand.papel : brand.tinta,
    '--retro-success': theme === 'light' ? brand.petroleo : retroColors.green,
    '--retro-danger': theme === 'light' ? `color-mix(in srgb, ${brand.coral} 55%, ${brand.tinta})` : brand.coral,
    '--retro-paper': brand.papel,
    '--retro-brand-ink': brand.tinta,
    '--retro-teal': brand.turquesa,
    '--retro-coral': brand.coral,
    '--retro-orange': brand.laranja,
    '--retro-gold': retroColors.gold,
  };
}
