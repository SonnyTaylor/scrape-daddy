import type { PaginationPayload, PaginationStatus, ExtractionResult } from '@/types';
import { extractListData } from './extract-list';
import { detectNextPageButton } from './button-detect';

let running = false;

export function stopPagination() {
  running = false;
}

export async function startPagination(payload: PaginationPayload): Promise<ExtractionResult> {
  running = true;
  const delay = payload.delay || 2000;
  const allRows: string[][] = [];
  const seenHashes = new Set<string>();

  // Extract initial page
  const initial = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
  addUniqueRows(initial.rows, allRows, seenHashes);

  sendStatus({ currentPage: 1, totalRows: allRows.length, running: true, done: false });

  // Find the next button
  let nextBtnSelector = payload.nextButtonSelector;
  if (!nextBtnSelector) {
    const detected = detectNextPageButton();
    if (!detected) {
      running = false;
      sendStatus({ currentPage: 1, totalRows: allRows.length, running: false, done: true });
      return { columns: initial.columns, rows: allRows, url: initial.url, timestamp: Date.now() };
    }
    nextBtnSelector = detected.selector;
  }

  // Paginate
  for (let page = 2; page <= payload.maxPages && running; page++) {
    const nextBtn = document.querySelector(nextBtnSelector) as HTMLElement | null;
    if (!nextBtn) break;

    // Click next and wait for DOM update
    const prevCount = document.querySelectorAll(payload.itemSelector).length;
    nextBtn.click();
    await waitForDomChange(payload.itemSelector, prevCount, delay);

    // Extract new page
    const pageResult = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
    const newCount = addUniqueRows(pageResult.rows, allRows, seenHashes);

    sendStatus({ currentPage: page, totalRows: allRows.length, running, done: false });

    // If no new rows were found, we've likely reached the end
    if (newCount === 0) break;

    await sleep(Math.max(300, delay - 1000));
  }

  running = false;
  sendStatus({ currentPage: payload.maxPages, totalRows: allRows.length, running: false, done: true });

  return { columns: initial.columns, rows: allRows, url: initial.url, timestamp: Date.now() };
}

function addUniqueRows(rows: string[][], allRows: string[][], seenHashes: Set<string>): number {
  let added = 0;
  for (const row of rows) {
    const hash = row.join('|:|');
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      allRows.push(row);
      added++;
    }
  }
  return added;
}

function waitForDomChange(itemSelector: string, prevCount: number, timeout: number): Promise<void> {
  return new Promise(resolve => {
    const start = Date.now();

    const observer = new MutationObserver(() => {
      const currentCount = document.querySelectorAll(itemSelector).length;
      if (currentCount !== prevCount) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

function sendStatus(status: PaginationStatus) {
  browser.runtime.sendMessage({ type: 'PAGINATION_STATUS', payload: status });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
