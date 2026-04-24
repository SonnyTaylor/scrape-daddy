import type { AutoScrollStatus } from '@/types';
import { detectLoadMoreButton } from './button-detect';
import { ACCENT, ACCENT_DARK, Z_TOP } from './styles';
import { log } from './logger';

let scrolling = false;
let progressOverlay: HTMLDivElement | null = null;

export function stopAutoScroll() {
  scrolling = false;
  removeProgressOverlay();
}

/**
 * Find the scrollable ancestor of the list items.
 * Sites like Instagram scroll inside a modal div, not the window.
 */
function findScrollableContainer(itemSelector?: string): Element | null {
  if (!itemSelector) return null;

  const firstItem = document.querySelector(itemSelector);
  if (!firstItem) return null;

  let el: Element | null = firstItem.parentElement;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
    if (isScrollable && el.scrollHeight > el.clientHeight) {
      // Verify this container actually contains the list items
      const itemsInside = el.querySelectorAll(itemSelector!);
      if (itemsInside.length > 0) {
        log.info('found scrollable container:', {
          tag: el.tagName,
          id: el.id,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowY,
          itemsInside: itemsInside.length,
        });
        return el;
      }
      log.info('scrollable element found but contains no items, skipping');
    }
    el = el.parentElement;
  }
  return null;
}

export async function startAutoScroll(delay: number, maxScrolls: number, itemSelector?: string): Promise<{ status: string; scrollCount: number }> {
  scrolling = true;
  let scrollCount = 0;

  log.group('startAutoScroll');
  log.info('config:', { delay, maxScrolls, itemSelector });

  // Try to find a scrollable container (for modals, dialogs, etc.)
  const container = findScrollableContainer(itemSelector);
  const useContainer = container !== null;

  if (useContainer) {
    log.info('scrolling CONTAINER element (not window)');
  } else {
    log.info('scrolling WINDOW (no scrollable container found)');
  }

  const getScrollHeight = () => useContainer ? container!.scrollHeight : document.documentElement.scrollHeight;
  const getClientHeight = () => useContainer ? container!.clientHeight : window.innerHeight;
  const doScroll = () => {
    if (useContainer) {
      container!.scrollTop = container!.scrollHeight;
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  };

  let lastHeight = getScrollHeight();
  let lastItemCount = itemSelector ? document.querySelectorAll(itemSelector).length : 0;
  log.info('initial scrollHeight:', lastHeight, 'clientHeight:', getClientHeight(), 'items:', lastItemCount);

  createProgressOverlay();

  let staleCount = 0; // Track consecutive scrolls with no change

  while (scrolling && scrollCount < maxScrolls) {
    doScroll();
    await sleep(delay);

    const newHeight = getScrollHeight();
    const newItemCount = itemSelector ? document.querySelectorAll(itemSelector).length : 0;
    log.info(`scroll ${scrollCount + 1}: height ${lastHeight} -> ${newHeight}, items ${lastItemCount} -> ${newItemCount}`);

    const heightChanged = newHeight !== lastHeight;
    const itemsChanged = newItemCount !== lastItemCount;

    if (!heightChanged && !itemsChanged) {
      staleCount++;
      if (staleCount >= 2) {
        // Two consecutive stale scrolls — try load-more button
        log.info('content stale, looking for load-more button...');
        const detected = detectLoadMoreButton();
        if (!detected) {
          log.info('no load-more button found, stopping');
          break;
        }
        log.info('clicking load-more button:', detected.selector, detected.text);
        const btn = document.querySelector(detected.selector) as HTMLElement | null;
        if (!btn) {
          log.warn('load-more button selector matched nothing');
          break;
        }
        btn.click();
        await sleep(delay);
        staleCount = 0;
      }
    } else {
      staleCount = 0;
    }

    lastHeight = getScrollHeight();
    lastItemCount = itemSelector ? document.querySelectorAll(itemSelector).length : lastItemCount;
    scrollCount++;

    updateProgressOverlay(scrollCount, maxScrolls);

    const status: AutoScrollStatus = { scrollCount, scrolling, height: newHeight };
    browser.runtime.sendMessage({ type: 'AUTOSCROLL_STATUS', payload: status });
  }

  log.info('auto-scroll complete:', { scrollCount, reason: !scrolling ? 'stopped' : scrollCount >= maxScrolls ? 'maxScrolls' : 'no new content' });
  log.groupEnd();

  scrolling = false;
  removeProgressOverlay();
  return { status: 'complete', scrollCount };
}

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

  // Add spin animation if not already present
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
