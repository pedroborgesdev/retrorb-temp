import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spatialTarget, type Direction } from '../lib/spatialNavigation';

const focusable = 'a[href],button,input,select,textarea,summary,[tabindex="0"]';
const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const isEditing = (element: Element | null) => Boolean(element?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="slider"]'));

function scope(): Element {
  return document.querySelector('dialog[open]') ?? document.body;
}

function controls(root = scope()): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusable)].filter((element) => {
    const rect = element.getBoundingClientRect();
    return element.tabIndex >= 0 && !element.matches(':disabled,[aria-disabled="true"]') && !element.closest('[inert],[hidden]')
      && rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  });
}

function focus(element: HTMLElement | undefined) {
  document.querySelectorAll('[data-console-focused]').forEach((item) => item.removeAttribute('data-console-focused'));
  element?.setAttribute('data-console-focused', '');
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}

function move(direction: Direction) {
  const active = document.activeElement as HTMLElement | null;
  const items = controls();
  if (!active || !items.includes(active)) {
    focus(items.find((item) => item.closest('main')) ?? items[0]);
    return;
  }
  const candidates = items.filter((item) => item !== active);
  const target = spatialTarget(active.getBoundingClientRect(), candidates.map((item) => item.getBoundingClientRect()), direction);
  if (target >= 0) focus(candidates[target]);
}

function switchTab(delta: number) {
  const root = document.activeElement?.closest('[data-console-tabs]') ?? scope().querySelector('[data-console-tabs]');
  if (!root) return;
  const tabs = controls(root).filter((item) => item.hasAttribute('data-console-tab'));
  if (!tabs.length) return;
  const selected = tabs.findIndex((item) => item.getAttribute('aria-pressed') === 'true' || item.getAttribute('aria-selected') === 'true');
  const next = tabs[(Math.max(selected, 0) + delta + tabs.length) % tabs.length];
  next.click();
  focus(next);
}

/** Only UI focus/navigation. Never reads or changes catalog data or preferences. */
export function ConsoleNavigation() {
  const navigate = useNavigate();
  const [usingGamepad, setUsingGamepad] = useState(false);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    let frame = 0;
    let lastDirection = '';
    let repeatAt = 0;
    let previousButtons: boolean[] = [];
    let previousPad = '';
    let editingSelect: HTMLSelectElement | null = null;
    const endSelection = () => { editingSelect = null; setSelecting(false); };
    const back = () => {
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (dialog) dialog.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')?.click();
      else navigate(-1);
    };
    const keyboard = (event: KeyboardEvent) => {
      setUsingGamepad(false);
      endSelection();
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditing(event.target as Element)) return;
      if (event.key === 'Escape') {
        if (!document.querySelector('dialog[open]')) { event.preventDefault(); back(); }
        return;
      }
      // The existing lightbox owns its left/right keys; native controls own theirs.
      if (document.querySelector('dialog[open] [data-console-gallery]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const direction = directions[event.key];
      if (direction) { event.preventDefault(); move(direction); }
    };
    const mouse = () => { setUsingGamepad(false); endSelection(); document.querySelectorAll('[data-console-focused]').forEach((item) => item.removeAttribute('data-console-focused')); };
    const focusChanged = (event: FocusEvent) => {
      document.querySelectorAll('[data-console-focused]').forEach(item => { if (item !== event.target) item.removeAttribute('data-console-focused'); });
    };
    const disconnected = () => { previousButtons = []; lastDirection = ''; endSelection(); setUsingGamepad(false); };
    const poll = (now: number) => {
      if (!document.hidden) {
        let pads: (Gamepad | null)[] = [];
        try { pads = [...(navigator.getGamepads?.() ?? [])]; } catch { /* Browser policy may disable Gamepad API. */ }
        // Unknown mappings retain keyboard/mouse support, with no guessed buttons.
        const pad = pads.find((item) => item?.connected && item.mapping === 'standard');
        if (pad) {
          const identity = `${pad.index}:${pad.id}`;
          if (previousPad !== identity) { previousPad = identity; previousButtons = []; lastDirection = ''; }
          const buttons = pad.buttons.map((button) => button.pressed);
          const pressed = (index: number) => buttons[index] && !previousButtons[index];
          const x = pad.axes[0] ?? 0;
          const y = pad.axes[1] ?? 0;
          const key = buttons[14] ? 'ArrowLeft' : buttons[15] ? 'ArrowRight' : buttons[12] ? 'ArrowUp' : buttons[13] ? 'ArrowDown'
            : Math.max(Math.abs(x), Math.abs(y)) < 0.55 ? '' : Math.abs(x) > Math.abs(y) ? (x < 0 ? 'ArrowLeft' : 'ArrowRight') : (y < 0 ? 'ArrowUp' : 'ArrowDown');
          if (key && (key !== lastDirection || now >= repeatAt)) {
            if (editingSelect && document.activeElement === editingSelect && editingSelect.isConnected) {
              if (key === 'ArrowUp' || key === 'ArrowDown') {
                const options = [...editingSelect.options];
                const delta = key === 'ArrowDown' ? 1 : -1;
                let index = editingSelect.selectedIndex + delta;
                while (index >= 0 && index < options.length && options[index].disabled) index += delta;
                if (index >= 0 && index < options.length) {
                  editingSelect.selectedIndex = index;
                  editingSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            } else {
              endSelection();
              if (document.querySelector('dialog[open] [data-console-gallery]') && ['ArrowLeft', 'ArrowRight'].includes(key)) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
              } else move(directions[key]);
            }
            setUsingGamepad(true);
            repeatAt = now + (key === lastDirection ? 150 : 350);
          }
          lastDirection = key;
          if (pressed(0)) {
            if (editingSelect) endSelection();
            else if (document.activeElement instanceof HTMLSelectElement) { editingSelect = document.activeElement; setSelecting(true); }
            else if (!(document.activeElement instanceof HTMLElement) || !controls().includes(document.activeElement)) move('down');
            else document.activeElement.click();
            setUsingGamepad(true);
          }
          if (pressed(1)) { if (editingSelect) endSelection(); else back(); setUsingGamepad(true); }
          if (!editingSelect) {
            if (pressed(4)) { switchTab(-1); setUsingGamepad(true); }
            if (pressed(5)) { switchTab(1); setUsingGamepad(true); }
            if (pressed(9) && !document.querySelector('dialog[open]')) {
              const menu = document.querySelector<HTMLElement>('[data-console-menu]');
              if (menu && menu.getBoundingClientRect().width > 0) menu.click();
              focus(document.querySelector<HTMLElement>('nav[aria-label="Navegação principal"] a') ?? undefined);
              setUsingGamepad(true);
            }
          }
          previousButtons = buttons;
        } else { previousPad = ''; previousButtons = []; lastDirection = ''; }
      }
      frame = requestAnimationFrame(poll);
    };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('pointerdown', mouse);
    window.addEventListener('pointermove', mouse);
    window.addEventListener('gamepaddisconnected', disconnected);
    window.addEventListener('focusin', focusChanged);
    if (typeof navigator.getGamepads === 'function') frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('pointerdown', mouse);
      window.removeEventListener('pointermove', mouse);
      window.removeEventListener('gamepaddisconnected', disconnected);
      window.removeEventListener('focusin', focusChanged);
    };
  }, [navigate]);
  return usingGamepad ? <div aria-label="Comandos do controle" className="pointer-events-none fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 gap-4 whitespace-nowrap rounded-full border border-line bg-sidebar px-4 py-2 text-[11px] text-muted shadow-lg"><span><b className="mr-1 text-accent">A</b>{selecting ? 'Confirmar' : 'Selecionar'}</span><span><b className="mr-1 text-ink">B</b>{selecting ? 'Fechar seleção' : 'Voltar'}</span><span className="hidden sm:inline">{selecting ? '↑ / ↓ · Opções' : 'LB / RB · Abas'}</span></div> : null;
}
