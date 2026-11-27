import { sources, sourceSchema, type Source } from '../types/contracts';

export interface ListboxOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface ListboxRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ListboxViewport {
  width: number;
  height: number;
}

export interface ListboxPosition {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

export function findEnabledIndex<T extends string>(
  options: readonly ListboxOption<T>[],
  startIndex: number,
  delta: -1 | 1,
): number {
  let index = startIndex + delta;
  while (index >= 0 && index < options.length) {
    if (!options[index].disabled) return index;
    index += delta;
  }
  return -1;
}

export function findEdgeEnabledIndex<T extends string>(
  options: readonly ListboxOption<T>[],
  edge: 'first' | 'last',
): number {
  return edge === 'first'
    ? findEnabledIndex(options, -1, 1)
    : findEnabledIndex(options, options.length, -1);
}

export function findTypeAheadIndex<T extends string>(
  options: readonly ListboxOption<T>[],
  query: string,
  fromIndex: number,
): number {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle || !options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (((fromIndex + offset) % options.length) + options.length) % options.length;
    const option = options[index];
    if (!option.disabled && option.label.toLocaleLowerCase().startsWith(needle)) {
      return index;
    }
  }
  return -1;
}

export function computeListboxPosition(
  triggerRect: ListboxRect,
  viewport: ListboxViewport,
  optionCount: number,
): ListboxPosition {
  const gap = 6;
  const margin = 8;
  const desiredMaxHeight = 288;
  const minMenuHeight = 120;
  const estimatedHeight = Math.max(44, Math.min(desiredMaxHeight, optionCount * 36 + 8));

  const spaceBelow = Math.max(0, viewport.height - triggerRect.bottom - gap - margin);
  const spaceAbove = Math.max(0, triggerRect.top - gap - margin);
  const placement: 'bottom' | 'top' =
    spaceBelow < Math.min(desiredMaxHeight, estimatedHeight) && spaceAbove > spaceBelow
      ? 'top'
      : 'bottom';

  const availableHeight = placement === 'top' ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(
    Math.min(minMenuHeight, availableHeight),
    Math.min(desiredMaxHeight, availableHeight),
  );
  const maxWidth = Math.max(120, Math.min(360, viewport.width - margin * 2));
  const minWidth = Math.min(Math.max(triggerRect.width, 0), maxWidth);
  const left = Math.max(margin, Math.min(triggerRect.left, viewport.width - minWidth - margin));
  const renderedHeight = Math.min(estimatedHeight, maxHeight);
  const top = placement === 'top'
    ? Math.max(margin, triggerRect.top - gap - renderedHeight)
    : Math.min(viewport.height - margin - renderedHeight, triggerRect.bottom + gap);

  return { top, left, minWidth, maxWidth, maxHeight, placement };
}

export function parseSourceFilter(param: string | null, enabled: readonly Source[]): Source[] {
  if (param === null || param === '') return [...enabled];
  if (param === 'none') return [];
  const requested = new Set<Source>();
  for (const token of param.split(',')) {
    const parsed = sourceSchema.safeParse(token.trim());
    if (parsed.success) requested.add(parsed.data);
  }
  if (requested.size === 0) return [...enabled];
  return sources.filter((source) => enabled.includes(source) && requested.has(source));
}

export function serializeSourceFilter(
  selected: readonly Source[],
  enabled: readonly Source[],
): string | null {
  if (enabled.length === 0) return null;
  const set = new Set(selected);
  const filtered = sources.filter((source) => enabled.includes(source) && set.has(source));
  if (filtered.length === 0) return 'none';
  if (filtered.length === enabled.length) return null;
  return filtered.join(',');
}
