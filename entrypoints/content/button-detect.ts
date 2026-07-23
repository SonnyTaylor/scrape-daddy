import type { DetectedButton } from '@/types';
import { isUtilClass } from './selectors';
import { isElementVisible, isElementDisabled } from './dom-utils';
import { log } from './logger';

// Scored button detection. The old version returned the FIRST element whose
// text started with a pattern — which happily matched "Next" in a nav menu,
// carousel arrows, or "Show more replies" buttons nowhere near the list.
// Now every candidate is scored on text match quality, pagination context,
// and position relative to the list being scraped; the best one wins.

const LOAD_MORE_PATTERNS = [
  'load more', 'show more', 'see more', 'view more', 'more results',
  'load more results', 'show more results', 'show all', 'view all',
  'meer laden', 'mehr laden', 'mehr anzeigen', 'mostrar más', 'ver más',
  'charger plus', 'voir plus', 'carregar mais', 'mostra di più',
  'もっと見る', 'さらに表示', '더보기',
];

const NEXT_PAGE_PATTERNS = [
  'next', 'next page', 'older', 'older posts',
  'siguiente', 'suivant', 'weiter', 'nächste', 'volgende', 'próxima', 'successivo',
  '次へ', '次のページ', '다음',
];

// Bare arrows only count inside a pagination context (way too ambiguous otherwise).
const ARROW_PATTERNS = ['>', '›', '»', '→', 'next >', 'next →', 'next »'];

const PAGINATION_CONTEXT = /\b(pagination|pager|page-numbers|paginate|paging)\b/i;
const CAROUSEL_CONTEXT = /\b(carousel|slider|swiper|slick|gallery|lightbox|glide|splide)\b/i;

interface Candidate {
  el: HTMLElement;
  text: string;
  score: number;
}

export function detectLoadMoreButton(itemSelector?: string): DetectedButton | null {
  const listBottom = getListBottom(itemSelector);
  const candidates: Candidate[] = [];

  for (const el of clickableCandidates()) {
    const text = buttonText(el);
    if (!text || text.length > 45) continue;
    const lower = text.toLowerCase();

    let score = matchScore(lower, LOAD_MORE_PATTERNS);
    if (score === 0) continue;

    score += contextScore(el);
    score += positionScore(el, listBottom);
    // "Load more" is almost always a <button>, not a link that navigates.
    const href = linkHref(el);
    if (href) score -= 5;

    candidates.push({ el, text, score });
  }

  return pickBest(candidates, 'load-more');
}

export function detectNextPageButton(itemSelector?: string): DetectedButton | null {
  // rel="next" is an explicit, unambiguous signal — take it directly.
  const relNext = document.querySelector('a[rel~="next"]') as HTMLElement | null;
  if (relNext && isElementVisible(relNext) && !isElementDisabled(relNext)) {
    return toDetected(relNext, relNext.innerText?.trim() || 'Next');
  }

  const listBottom = getListBottom(itemSelector);
  const candidates: Candidate[] = [];

  for (const el of clickableCandidates()) {
    const text = buttonText(el);
    if (!text || text.length > 45) continue;
    const lower = text.toLowerCase();
    const inPagination = contextScore(el) > 0;

    let score = matchScore(lower, NEXT_PAGE_PATTERNS);
    if (score === 0 && inPagination) {
      score = matchScore(lower, ARROW_PATTERNS);
    }
    if (score === 0) {
      // aria-label carries the meaning for icon-only buttons
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (/\bnext\b/.test(aria) && !/\bslide|image|photo|item\b/.test(aria)) score = 8;
    }
    if (score === 0) continue;

    if (inPagination) score += 10;
    score += positionScore(el, listBottom);

    candidates.push({ el, text, score });
  }

  return pickBest(candidates, 'next-page');
}

// ============ SCORING ============

function matchScore(lower: string, patterns: string[]): number {
  for (const p of patterns) {
    if (lower === p) return 10;
  }
  for (const p of patterns) {
    // startsWith, but only at a word boundary ("next page of results" ok,
    // "nextdoor" not)
    if (lower.startsWith(p) && (lower.length === p.length || !/[a-z0-9]/.test(lower[p.length]))) {
      return 6;
    }
  }
  return 0;
}

function contextScore(el: HTMLElement): number {
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth < 6) {
    const cls = `${cur.className || ''} ${cur.id || ''}`;
    if (CAROUSEL_CONTEXT.test(cls)) return -20;
    if (cur.tagName === 'NAV' || cur.getAttribute('role') === 'navigation' || PAGINATION_CONTEXT.test(cls)) {
      return 8;
    }
    cur = cur.parentElement;
    depth++;
  }
  return 0;
}

/** Bottom edge (document coords) of the last item being scraped, if known. */
function getListBottom(itemSelector?: string): number | null {
  if (!itemSelector) return null;
  try {
    const items = document.querySelectorAll(itemSelector);
    if (items.length === 0) return null;
    const last = items[items.length - 1].getBoundingClientRect();
    return last.bottom + window.scrollY;
  } catch {
    return null;
  }
}

function positionScore(el: HTMLElement, listBottom: number | null): number {
  if (listBottom === null) return 0;
  const rect = el.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  // Pagination/load-more controls live just below the list.
  if (top >= listBottom - 100) {
    const dist = Math.abs(top - listBottom);
    if (dist < 300) return 8;
    if (dist < 1200) return 4;
    return 1;
  }
  // Above or inside the list = probably header nav / unrelated control.
  return -6;
}

function pickBest(candidates: Candidate[], kind: string): DetectedButton | null {
  if (candidates.length === 0) {
    log.info(`detect ${kind}: no candidates`);
    return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  candidates.slice(0, 5).forEach(c =>
    log.info(`  ${kind} candidate score=${c.score} "${c.text.slice(0, 40)}"`));
  const best = candidates[0];
  if (best.score <= 0) return null;
  return toDetected(best.el, best.text);
}

// ============ CANDIDATE ENUMERATION ============

function clickableCandidates(): HTMLElement[] {
  const els = Array.from(
    document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')
  ) as HTMLElement[];
  return els.filter(el => isElementVisible(el) && !isElementDisabled(el));
}

function buttonText(el: HTMLElement): string {
  const text = (el.innerText || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ');
  if (text) return text;
  return (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
}

function linkHref(el: HTMLElement): string | null {
  if (el.tagName !== 'A') return null;
  const href = el.getAttribute('href');
  if (!href) return null;
  const t = href.trim().toLowerCase();
  if (t === '#' || t.startsWith('javascript:') || t.startsWith('mailto:')) return null;
  try {
    const url = new URL(href, window.location.href);
    // Same-URL hash links are toggles, not navigation
    if (url.href.split('#')[0] === window.location.href.split('#')[0] && url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function toDetected(el: HTMLElement, text: string): DetectedButton {
  return {
    selector: generateButtonSelector(el),
    text,
    href: linkHref(el) || undefined,
  };
}

/**
 * Find the next-page URL inside a fetched+parsed document (no layout info
 * available there, so this is purely markup-based). Used by fetch-mode
 * pagination to follow the chain past page 2.
 */
export function findNextHrefInDocument(doc: Document, baseUrl: string): string | null {
  const resolve = (href: string | null): string | null => {
    if (!href) return null;
    const t = href.trim().toLowerCase();
    if (t === '#' || t.startsWith('javascript:') || t.startsWith('mailto:')) return null;
    try { return new URL(href, baseUrl).href; } catch { return null; }
  };

  const rel = doc.querySelector('a[rel~="next"], link[rel~="next"]');
  if (rel) {
    const href = resolve(rel.getAttribute('href'));
    if (href) return href;
  }

  const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLElement[];
  let best: { href: string; score: number } | null = null;
  for (const a of anchors) {
    const text = (a.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!text || text.length > 45) continue;

    const inPagination = hasAncestorMatching(a, 6);
    let score = matchScore(text, NEXT_PAGE_PATTERNS);
    if (score === 0 && inPagination) score = matchScore(text, ARROW_PATTERNS);
    if (score === 0) {
      const aria = (a.getAttribute('aria-label') || '').toLowerCase();
      if (/\bnext\b/.test(aria)) score = 8;
    }
    if (score === 0) continue;
    if (inPagination) score += 10;

    const href = resolve(a.getAttribute('href'));
    if (!href) continue;
    if (!best || score > best.score) best = { href, score };
  }
  return best?.href || null;
}

function hasAncestorMatching(el: Element, maxDepth: number): boolean {
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < maxDepth) {
    const cls = `${cur.className || ''} ${cur.id || ''}`;
    if (typeof cls === 'string' && PAGINATION_CONTEXT.test(cls)) return true;
    if (cur.tagName === 'NAV' || cur.getAttribute('role') === 'navigation') return true;
    cur = cur.parentElement;
    depth++;
  }
  return false;
}

/**
 * Generate a stable CSS selector for a button element.
 * NOTE: pagination re-detects the button on every page instead of trusting
 * this selector — pagination UIs re-render and positional selectors drift
 * onto the wrong button (e.g. "previous").
 */
export function generateButtonSelector(el: HTMLElement): string {
  // Try id
  if (el.id) return `#${CSS.escape(el.id)}`;

  // Try data-testid or other data attributes
  for (const attr of ['data-testid', 'data-id', 'data-action']) {
    const val = el.getAttribute(attr);
    if (val) return `[${attr}="${CSS.escape(val)}"]`;
  }

  // Try aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

  // Try rel="next" for links
  const rel = el.getAttribute('rel');
  if (rel) return `${el.tagName.toLowerCase()}[rel="${CSS.escape(rel)}"]`;

  // Build class-based selector
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter(c => !isUtilClass(c))
    .slice(0, 3);

  if (classes.length > 0) {
    const sel = `${tag}.${classes.map(c => CSS.escape(c)).join('.')}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // Fallback: nth-of-type with parent
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    const parentSel = parent.id ? `#${CSS.escape(parent.id)}` : parent.tagName.toLowerCase();
    return `${parentSel} > ${tag}:nth-of-type(${idx})`;
  }

  return tag;
}
