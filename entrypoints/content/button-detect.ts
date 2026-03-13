import type { DetectedButton } from '@/types';

const LOAD_MORE_PATTERNS = [
  'load more', 'show more', 'see more', 'view more',
  'load more results', 'show more results',
];

const NEXT_PAGE_PATTERNS = [
  'next', 'next page', 'next >', 'next →', '>', '›', '»', '→',
];

/**
 * Detect a "Load More" / "Show More" button on the page.
 */
export function detectLoadMoreButton(): DetectedButton | null {
  return findButtonByPatterns(LOAD_MORE_PATTERNS);
}

/**
 * Detect a "Next Page" button or link on the page.
 */
export function detectNextPageButton(): DetectedButton | null {
  // Check rel="next" links first
  const relNext = document.querySelector('a[rel="next"]') as HTMLElement | null;
  if (relNext) {
    return {
      selector: generateButtonSelector(relNext),
      text: relNext.innerText?.trim() || 'Next',
    };
  }

  // Check aria-label="Next" or aria-label containing "next page"
  const ariaNext = document.querySelector(
    '[aria-label="Next"], [aria-label="Next page"], [aria-label="Go to next page"]'
  ) as HTMLElement | null;
  if (ariaNext) {
    return {
      selector: generateButtonSelector(ariaNext),
      text: ariaNext.innerText?.trim() || ariaNext.getAttribute('aria-label') || 'Next',
    };
  }

  // Fall back to text-based detection
  return findButtonByPatterns(NEXT_PAGE_PATTERNS);
}

function findButtonByPatterns(patterns: string[]): DetectedButton | null {
  const candidates = Array.from(
    document.querySelectorAll('button, a, [role="button"]')
  ) as HTMLElement[];

  for (const btn of candidates) {
    if (btn.offsetParent === null && btn.tagName.toLowerCase() !== 'a') continue;
    const text = btn.innerText?.trim().toLowerCase() || '';
    if (patterns.some(p => text === p || text.startsWith(p))) {
      return {
        selector: generateButtonSelector(btn),
        text: btn.innerText?.trim() || '',
      };
    }
  }
  return null;
}

/**
 * Generate a stable CSS selector for a button element.
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

// Minimal utility class check (same prefixes as selectors.ts)
const UTIL_PREFIXES = [
  'w-', 'h-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'm-', 'mx-', 'my-',
  'mt-', 'mb-', 'ml-', 'mr-', 'flex', 'grid', 'text-', 'bg-', 'border-', 'rounded',
  'shadow', 'opacity-', 'transition', 'duration-', 'ease-', 'cursor-', 'overflow-',
  'z-', 'gap-', 'space-', 'items-', 'justify-', 'self-', 'col-', 'row-',
  'hidden', 'block', 'inline', 'absolute', 'relative', 'fixed', 'sticky',
];

function isUtilClass(className: string): boolean {
  return UTIL_PREFIXES.some(p => className.startsWith(p));
}
