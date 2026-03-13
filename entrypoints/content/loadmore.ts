import type { LoadMorePayload, LoadMoreStatus, ExtractionResult } from '@/types';
import { extractListData } from './extract-list';
import { detectLoadMoreButton } from './button-detect';

let running = false;

export function stopLoadMore() {
  running = false;
}

export async function startLoadMore(payload: LoadMorePayload): Promise<ExtractionResult> {
  running = true;
  const delay = payload.delay || 2000;

  // Find the load-more button
  let btnSelector = payload.loadMoreSelector;
  if (!btnSelector) {
    const detected = detectLoadMoreButton();
    if (!detected) {
      running = false;
      sendStatus({ clicks: 0, totalRows: 0, running: false, done: true });
      const result = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
      return result;
    }
    btnSelector = detected.selector;
  }

  let lastItemCount = document.querySelectorAll(payload.itemSelector).length;

  // Click loop
  for (let click = 1; click <= payload.maxClicks && running; click++) {
    const btn = document.querySelector(btnSelector) as HTMLElement | null;
    if (!btn || btn.offsetParent === null) break;

    btn.click();
    await waitForNewItems(payload.itemSelector, lastItemCount, delay);

    const currentCount = document.querySelectorAll(payload.itemSelector).length;
    sendStatus({ clicks: click, totalRows: currentCount, running, done: false });

    // If no new items appeared, stop
    if (currentCount <= lastItemCount) break;
    lastItemCount = currentCount;

    await sleep(Math.max(300, delay - 1000));
  }

  running = false;

  // Final extraction with all loaded items
  const result = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
  sendStatus({ clicks: payload.maxClicks, totalRows: result.rows.length, running: false, done: true });

  return result;
}

function waitForNewItems(itemSelector: string, prevCount: number, timeout: number): Promise<void> {
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const currentCount = document.querySelectorAll(itemSelector).length;
      if (currentCount > prevCount) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

function sendStatus(status: LoadMoreStatus) {
  browser.runtime.sendMessage({ type: 'LOAD_MORE_STATUS', payload: status });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
