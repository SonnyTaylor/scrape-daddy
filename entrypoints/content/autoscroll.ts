import type { AutoScrollStatus } from '@/types';
import { detectLoadMoreButton } from './button-detect';
import { sleep, simulateClick, hashItems, isElementVisible, isElementDisabled } from './dom-utils';
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
): Promise<{ status: string; scrollCount: number; itemCount: number }> {
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

  const itemCount = itemSelector ? document.querySelectorAll(itemSelector).length : 0;
  log.info('auto-scroll done', { scrollCount, itemCount });
  log.groupEnd();
  scrolling = false;
  removeProgressOverlay();
  return { status: 'complete', scrollCount, itemCount };

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
        if (stale >= 2 && !tryLoadMoreClick(undefined)) break;
        await sleep(delayMs);
      } else {
        stale = 0;
      }
      last = next;
      count++;
      emitProgress(count, max, next, 0);
    }
    return count;
  }

  async function scrollByRowsLoop(selector: string, delayMs: number, max: number): Promise<number> {
    let lastCount = document.querySelectorAll(selector).length;
    let lastHash = hashItems(selector);
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
      const newHash = hashItems(selector);

      if (newCount === lastCount && newHash === lastHash) {
        stale++;
        if (stale >= 2 && !tryLoadMoreClick(selector)) break;
        await sleep(delayMs);
      } else {
        stale = 0;
      }
      lastCount = newCount;
      lastHash = newHash;
      count++;
      emitProgress(count, max, document.documentElement.scrollHeight, newCount);
    }
    return count;
  }

  // Infinite-scroll pages frequently switch to a "Load more" button after N
  // batches — click through it so scrolling can continue.
  function tryLoadMoreClick(selector: string | undefined): boolean {
    const detected = detectLoadMoreButton(selector);
    if (!detected) return false;
    const btn = document.querySelector(detected.selector) as HTMLElement | null;
    if (!btn || !isElementVisible(btn) || isElementDisabled(btn)) return false;
    log.info('clicking load-more:', detected.text);
    btn.scrollIntoView({ block: 'center', behavior: 'auto' });
    simulateClick(btn);
    stale = 0;
    return true;
  }

  function emitProgress(count: number, max: number, height: number, itemCount: number) {
    updateProgressOverlay(count, max, itemCount);
    const status: AutoScrollStatus = { scrollCount: count, scrolling, height, itemCount };
    browser.runtime.sendMessage({ type: 'AUTOSCROLL_STATUS', payload: status }).catch(() => {});
  }
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

function updateProgressOverlay(count: number, max: number, itemCount: number) {
  if (!progressOverlay) return;
  const text = progressOverlay.querySelector('#scrape-daddy-scroll-text');
  const bar = progressOverlay.querySelector('#scrape-daddy-scroll-bar') as HTMLElement | null;
  if (text) {
    text.textContent = itemCount > 0
      ? `${itemCount} items · scroll ${count}/${max}`
      : `Scrolling... (${count}/${max})`;
  }
  if (bar) bar.style.width = `${Math.min(100, (count / max) * 100)}%`;
}

function removeProgressOverlay() {
  progressOverlay?.remove();
  progressOverlay = null;
}
