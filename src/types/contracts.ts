import { z } from 'zod';

export const sources = ['romsfun', 'romspure', 'romsgames', 'wowroms'] as const;
export const sourceSchema = z.enum(sources);
export type Source = z.infer<typeof sourceSchema>;
export const sourceLabels: Record<Source, string> = {
  romsfun: 'RomsFun', romspure: 'RomsPure', romsgames: 'RomsGames', wowroms: 'WowRoms',
};
const text = z.string().nullable();
const number = z.number().finite().nonnegative().nullable();
export const searchResultSchema = z.object({
  title: text, url: text, icon: text, console: text, size: text, downloads: number,
});
export type SearchResult = z.infer<typeof searchResultSchema>;
export const sourceSearchSchema = z.object({
  label: z.string(), results: z.array(searchResultSchema), error: text,
  pagination: z.object({ page: z.number().int().positive(), has_next: z.boolean() }),
});
export type SourceSearchResult = z.infer<typeof sourceSearchSchema>;
export const searchResponseSchema = z.object({
  query: z.string(), sources: z.record(z.string(), sourceSearchSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export const downloadSchema = z.object({
  filename: text, type: text, size: text, download_url: text, code: z.string().nullable().optional(),
});
export type Download = z.infer<typeof downloadSchema>;
export const romRefSchema = z.object({
  code: z.string(),
  source: sourceSchema,
  label: z.string(),
  game_url: z.string(),
  file_index: z.number().int().nonnegative(),
});
export type RomRef = z.infer<typeof romRefSchema>;
export const downloadRequestSchema = z.object({
  source: sourceSchema,
  gameUrl: z.string(),
  fileIndex: z.number().int().nonnegative(),
  title: z.string(),
  icon: text,
  filename: z.string(),
  size: text,
});
export type DownloadRequest = z.infer<typeof downloadRequestSchema>;
export const downloadStatusSchema = z.enum(['queued', 'downloading', 'completed', 'cancelled', 'failed']);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;
export const downloadTaskSchema = downloadRequestSchema.extend({
  id: z.string(),
  status: downloadStatusSchema,
  receivedBytes: z.number().finite().nonnegative(),
  totalBytes: z.number().finite().nonnegative().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  destination: z.string().nullable(),
  error: z.string().nullable(),
  platform: z.enum(['desktop', 'web']),
});
export type DownloadTask = z.infer<typeof downloadTaskSchema>;
export const gameSchema = z.object({
  name: text, description: text, release_date: text, reviews_count: number,
  stars_rate: number, publisher: text, regions: z.array(z.string()).nullable(),
  icon: text, screenshots: z.array(z.string()).nullable(), downloads: z.array(downloadSchema).nullable(),
});
export type Game = z.infer<typeof gameSchema>;
export const gameResponseSchema = z.object({ source: sourceSchema, label: z.string(), game: gameSchema });
export type GameResponse = z.infer<typeof gameResponseSchema>;
export const aiDescriptionResponseSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), description: z.string().min(1), model: z.string() }),
  z.object({ available: z.literal(false), description: z.null(), model: z.string() }),
]);
export type AiDescriptionResponse = z.infer<typeof aiDescriptionResponseSchema>;
export type CatalogItem = SearchResult & { source: Source };

export const consoleCatalogSchema = z.object({
  consoles: z.array(z.object({
    name: z.string(),
    image: z.string().nullable().optional(),
    correlative_names: z.array(z.string()),
    providers: z.array(z.object({
      name: sourceSchema,
      console_name: z.string(),
      consult: z.object({
        method: z.literal('GET'), url: z.string(), params: z.record(z.string(), z.string()),
        search: z.object({ param: z.enum(['q', 'search']), url: z.string().optional(), paginated: z.boolean().optional() }).optional(),
        pagination: z.discriminatedUnion('mode', [
          z.object({ mode: z.literal('path'), url_template: z.string() }),
          z.object({ mode: z.literal('query'), page_param: z.string() }),
        ]),
      }),
    })),
  })),
});
export type ConsoleEntry = z.infer<typeof consoleCatalogSchema>['consoles'][number];
