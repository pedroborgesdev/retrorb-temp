import { Check, ChevronDown, Minus, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  computeListboxPosition,
  findEdgeEnabledIndex,
  findEnabledIndex,
  findTypeAheadIndex,
  type ListboxOption,
  type ListboxPosition,
} from '../lib/listbox';

export type { ListboxOption };

interface BaseListboxProps<T extends string> {
  options: readonly ListboxOption<T>[];
  ariaLabel?: string;
  ariaLabelledBy?: string;
  name?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  className?: string;
  placeholder?: string;
}

export interface SingleListboxProps<T extends string = string> extends BaseListboxProps<T> {
  multiple?: false;
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
}

export interface MultiListboxProps<T extends string = string> extends BaseListboxProps<T> {
  multiple: true;
  values: readonly T[];
  onChange: (values: T[]) => void;
  allLabel?: string;
  noneLabel?: string;
  showSelectAll?: boolean;
  formatSummary?: (selected: readonly ListboxOption<T>[], enabledCount: number) => string;
}

export type ListboxProps<T extends string = string> = SingleListboxProps<T> | MultiListboxProps<T>;

type MenuItem<T extends string> =
  | { kind: 'all'; label: string; disabled: boolean }
  | { kind: 'option'; option: ListboxOption<T> };

export function Listbox<T extends string = string>(props: ListboxProps<T>) {
  const {
    options,
    ariaLabel,
    ariaLabelledBy,
    name,
    disabled = false,
    icon: Icon,
    className = '',
    placeholder = '',
  } = props;
  const isMultiple = props.multiple === true;
  const allLabel = props.multiple ? (props.allLabel ?? 'Todos') : 'Todos';
  const noneLabel = props.multiple ? (props.noneLabel ?? 'Nenhum') : 'Nenhum';
  const showSelectAll = props.multiple ? (props.showSelectAll ?? true) : false;

  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeBuffer = useRef('');
  const typeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isControlledSingle = !props.multiple && props.value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    () => (!props.multiple ? props.defaultValue : undefined) ?? options[0]?.value ?? '',
  );
  const selectedValue = !props.multiple
    ? (isControlledSingle ? (props.value ?? '') : internalValue)
    : '';
  const selectedIndex = !isMultiple
    ? options.findIndex((option) => option.value === selectedValue)
    : -1;
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const selectedValues: readonly T[] = props.multiple ? props.values : [];
  const enabledOptions = options.filter((option) => !option.disabled);
  const selectedEnabledOptions = isMultiple
    ? enabledOptions.filter((option) => selectedValues.includes(option.value))
    : [];
  const allEnabledSelected =
    isMultiple && enabledOptions.length > 0 && selectedEnabledOptions.length === enabledOptions.length;
  const someEnabledSelected =
    isMultiple && selectedEnabledOptions.length > 0 && !allEnabledSelected;

  const menuItems: MenuItem<T>[] =
    isMultiple && showSelectAll
      ? [
          { kind: 'all', label: allLabel, disabled: enabledOptions.length === 0 },
          ...options.map((option) => ({ kind: 'option' as const, option })),
        ]
      : options.map((option) => ({ kind: 'option' as const, option }));

  const navOptions: ListboxOption[] = menuItems.map((item) =>
    item.kind === 'all'
      ? { value: '__all__', label: item.label, disabled: item.disabled }
      : item.option,
  );

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<ListboxPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPosition(
      computeListboxPosition(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        menuItems.length,
      ),
    );
  }, [menuItems.length]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback((preferredIndex?: number) => {
    if (disabled || !menuItems.length) return;
    const defaultCandidate = !isMultiple && selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : findEdgeEnabledIndex(navOptions, 'first');
    const candidate =
      preferredIndex !== undefined && preferredIndex >= 0 && !navOptions[preferredIndex]?.disabled
        ? preferredIndex
        : defaultCandidate;
    updatePosition();
    setActiveIndex(candidate);
    setOpen(true);
  }, [disabled, isMultiple, menuItems.length, navOptions, options, selectedIndex, updatePosition]);

  const activateItem = useCallback((item: MenuItem<T>) => {
    if (item.kind === 'all') {
      if (item.disabled || !props.multiple) return;
      const next = allEnabledSelected ? [] : enabledOptions.map((option) => option.value);
      props.onChange(next);
      return;
    }
    const { option } = item;
    if (option.disabled) return;
    if (props.multiple) {
      const set = new Set(props.values);
      if (set.has(option.value)) set.delete(option.value);
      else set.add(option.value);
      const next = options.filter((entry) => set.has(entry.value)).map((entry) => entry.value);
      props.onChange(next);
      return;
    }
    if (!isControlledSingle) setInternalValue(option.value);
    props.onChange?.(option.value);
    closeMenu(true);
  }, [allEnabledSelected, closeMenu, enabledOptions, isControlledSingle, options, props]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onResizeOrScroll = (event: Event) => {
      if (event.type === 'scroll' && event.target === menuRef.current) return;
      updatePosition();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      closeMenu(false);
    };
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [closeMenu, open, updatePosition]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  useEffect(() => () => clearTimeout(typeTimer.current), []);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(
          !isMultiple && selectedIndex >= 0
            ? selectedIndex
            : findEdgeEnabledIndex(navOptions, 'last'),
        );
        return;
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = findEnabledIndex(navOptions, activeIndex, 1);
      if (next >= 0) setActiveIndex(next);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = findEnabledIndex(navOptions, activeIndex < 0 ? navOptions.length : activeIndex, -1);
      if (prev >= 0) setActiveIndex(prev);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const first = findEdgeEnabledIndex(navOptions, 'first');
      if (first >= 0) setActiveIndex(first);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const last = findEdgeEnabledIndex(navOptions, 'last');
      if (last >= 0) setActiveIndex(last);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (activeIndex >= 0 && menuItems[activeIndex]) {
        activateItem(menuItems[activeIndex]);
      } else {
        closeMenu(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      clearTimeout(typeTimer.current);
      typeBuffer.current += event.key;
      typeTimer.current = setTimeout(() => { typeBuffer.current = ''; }, 500);
      const matched = findTypeAheadIndex(navOptions, typeBuffer.current, activeIndex);
      if (matched >= 0) setActiveIndex(matched);
    }
  }

  let triggerLabel = selectedOption?.label ?? placeholder;
  if (props.multiple) {
    if (props.formatSummary) {
      triggerLabel = props.formatSummary(selectedEnabledOptions, enabledOptions.length);
    } else if (selectedEnabledOptions.length === 0) {
      triggerLabel = noneLabel;
    } else if (allEnabledSelected) {
      triggerLabel = allLabel;
    } else if (selectedEnabledOptions.length === 1) {
      triggerLabel = selectedEnabledOptions[0].label;
    } else {
      triggerLabel = `${selectedEnabledOptions.length} selecionados`;
    }
  }

  const dataValue = isMultiple ? selectedValues.join(',') : selectedValue;

  return (
    <div className={`relative inline-flex max-w-full min-w-0 ${className}`}>
      {name && !isMultiple && <input type="hidden" name={name} value={selectedValue} />}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        data-value={dataValue}
        data-multiple={isMultiple ? 'true' : undefined}
        disabled={disabled}
        onClick={() => { if (open) closeMenu(true); else openMenu(); }}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex min-h-9 w-full max-w-full min-w-0 items-center justify-between gap-2 rounded-[10px] border bg-surface px-2.5 py-1.5 text-xs text-ink transition-all duration-150 hover:border-muted/60 hover:bg-hover/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:px-3 sm:py-2 sm:text-[13px] ${open ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && <Icon size={14} className="shrink-0 text-muted" aria-hidden="true" />}
          <span className="truncate text-left">{triggerLabel}</span>
        </span>
        {isMultiple && selectedEnabledOptions.length > 0 && !allEnabledSelected && (
          <span className="retro-pop shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-accent">
            {selectedEnabledOptions.length}
          </span>
        )}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && position && (
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-multiselectable={isMultiple || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          style={{
            top: position.top,
            left: position.left,
            minWidth: position.minWidth,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
          }}
          className={`${position.placement === 'top' ? 'retro-menu-up' : 'retro-menu-down'} fixed z-50 overflow-y-auto rounded-[12px] border border-line bg-surface p-1 text-xs text-ink shadow-xl [scrollbar-color:var(--retro-line)_transparent] sm:text-[13px]`}
        >
          {menuItems.map((item, index) => {
            const isActive = index === activeIndex;
            if (item.kind === 'all') {
              return (
                <div key="__all__">
                  <button
                    ref={(element) => { optionRefs.current[index] = element; }}
                    type="button"
                    role="option"
                    id={`${listboxId}-opt-${index}`}
                    tabIndex={-1}
                    aria-selected={allEnabledSelected}
                    disabled={item.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => { if (!item.disabled) setActiveIndex(index); }}
                    onClick={() => activateItem(item)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2 ${
                      allEnabledSelected
                        ? `${isActive ? 'bg-accent/20' : 'bg-accent/12'} font-medium text-accent`
                        : isActive
                          ? 'bg-hover text-ink'
                          : 'text-ink hover:bg-hover'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        allEnabledSelected
                          ? 'border-accent bg-accent text-on-accent'
                          : someEnabledSelected
                            ? 'border-accent bg-accent/20 text-accent'
                            : 'border-line bg-inset'
                      }`}
                    >
                      {allEnabledSelected ? (
                        <Check size={11} strokeWidth={2.75} className="retro-pop" />
                      ) : someEnabledSelected ? (
                        <Minus size={11} strokeWidth={2.75} className="retro-pop" />
                      ) : null}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                  <div role="separator" className="my-1 border-t border-line" />
                </div>
              );
            }

            const { option } = item;
            const isSelected = isMultiple
              ? selectedValues.includes(option.value)
              : option.value === selectedValue;

            return (
              <button
                key={`${option.value}:${index}`}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                id={`${listboxId}-opt-${index}`}
                tabIndex={-1}
                aria-selected={isSelected}
                disabled={option.disabled}
                data-value={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                onClick={() => activateItem(item)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2 ${
                  isSelected
                    ? `${isActive ? 'bg-accent/20' : 'bg-accent/12'} font-medium text-accent`
                    : isActive
                      ? 'bg-hover text-ink'
                      : 'text-ink hover:bg-hover'
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {isMultiple && (
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-line bg-inset'
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={2.75} className="retro-pop" />}
                    </span>
                  )}
                  <span className="truncate">{option.label}</span>
                </span>
                {!isMultiple && isSelected && (
                  <Check size={14} className="retro-pop shrink-0 text-accent" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
