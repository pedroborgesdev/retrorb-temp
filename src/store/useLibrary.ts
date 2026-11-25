import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { z } from 'zod';
import { gameSchema, searchResultSchema, sourceSchema, sources, type CatalogItem, type Game, type Source } from '../types/contracts';
import { itemId } from '../lib/format';

const entrySchema = searchResultSchema.extend({
  source: sourceSchema, id: z.string(), addedAt: z.string(), favorite: z.boolean(), inLibrary: z.boolean(), game: gameSchema.optional(),
});
export type LibraryEntry = z.infer<typeof entrySchema>;
const handoffSchema = z.object({ id: z.string(), title: z.string(), source: sourceSchema, filename: z.string().nullable(), size: z.string().nullable(), icon: z.string().nullable(), date: z.string(), gameUrl: z.string().nullable() });
const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light']).default('dark'), accent: z.enum(['brand', 'coral', 'blue', 'green']).catch('brand').default('brand'),
  cardSize: z.enum(['compact', 'comfortable']).default('comfortable'), density: z.enum(['compact', 'comfortable']).default('comfortable'),
  enabledSources: z.array(sourceSchema).default([...sources]), view: z.enum(['grid', 'list']).default('grid'),
});
export type Preferences = z.infer<typeof preferencesSchema>;
const savedSchema = z.object({
  entries: z.array(entrySchema).default([]), recents: z.array(z.string()).default([]),
  handoffs: z.array(handoffSchema).default([]), preferences: preferencesSchema.default(preferencesSchema.parse({})),
});

type State = z.infer<typeof savedSchema> & {
  notice: string | null;
  sourceErrors: Partial<Record<Source, { message: string; date: string }>>;
  setNotice: (notice: string | null) => void;
  recordError: (source: Source, message: string) => void;
  clearError: (source: Source) => void;
  addRecent: (query: string) => void;
  clearRecents: () => void;
  setPreferences: (preferences: Partial<Preferences>) => void;
  save: (item: CatalogItem, game?: Game) => void;
  toggleFavorite: (item: CatalogItem, game?: Game) => void;
  remove: (id: string) => void;
};

function entry(item: CatalogItem, game?: Game): LibraryEntry {
  return { ...item, id: itemId(item), addedAt: new Date().toISOString(), favorite: false, inLibrary: false, ...(game ? { game } : {}) };
}

export const useLibrary = create<State>()(persist((set) => ({
  ...savedSchema.parse({}), notice: null, sourceErrors: {},
  setNotice: (notice) => set({ notice }),
  recordError: (source, message) => set((s) => ({ sourceErrors: { ...s.sourceErrors, [source]: { message, date: new Date().toISOString() } } })),
  clearError: (source) => set((s) => { const errors = { ...s.sourceErrors }; delete errors[source]; return { sourceErrors: errors }; }),
  addRecent: (query) => set((s) => ({ recents: [query, ...s.recents.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 8) })),
  clearRecents: () => set({ recents: [] }),
  setPreferences: (preferences) => set((s) => ({ preferences: { ...s.preferences, ...preferences } })),
  save: (item, game) => set((s) => {
    const old = s.entries.find((e) => e.id === itemId(item));
    const updated = { ...entry(item), ...old, ...item, ...(game ? { game } : {}), inLibrary: true };
    return { entries: [updated, ...s.entries.filter((e) => e.id !== updated.id)], notice: 'Jogo salvo na biblioteca.' };
  }),
  toggleFavorite: (item, game) => set((s) => {
    const old = s.entries.find((e) => e.id === itemId(item));
    const updated = { ...entry(item), ...old, ...item, ...(game ? { game } : {}), favorite: !old?.favorite };
    const rest = s.entries.filter((e) => e.id !== updated.id);
    return { entries: updated.favorite || updated.inLibrary ? [updated, ...rest] : rest };
  }),
  remove: (id) => set((s) => ({ entries: s.entries.flatMap((e) => e.id !== id ? [e] : e.favorite ? [{ ...e, inLibrary: false }] : []), notice: 'Jogo removido da biblioteca.' })),
}), {
  name: 'retromancy-v1',
  storage: createJSONStorage(() => ({
    getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { window.dispatchEvent(new Event('storage-unavailable')); } },
    removeItem: (key) => { try { localStorage.removeItem(key); } catch { /* In-memory state still works. */ } },
  })),
  partialize: ({ entries, recents, handoffs, preferences }) => ({ entries, recents, handoffs, preferences }),
  merge: (saved, current) => { const parsed = savedSchema.safeParse(saved); return parsed.success ? { ...current, ...parsed.data } : current; },
}));
