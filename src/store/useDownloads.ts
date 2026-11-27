import { create } from 'zustand';
import type { DownloadTask } from '../types/contracts';
import { downloadTaskSchema } from '../types/contracts';
import { downloadsApi } from '../api/downloads';

export interface DownloadsAdapter {
  start: typeof downloadsApi.start;
  cancel: typeof downloadsApi.cancel;
  retry: typeof downloadsApi.retry;
  list: typeof downloadsApi.list;
  onChanged: typeof downloadsApi.onChanged;
}

interface DownloadState {
  tasks: DownloadTask[];
  initialized: boolean;
  initialize: () => Promise<() => void>;
  record: (task: DownloadTask) => void;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

function applyTask(tasks: DownloadTask[], task: DownloadTask) {
  const remaining = tasks.filter((current) => current.id !== task.id);
  if (task.status === 'cancelled') return remaining;
  return [task, ...remaining]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function createDownloadsStore(adapter: DownloadsAdapter) {
  return create<DownloadState>((set) => ({
    tasks: [],
    initialized: false,
    record: (task) => set((state) => ({ tasks: applyTask(state.tasks, task) })),
    initialize: async () => {
      const listed = await adapter.list();
      const tasks = listed
        .flatMap((value) => {
          const parsed = downloadTaskSchema.safeParse(value);
          return parsed.success && parsed.data.status !== 'cancelled' ? [parsed.data] : [];
        })
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      set({ tasks, initialized: true });
      const unsubscribe = adapter.onChanged((value) => {
        const parsed = downloadTaskSchema.safeParse(value);
        if (parsed.success) set((state) => ({ tasks: applyTask(state.tasks, parsed.data) }));
      });
      return unsubscribe;
    },
    cancel: async (id) => {
      await adapter.cancel(id);
      set((state) => ({ tasks: state.tasks.filter((current) => current.id !== id) }));
    },
    retry: async (id) => {
      const value = await adapter.retry(id);
      const parsed = downloadTaskSchema.safeParse(value);
      if (parsed.success) set((state) => ({ tasks: applyTask(state.tasks, parsed.data) }));
    },
  }));
}

export const useDownloads = createDownloadsStore(downloadsApi);
