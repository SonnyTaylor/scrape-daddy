import type { LoadMorePayload, LoadMoreStatus, ExtractionResult } from '@/types';
import { extractListData } from './extract-list';
import { detectLoadMoreButton } from './button-detect';
import { sleep, simulateClick, hashItems, waitForItemChange, isElementVisible, isElementDisabled } from './dom-utils';
import { log } from './logger';

let running = false;

export function stopLoadMore() {
  running = false;
}

export async function startLoadMore(payload: LoadMorePayload): Promise<ExtractionResult> {
  running = true;
  const delay = payload.delay || 2000;
  let clicks = 0;
  let staleRounds = 0;

  log.group('startLoadMore');

  while (running && clicks < payload.maxClicks) {
    const btn = resolveButton(payload);
    if (!btn) {
      // Button may be below the fold or lazily rendered — scroll down once
      // to coax it out before giving up.
      if (staleRounds === 0) {
        staleRounds++;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
        await sleep(Math.max(600, delay / 2));
        continue;
      }
      log.info('no load-more button available, stopping');
      break;
    }
    staleRounds = 0;

    const prevCount = document.querySelectorAll(payload.itemSelector).length;
    const prevHash = hashItems(payload.itemSelector);

    // Many sites attach lazy/intersection handlers — the button must actually
    // be in view for the click to work.
    btn.scrollIntoView({ block: 'center', behavior: 'auto' });
    await sleep(150);
    simulateClick(btn);
    clicks++;

    const changed = await waitForItemChange(payload.itemSelector, prevCount, prevHash, Math.max(delay, 4000));
    const currentCount = document.querySelectorAll(payload.itemSelector).length;
    sendStatus({ clicks, totalRows: currentCount, running, done: false });
    log.info(`click ${clicks}: ${prevCount} → ${currentCount} items (changed=${changed})`);

    if (!changed && currentCount <= prevCount) {
      // One slow-network grace round before quitting.
      await sleep(delay);
      const retryCount = document.querySelectorAll(payload.itemSelector).length;
      if (retryCount <= prevCount) {
        log.info('no new items after grace period, stopping');
        break;
      }
    }

    await sleep(Math.max(300, delay - 1500));
  }

  running = false;

  // Final extraction with all loaded items
  const result = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
  sendStatus({ clicks, totalRows: result.rows.length, running: false, done: true });
  log.info('load-more done', { clicks, rows: result.rows.length });
  log.groupEnd();

  return result;
}

/**
 * Resolve the load-more button fresh each round: sites re-render the button
 * after every batch, so a selector captured before the first click routinely
 * goes stale. Visibility uses rect+computed-style — the old offsetParent
 * check was null for position:fixed/sticky buttons and killed the loop at
 * zero clicks.
 */
function resolveButton(payload: LoadMorePayload): HTMLElement | null {
  if (payload.loadMoreSelector) {
    const el = document.querySelector(payload.loadMoreSelector) as HTMLElement | null;
    if (el && isElementVisible(el) && !isElementDisabled(el)) return el;
  }
  const detected = detectLoadMoreButton(payload.itemSelector);
  if (detected) {
    const el = document.querySelector(detected.selector) as HTMLElement | null;
    if (el && isElementVisible(el) && !isElementDisabled(el)) return el;
  }
  return null;
}

function sendStatus(status: LoadMoreStatus) {
  browser.runtime.sendMessage({ type: 'LOAD_MORE_STATUS', payload: status }).catch(() => {});
}
