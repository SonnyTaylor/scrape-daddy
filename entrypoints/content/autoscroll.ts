import type { AutoScrollStatus } from '@/types';
import { detectLoadMoreButton } from './button-detect';
import { ACCENT, Z_TOP } from './styles';
import { log } from './logger';

// Walk items one at a time, scrolling each into view. Whatever container holds
// the items (window, modal, nested scroller) reacts naturally — no container
// detection needed. Stops when content hash stops changing or maxScrolls hit.

let scrolling = false;
let progressOverlay: HTMLDivElement | null = null;

export function stopAutoScroll() {
  scrolling = false;
  removeProgressOverlay();
}

export async function startAutoScroll(
  delay: number,
  maxScrolls: number,
  itemSelector?: string,
): Promise<{ status: string; scrollCount: number }> {
  scrolling = true;
  let scrollCount = 0;
  let stale = 0;

  log.group('startAutoScroll');
  log.info('config:', { delay, maxScrolls, itemSelector });

  createProgressOverlay();

  // Use scroll-by-rows when we have an item selector; otherwise scroll the window.
  if (!itemSelector) {
    scrollCount = await scrollWindowLoop(delay, maxScrolls);
  } else {
    scrollCount = await scrollByRowsLoop(itemSelector, delay, maxScrolls);
  }

  log.info('auto-scroll done', { scrollCount });
  log.groupEnd();
  scrolling = false;
  removeProgressOverlay();
  return { status: 'complete', scrollCount };

  // ---- inner loops share closure state ----

  async function scrollWindowLoop(delayMs: number, max: number): Promise<number> {
    let last = document.documentElement.scrollHeight;
    let count = 0;

    while (scrolling && count < max) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await sleep(delayMs);

      const next = document.documentElement.scrollHeight;
      if (next === last) {
        stale++;
        if (stale >= 2 && !tryLoadMoreClick()) break;
        await sleep(delayMs);
      } else {
        stale = 0;
      }
      last = next;
      count++;
      emitProgress(count, max, next);
    }
    return count;
  }

  async function scrollByRowsLoop(selector: string, delayMs: number, max: number): Promise<number> {
    let lastCount = document.querySelectorAll(selector).length;
    let lastHash = hashItems(selector, lastCount);
    let count = 0;

    while (scrolling && count < max) {
      const items = Array.from(document.querySelectorAll(selector));
      if (items.length === 0) break;

      // Scroll the last visible item into view — forces the nearest scrollable
      // ancestor to scroll, works for window/modal/nested containers identically.
      const target = items[items.length - 1];
      target.scrollIntoView({ block: 'end', behavior: 'auto' });
      await sleep(delayMs);

      const newCount = document.querySelectorAll(selector).length;
      const newHash = hashItems(selector, newCount);

      if (newCount === lastCount && newHash === lastHash) {
        stale++;
        if (stale >= 2 && !tryLoadMoreClick()) break;
        await sleep(delayMs);
      } else {
        stale = 0;
      }
      lastCount = newCount;
      lastHash = newHash;
      count++;
      emitProgress(count, max, newCount);
    }
    return count;
  }

  function tryLoadMoreClick(): boolean {
    const detected = detectLoadMoreButton();
    if (!detected) return false;
    const btn = document.querySelector(detected.selector) as HTMLElement | null;
    if (!btn) return false;
    log.info('clicking load-more:', detected.text);
    btn.click();
    stale = 0;
    return true;
  }

  function emitProgress(count: number, max: number, height: number) {
    updateProgressOverlay(count, max);
    const status: AutoScrollStatus = { scrollCount: count, scrolling, height };
    browser.runtime.sendMessage({ type: 'AUTOSCROLL_STATUS', payload: status });
  }
}

// Cheap content hash — sample first 10 + last 10 items' text+bbox. Catches
// DOM changes even when count stays the same (virtualized lists).
function hashItems(selector: string, count: number): number {
  const items = document.querySelectorAll(selector);
  if (count === 0) return 0;
  const sample: number[] = [];
  const take = 10;
  for (let i = 0; i < Math.min(take, count); i++) sample.push(i);
  if (count > take) {
    for (let i = Math.max(take, count - take); i < count; i++) sample.push(i);
  }
  let acc = 0;
  for (const i of sample) {
    const el = items[i] as HTMLElement | undefined;
    if (!el) continue;
    const text = (el.innerText || '').slice(0, 60);
    const r = el.getBoundingClientRect();
    const key = `${text}|${Math.round(r.top)}|${Math.round(r.height)}`;
    for (let j = 0; j < key.length; j++) {
      acc = (acc << 5) - acc + key.charCodeAt(j);
      acc |= 0;
    }
  }
  return acc;
}

// ============ PROGRESS OVERLAY ============

function createProgressOverlay() {
  removeProgressOverlay();
  const el = document.createElement('div');
  el.id = 'scrape-daddy-scroll-progress';
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: Z_TOP,
    background: '#1c1917',
    border: `2px solid ${ACCENT}`,
    borderRadius: '12px',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: '13px',
    color: '#e7e5e4',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    pointerEvents: 'none',
  });

  el.innerHTML = `
    <div style="width:18px;height:18px;border:2px solid ${ACCENT};border-top-color:transparent;border-radius:50%;animation:scrape-daddy-spin 0.8s linear infinite"></div>
    <span id="scrape-daddy-scroll-text">Scrolling...</span>
    <div style="width:80px;height:4px;background:rgba(245,158,11,0.2);border-radius:2px;overflow:hidden">
      <div id="scrape-daddy-scroll-bar" style="width:0%;height:100%;background:${ACCENT};border-radius:2px;transition:width 0.3s ease"></div>
    </div>
  `;

  if (!document.getElementById('scrape-daddy-scroll-anim')) {
    const style = document.createElement('style');
    style.id = 'scrape-daddy-scroll-anim';
    style.textContent = `@keyframes scrape-daddy-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(el);
  progressOverlay = el;
}

function updateProgressOverlay(count: number, max: number) {
  if (!progressOverlay) return;
  const text = progressOverlay.querySelector('#scrape-daddy-scroll-text');
  const bar = progressOverlay.querySelector('#scrape-daddy-scroll-bar') as HTMLElement | null;
  if (text) text.textContent = `Scrolling... (${count}/${max})`;
  if (bar) bar.style.width = `${Math.min(100, (count / max) * 100)}%`;
}

function removeProgressOverlay() {
  progressOverlay?.remove();
  progressOverlay = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
