import type { PaginationPayload, PaginationStatus, ExtractionResult } from '@/types';
import { extractListData } from './extract-list';
import { detectNextPageButton, findNextHrefInDocument, linkHref } from './button-detect';
import { sleep, simulateClick, hashItems, waitForItemChange, isElementVisible, isElementDisabled } from './dom-utils';
import { log } from './logger';

let running = false;

export function stopPagination() {
  running = false;
}

export async function startPagination(payload: PaginationPayload): Promise<ExtractionResult> {
  running = true;
  const delay = payload.delay || 2000;
  const allRows: string[][] = [];
  const seenHashes = new Set<string>();

  log.group('startPagination');

  // Extract initial page
  const initial = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
  addUniqueRows(initial.rows, allRows, seenHashes);
  sendStatus({ currentPage: 1, totalRows: allRows.length, running: true, done: false });

  // Decide mode: a next control that is a real link means the site paginates
  // by navigation. Clicking it would destroy this content script mid-run, so
  // fetch+parse the pages instead — this is also what lets us walk ALL pages
  // rather than dying after page 2. A manually picked button always wins
  // over detection.
  let firstHref: string | null = null;
  if (payload.nextButtonManual && payload.nextButtonSelector) {
    const el = document.querySelector(payload.nextButtonSelector) as HTMLElement | null;
    firstHref = el ? linkHref(el) : null;
    log.info('manual next control:', payload.nextButtonSelector, 'href:', firstHref);
  } else {
    const detected = detectNextPageButton(payload.itemSelector);
    firstHref = detected?.href || null;
    log.info('initial next control:', detected);
  }

  let lastPage = 1;
  if (firstHref) {
    const fetched = await fetchPages(firstHref, payload, allRows, seenHashes, delay);
    lastPage = fetched.page;
    // Client-side-rendered sites serve a next link but empty HTML — the items
    // only exist after JS runs. Fall back to clicking (the framework
    // intercepts link clicks, so it swaps content in place).
    if (!fetched.gotRows && running) {
      log.info('fetch mode yielded no rows — falling back to click mode');
      lastPage = await clickPages(payload, allRows, seenHashes, delay);
    }
  } else {
    lastPage = await clickPages(payload, allRows, seenHashes, delay);
  }

  running = false;
  sendStatus({ currentPage: lastPage, totalRows: allRows.length, running: false, done: true });
  log.info('pagination done', { pages: lastPage, rows: allRows.length });
  log.groupEnd();

  return { columns: initial.columns, rows: allRows, url: initial.url, timestamp: Date.now() };
}

// ============ FETCH MODE ============
// Follow the next-link chain with fetch() + DOMParser. Never navigates, so
// it works for classic server-rendered pagination across any number of pages.

async function fetchPages(
  firstHref: string,
  payload: PaginationPayload,
  allRows: string[][],
  seenHashes: Set<string>,
  delay: number,
): Promise<{ page: number; gotRows: boolean }> {
  const visited = new Set<string>([window.location.href.split('#')[0]]);
  let nextUrl: string | null = firstHref;
  let page = 1;
  let gotRows = false;

  while (nextUrl && running && page < payload.maxPages) {
    const clean = nextUrl.split('#')[0];
    if (visited.has(clean)) {
      log.info('fetch mode: URL already visited, stopping', clean);
      break;
    }
    visited.add(clean);
    page++;

    log.info(`fetch mode: page ${page}`, nextUrl);
    let doc: Document;
    try {
      const res = await fetch(nextUrl, { credentials: 'include' });
      if (!res.ok) {
        log.warn('fetch failed', res.status);
        break;
      }
      const html = await res.text();
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (err) {
      log.warn('fetch error', err);
      break;
    }

    const pageResult = extractListData(
      { itemSelector: payload.itemSelector, columns: payload.columns },
      doc,
      nextUrl,
    );
    const added = addUniqueRows(pageResult.rows, allRows, seenHashes);
    sendStatus({ currentPage: page, totalRows: allRows.length, running, done: false, mode: 'fetch' });

    if (pageResult.rows.length === 0) {
      log.info('fetch mode: page had no items, stopping');
      break;
    }
    gotRows = true;
    if (added === 0) {
      log.info('fetch mode: no new rows, stopping');
      break;
    }

    nextUrl = findNextHrefInDocument(doc, nextUrl);
    if (nextUrl) await sleep(Math.max(300, delay / 2));
  }
  return { page, gotRows };
}

// ============ CLICK MODE ============
// SPA pagination: the next control is a button that swaps items in place.
// The button is RE-DETECTED every page — pagination UIs re-render and a
// cached positional selector drifts onto the wrong control.

async function clickPages(
  payload: PaginationPayload,
  allRows: string[][],
  seenHashes: Set<string>,
  delay: number,
): Promise<number> {
  let page = 1;
  let staleRounds = 0;

  while (running && page < payload.maxPages) {
    const btn = resolveNextButton(payload);
    if (!btn) {
      log.info('click mode: no next button found, stopping');
      break;
    }

    const prevCount = document.querySelectorAll(payload.itemSelector).length;
    const prevHash = hashItems(payload.itemSelector);

    btn.scrollIntoView({ block: 'center', behavior: 'auto' });
    await sleep(150);
    simulateClick(btn);

    // Content-hash change, not count change — page 2 usually has the SAME
    // number of items as page 1.
    const changed = await waitForItemChange(payload.itemSelector, prevCount, prevHash, Math.max(delay, 3000));

    if (!changed) {
      staleRounds++;
      log.info(`click mode: no change after click (attempt ${staleRounds})`);
      if (staleRounds >= 2) break;
      continue;
    }
    staleRounds = 0;
    page++;

    const pageResult = extractListData({ itemSelector: payload.itemSelector, columns: payload.columns });
    const added = addUniqueRows(pageResult.rows, allRows, seenHashes);
    sendStatus({ currentPage: page, totalRows: allRows.length, running, done: false, mode: 'click' });

    if (added === 0) {
      log.info('click mode: no new rows, stopping');
      break;
    }

    await sleep(Math.max(300, delay - 1000));
  }
  return page;
}

function resolveNextButton(payload: PaginationPayload): HTMLElement | null {
  const bySelector = () => {
    if (!payload.nextButtonSelector) return null;
    const el = document.querySelector(payload.nextButtonSelector) as HTMLElement | null;
    return el && isElementVisible(el) && !isElementDisabled(el) ? el : null;
  };
  const byDetection = () => {
    const detected = detectNextPageButton(payload.itemSelector);
    if (!detected) return null;
    const el = document.querySelector(detected.selector) as HTMLElement | null;
    return el && isElementVisible(el) && !isElementDisabled(el) ? el : null;
  };
  // A hand-picked button is user intent — trust it first. Auto-detected
  // configure-time selectors drift, so fresh detection wins there.
  return payload.nextButtonManual
    ? (bySelector() || byDetection())
    : (byDetection() || bySelector());
}

// ============ SHARED ============

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

function sendStatus(status: PaginationStatus) {
  browser.runtime.sendMessage({ type: 'PAGINATION_STATUS', payload: status }).catch(() => {});
}
