import type { ColumnDefinition, ExtractionResult } from '@/types';
import { generateSelectorForElement, getRelativeSelector, isUtilClass } from './selectors';

// ============ LIST EXTRACTION ============

export function extractListData(payload: { itemSelector: string; columns: ColumnDefinition[] }): ExtractionResult {
  const items = Array.from(document.querySelectorAll(payload.itemSelector));
  const columns = payload.columns.map(c => c.name);
  const rows = items.map(item => {
    return payload.columns.map(col => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) return '';
      if (col.attribute === 'href') return (target as HTMLAnchorElement).href || '';
      if (col.attribute === 'src') return (target as HTMLImageElement).src || '';
      if (col.attribute !== 'text') return target.getAttribute(col.attribute) || '';
      return (target as HTMLElement).innerText?.trim() || target.textContent?.trim() || '';
    });
  });
  return { columns, rows, url: window.location.href, timestamp: Date.now() };
}

// ============ COLUMN AUTO-DETECTION ============

// Common button/action words that should NOT be treated as data
const ACTION_WORDS = new Set([
  'view', 'view details', 'view product', 'view more', 'read more',
  'buy', 'buy now', 'add', 'add to cart', 'add to bag', 'shop now',
  'learn more', 'details', 'quick view', 'quick shop', 'compare',
  'select', 'choose', 'order', 'order now', 'subscribe', 'remove',
  'edit', 'delete', 'save', 'cancel', 'close', 'share',
]);

export function autoDetectColumns(itemSelector: string): ColumnDefinition[] {
  const items = Array.from(document.querySelectorAll(itemSelector));
  if (items.length === 0) return [{ name: 'Text', selector: '', attribute: 'text' }];

  const firstItem = items[0];
  const detected: Array<ColumnDefinition & { domIndex: number; priority: number }> = [];
  const usedSelectors = new Set<string>();
  const capturedLinkEls = new Set<Element>();
  let domIndex = 0;

  function walkItem(el: Element, depth: number = 0) {
    const htmlEl = el as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (htmlEl.offsetParent === null && tag !== 'img') return;

    // Image
    if (tag === 'img') {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Image', selector: sel, attribute: 'src', domIndex: domIndex++, priority: 1 });
      }
    }

    // Link
    if (tag === 'a' && el.hasAttribute('href')) {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel + '[href]')) {
        usedSelectors.add(sel + '[href]');
        capturedLinkEls.add(el);
        detected.push({ name: 'URL', selector: sel, attribute: 'href', domIndex: domIndex++, priority: 8 });
      }
      Array.from(el.children).forEach(c => walkItem(c, depth + 1));
      return;
    }

    // Heading
    if (/^h[1-6]$/.test(tag)) {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Title', selector: sel, attribute: 'text', domIndex: domIndex++, priority: 2 });
      }
      return;
    }

    // Leaf text nodes
    const text = htmlEl.innerText?.trim() || '';
    if (text && el.children.length === 0 && tag !== 'img') {
      const sel = getRelativeSelector(firstItem, el);
      if (usedSelectors.has(sel)) {
        Array.from(el.children).forEach(c => walkItem(c, depth + 1));
        return;
      }

      const classified = classifyTextContent(text, el);
      if (classified) {
        usedSelectors.add(sel);
        detected.push({ ...classified, selector: sel, domIndex: domIndex++ });
      }
    }

    if (tag !== 'img') {
      Array.from(el.children).forEach(c => walkItem(c, depth + 1));
    }
  }

  Array.from(firstItem.children).forEach(c => walkItem(c, 0));

  if (detected.length === 0) {
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  // Sort: priority first, then DOM order
  detected.sort((a, b) => a.priority - b.priority || a.domIndex - b.domIndex);

  // Deduplicate by value across items
  const columnValues = detected.map(col => {
    return items.slice(0, 5).map(item => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) return '';
      if (col.attribute === 'href') return (target as HTMLAnchorElement).href || '';
      if (col.attribute === 'src') return (target as HTMLImageElement).src || '';
      return (target as HTMLElement).innerText?.trim() || '';
    }).join('|||');
  });

  const seenValues = new Set<string>();
  const deduped = detected.filter((_, i) => {
    const key = columnValues[i];
    if (seenValues.has(key)) return false;
    seenValues.add(key);
    return true;
  });

  // Deduplicate names
  const nameCounts = new Map<string, number>();
  const columns = deduped.map(col => {
    const count = (nameCounts.get(col.name) || 0) + 1;
    nameCounts.set(col.name, count);
    const name = count > 1 ? `${col.name} ${count}` : col.name;
    return { name, selector: col.selector, attribute: col.attribute };
  });

  // Verify columns work across items (50%+ hit rate)
  return columns.filter(col => {
    const hits = items.filter(item => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      return target !== null;
    }).length;
    return hits >= items.length * 0.5;
  });
}

function classifyTextContent(text: string, el: Element): { name: string; attribute: string; priority: number } | null {
  const lower = text.toLowerCase().trim();

  if (ACTION_WORDS.has(lower)) return null;

  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (tag === 'button' || role === 'button') return null;
  const parent = el.parentElement;
  if (parent && (parent.tagName.toLowerCase() === 'button' || parent.getAttribute('role') === 'button')) return null;

  // Price
  if (/^[\$£€¥₹]\s*[\d,.]+/.test(text) || /^[\d,.]+\s*[\$£€¥₹]/.test(text) || /^[\d,.]+\s*(USD|EUR|GBP|AUD|CAD|JPY|INR|NZD|kr|zł)/i.test(text)) {
    const style = getComputedStyle(el as HTMLElement);
    const isStrikethrough = style.textDecoration.includes('line-through') || el.closest('s, strike, del') !== null;
    return { name: isStrikethrough ? 'Was Price' : 'Price', attribute: 'text', priority: 4 };
  }

  // Discount
  if (/^\d+\s*%\s*(off|discount|save)/i.test(text) || /^-?\d+\s*%\s*(off)?$/i.test(text)) {
    return { name: 'Discount', attribute: 'text', priority: 5 };
  }

  // Rating
  if (/^\d+(\.\d+)?\s*\/\s*5/.test(text) || /^[\d.]+\s*★/.test(text) || /^\(?\d+(\.\d+)?\)?\s*(stars?|reviews?|ratings?)/i.test(text)) {
    return { name: 'Rating', attribute: 'text', priority: 5 };
  }

  // Review count
  if (/^\(?\d[\d,]*\)?\s*(reviews?|ratings?|votes?)/i.test(text) || /^\(\d[\d,]*\)$/.test(text)) {
    return { name: 'Reviews', attribute: 'text', priority: 6 };
  }

  // Availability
  if (/^(in stock|out of stock|available|sold out|limited|only \d+ left)/i.test(text)) {
    return { name: 'Availability', attribute: 'text', priority: 7 };
  }

  // Badge
  if (/^(new|sale|hot|best seller|featured|popular|trending|free shipping|% off|\d+%\s*off)/i.test(text) && text.length <= 25) {
    return { name: 'Badge', attribute: 'text', priority: 6 };
  }

  // Short text classification
  if (text.length <= 20) {
    if (/^\d+$/.test(text)) return null;
    if (/^[A-Z][A-Z\s&.]+$/.test(text) && text.length <= 15) {
      return { name: 'Brand', attribute: 'text', priority: 3 };
    }
    if (!/[\$£€¥₹]/.test(text) && !/^\d/.test(text)) {
      return { name: 'Label', attribute: 'text', priority: 6 };
    }
  }

  if (text.length > 80) return { name: 'Description', attribute: 'text', priority: 5 };
  if (text.length > 20 && text.length <= 80) return { name: 'Specs', attribute: 'text', priority: 5 };
  if (text.length > 0) return { name: 'Text', attribute: 'text', priority: 6 };
  return null;
}
