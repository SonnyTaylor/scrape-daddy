import type { DetectedButton } from '@/types';
import { generateButtonSelector, buttonText, linkHref } from './button-detect';
import { ACCENT, Z_TOP } from './styles';

// Manual button picker: the user clicks the actual load-more / next-page
// control on the page. The click is intercepted (capture phase) so it never
// reaches the page, and the element becomes the strategy's button — no
// auto-detection guesswork.

const CLICKABLE = 'button, a, [role="button"], input[type="button"], input[type="submit"], summary';

let active = false;
let overlay: HTMLDivElement | null = null;
let tooltip: HTMLDivElement | null = null;

export function startButtonPicker() {
  stopButtonPicker();
  active = true;
  createOverlays();
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  document.body.style.cursor = 'crosshair';
}

export function stopButtonPicker() {
  active = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKey, true);
  document.body.style.cursor = '';
  overlay?.remove();
  overlay = null;
  tooltip?.remove();
  tooltip = null;
}

// Snap to the closest clickable ancestor so clicking the <span> inside a
// button still selects the button. Divs with click handlers stay selectable
// as a fallback — plenty of sites fake their buttons.
function clickableFromTarget(target: Element | null): HTMLElement | null {
  let cur: Element | null = target;
  let depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    if ((cur as HTMLElement).matches?.(CLICKABLE)) return cur as HTMLElement;
    cur = cur.parentElement;
    depth++;
  }
  return null;
}

function isOwnOverlay(el: Element): boolean {
  return el === overlay || el === tooltip;
}

function onMove(e: MouseEvent) {
  if (!active || !overlay || !tooltip) return;
  const target = e.target as Element;
  if (isOwnOverlay(target)) return;

  const el = clickableFromTarget(target) || (target as HTMLElement);
  const rect = el.getBoundingClientRect();
  Object.assign(overlay.style, {
    display: 'block',
    top: rect.top - 3 + 'px',
    left: rect.left - 3 + 'px',
    width: rect.width + 6 + 'px',
    height: rect.height + 6 + 'px',
  });

  const isButton = !!clickableFromTarget(target);
  const label = buttonText(el).slice(0, 40) || el.tagName.toLowerCase();
  tooltip.textContent = isButton
    ? `Use "${label}" as the button`
    : `Not a button — click to use "${label}" anyway`;

  let top = rect.top - 40;
  if (top < 8) top = rect.bottom + 10;
  let left = rect.left;
  const tw = tooltip.offsetWidth || 240;
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
  Object.assign(tooltip.style, { display: 'block', top: top + 'px', left: Math.max(8, left) + 'px' });
}

function onClick(e: MouseEvent) {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const target = e.target as Element;
  if (isOwnOverlay(target)) return;

  const el = clickableFromTarget(target) || (target as HTMLElement);
  const detected: DetectedButton = {
    selector: generateButtonSelector(el),
    text: buttonText(el) || el.tagName.toLowerCase(),
    href: linkHref(el) || undefined,
  };
  stopButtonPicker();
  browser.runtime.sendMessage({ type: 'BUTTON_SELECTED', payload: detected }).catch(() => {});
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopButtonPicker();
    browser.runtime.sendMessage({ type: 'BUTTON_PICKER_CANCELLED' }).catch(() => {});
  }
}

function createOverlays() {
  overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: Z_TOP,
    border: `2px solid ${ACCENT}`,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: '6px',
    display: 'none',
    transition: 'all 0.08s ease',
  });
  document.body.appendChild(overlay);

  tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: Z_TOP,
    backgroundColor: ACCENT,
    color: '#000',
    fontSize: '13px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: '600',
    padding: '6px 12px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    display: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  });
  document.body.appendChild(tooltip);
}
