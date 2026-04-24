import type { ColumnDefinition, ExtractionResult } from '@/types';
import { getRelativeSelector } from './selectors';
import { log } from './logger';

// ============ LIST EXTRACTION ============

export function extractListData(payload: { itemSelector: string; columns: ColumnDefinition[] }): ExtractionResult {
  log.group('extractListData');
  log.info('itemSelector:', payload.itemSelector);
  log.info('columns:', payload.columns);

  const items = Array.from(document.querySelectorAll(payload.itemSelector));
  log.info('matched items:', items.length);

  if (items.length > 0) {
    log.info('first item tag:', items[0].tagName, 'id:', items[0].id);
    log.info('first item innerText (200 chars):', (items[0] as HTMLElement).innerText?.trim().slice(0, 200));
  }

  const columns = payload.columns.map(c => c.name);
  const rows = items.map((item, rowIdx) => {
    return payload.columns.map(col => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) {
        if (rowIdx < 3) log.warn(`  row ${rowIdx}, col "${col.name}": selector "${col.selector}" found nothing`);
        return '';
      }
      if (col.attribute === 'href') return (target as HTMLAnchorElement).href || '';
      if (col.attribute === 'src') return (target as HTMLImageElement).src || '';
      if (col.attribute !== 'text') return target.getAttribute(col.attribute) || '';
      const val = (target as HTMLElement).innerText?.trim() || target.textContent?.trim() || '';
      if (rowIdx < 3) log.info(`  row ${rowIdx}, col "${col.name}": "${val.slice(0, 80)}"`);
      return val;
    });
  });

  log.info('total rows:', rows.length);
  log.info('sample rows (first 3):', rows.slice(0, 3));
  log.groupEnd();

  return { columns, rows, url: window.location.href, timestamp: Date.now() };
}

// ============ COLUMN AUTO-DETECTION ============

// Action words to filter out (buttons, CTAs)
const ACTION_WORDS = new Set([
  'view', 'view details', 'view product', 'view more', 'read more',
  'buy', 'buy now', 'add', 'add to cart', 'add to bag', 'shop now',
  'learn more', 'details', 'quick view', 'quick shop', 'compare',
  'select', 'choose', 'order', 'order now', 'subscribe', 'remove',
  'edit', 'delete', 'save', 'cancel', 'close', 'share', 'follow',
  'following', 'unfollow', 'like', 'reply', 'retweet', 'repost',
  'apply', 'apply now', 'sign up', 'log in', 'login', 'sign in',
  'download', 'dismiss', 'hide', 'report', 'block', 'mute',
]);

export function autoDetectColumns(itemSelector: string): ColumnDefinition[] {
  log.group('autoDetectColumns');
  log.info('itemSelector:', itemSelector);

  const items = Array.from(document.querySelectorAll(itemSelector));
  log.info('matched items:', items.length);

  if (items.length === 0) {
    log.warn('no items found, returning default Text column');
    log.groupEnd();
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  const firstItem = items[0];
  log.info('firstItem tag:', firstItem.tagName, 'children:', firstItem.children.length);
  log.info('firstItem innerText (200 chars):', (firstItem as HTMLElement).innerText?.trim().slice(0, 200));

  const detected: Array<ColumnDefinition & { domIndex: number; priority: number }> = [];
  const usedSelectors = new Set<string>();
  let domIndex = 0;

  // Cache visibility: check parent once, skip children if hidden
  const hiddenElements = new WeakSet<Element>();

  function isHidden(el: HTMLElement): boolean {
    if (hiddenElements.has(el)) return true;
    // Only call getComputedStyle at the top 3 levels or when element has explicit style
    if (el.style.display === 'none' || el.hasAttribute('hidden')) {
      hiddenElements.add(el);
      return true;
    }
    // Check computed style only if element looks suspicious
    if (el.offsetHeight === 0 && el.offsetWidth === 0 && el.tagName !== 'IMG') {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        hiddenElements.add(el);
        return true;
      }
    }
    return false;
  }

  function walkItem(el: Element, depth: number = 0) {
    const htmlEl = el as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Skip script/style/noscript
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') return;

    // Skip hidden elements (cached check)
    if (tag !== 'img' && isHidden(htmlEl)) return;

    // Cap column detection to prevent runaway on huge items
    if (detected.length >= 15) return;

    // Image
    if (tag === 'img') {
      const src = htmlEl.getAttribute('src') || '';
      if (!src || src.startsWith('data:image/svg') || src.includes('pixel') || src.includes('spacer')) {
        // Skip tracking pixels and spacers
      } else {
        const sel = getRelativeSelector(firstItem, el);
        if (!usedSelectors.has(sel)) {
          usedSelectors.add(sel);
          detected.push({ name: 'Image', selector: sel, attribute: 'src', domIndex: domIndex++, priority: 1 });
        }
      }
    }

    // Link
    if (tag === 'a' && el.hasAttribute('href')) {
      const href = (el as HTMLAnchorElement).href || '';
      if (href && !href.startsWith('javascript:') && href !== '#') {
        const sel = getRelativeSelector(firstItem, el);
        if (!usedSelectors.has(sel + '[href]')) {
          usedSelectors.add(sel + '[href]');
          detected.push({ name: 'URL', selector: sel, attribute: 'href', domIndex: domIndex++, priority: 8 });
        }
      }
      Array.from(el.children).forEach(c => walkItem(c, depth + 1));
      return;
    }

    // Heading — reliable title signal
    if (/^h[1-6]$/.test(tag)) {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Title', selector: sel, attribute: 'text', domIndex: domIndex++, priority: 2 });
      }
      return;
    }

    // Time element
    if (tag === 'time') {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Date', selector: sel, attribute: 'text', domIndex: domIndex++, priority: 5 });
      }
      return;
    }

    // Leaf text nodes
    const text = htmlEl.innerText?.trim() || '';
    if (text && el.children.length === 0 && tag !== 'img') {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        const classified = classifyTextContent(text, el);
        if (classified) {
          usedSelectors.add(sel);
          detected.push({ ...classified, selector: sel, domIndex: domIndex++ });
        }
      }
    }

    // Walk children
    if (tag !== 'img') {
      Array.from(el.children).forEach(c => walkItem(c, depth + 1));
    }
  }

  Array.from(firstItem.children).forEach(c => walkItem(c, 0));

  log.info('after walkItem, detected columns:', detected.length);
  detected.forEach(d => log.info(`  detected: "${d.name}" selector="${d.selector}" attr=${d.attribute} priority=${d.priority}`));

  // Fallback: deep scan with limits
  if (detected.length === 0) {
    log.warn('walkItem found nothing, trying deep scan');
    const allEls = firstItem.querySelectorAll('*');
    const limit = Math.min(allEls.length, 200);
    for (let i = 0; i < limit && detected.length < 10; i++) {
      const el = allEls[i];
      const htmlEl = el as HTMLElement;
      const text = htmlEl.innerText?.trim() || '';
      if (!text || el.children.length > 0) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'button') continue;
      if (el.getAttribute('role') === 'button') continue;
      const sel = getRelativeSelector(firstItem, el);
      if (usedSelectors.has(sel)) continue;
      usedSelectors.add(sel);
      const classified = classifyTextContent(text, el);
      if (classified) {
        detected.push({ ...classified, selector: sel, domIndex: domIndex++ });
      }
    }
  }

  if (detected.length === 0) {
    log.groupEnd();
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  // Sort: priority first, then DOM order
  detected.sort((a, b) => a.priority - b.priority || a.domIndex - b.domIndex);

  // Deduplicate by value across sample items
  const sampleItems = items.slice(0, Math.min(5, items.length));
  const columnValues = detected.map(col => {
    return sampleItems.map(item => {
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

  // Validate: hit rate (50%+) AND value diversity
  const finalColumns = columns.filter(col => {
    const sampleValues: string[] = [];
    let hits = 0;
    for (const item of items) {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (target !== null) {
        hits++;
        if (sampleValues.length < 5) {
          if (col.attribute === 'href') sampleValues.push((target as HTMLAnchorElement).href || '');
          else if (col.attribute === 'src') sampleValues.push((target as HTMLImageElement).src || '');
          else sampleValues.push((target as HTMLElement).innerText?.trim() || '');
        }
      }
    }
    const hitRate = hits / items.length;
    if (hitRate < 0.5) {
      log.warn(`  column "${col.name}" DROPPED (hit rate ${(hitRate * 100).toFixed(0)}%)`, { selector: col.selector });
      return false;
    }

    // Value entropy check: drop columns where all sampled values are identical
    // (e.g., "Follow" button text, static labels). Exempt image/URL columns.
    if (col.attribute === 'text' && sampleValues.length >= 3) {
      const unique = new Set(sampleValues.filter(v => v.length > 0));
      if (unique.size <= 1) {
        log.warn(`  column "${col.name}" DROPPED (no value diversity: "${sampleValues[0]}")`, { selector: col.selector });
        return false;
      }
    }

    return true;
  });

  log.info('final columns:', finalColumns.length);
  finalColumns.forEach(c => log.info(`  final: "${c.name}" selector="${c.selector}" attr=${c.attribute}`));

  // Sample values
  log.group('sample values (first 3 items)');
  items.slice(0, 3).forEach((item, i) => {
    const vals = finalColumns.map(col => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) return '(null)';
      if (col.attribute === 'src') return (target as HTMLImageElement).src?.slice(0, 60) || '(empty)';
      if (col.attribute === 'href') return (target as HTMLAnchorElement).href?.slice(0, 60) || '(empty)';
      return (target as HTMLElement).innerText?.trim().slice(0, 60) || '(empty)';
    });
    log.info(`  item ${i}:`, vals);
  });
  log.groupEnd();
  log.groupEnd();

  return finalColumns;
}

// ============ TEXT CLASSIFICATION ============
// Only use high-confidence classifiers. Generic text gets "Text" with a number suffix.
// Users can rename columns in the DataTable.

function classifyTextContent(text: string, el: Element): { name: string; attribute: string; priority: number } | null {
  const lower = text.toLowerCase().trim();

  // Filter out action words (buttons, CTAs)
  if (ACTION_WORDS.has(lower)) return null;

  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');

  // Skip buttons and their children
  if (tag === 'button' || role === 'button') return null;
  const parent = el.parentElement;
  if (parent && (parent.tagName.toLowerCase() === 'button' || parent.getAttribute('role') === 'button')) return null;
  // Skip if inside a button ancestor (up to 3 levels)
  let ancestor = parent?.parentElement;
  for (let i = 0; i < 2 && ancestor; i++) {
    if (ancestor.tagName.toLowerCase() === 'button' || ancestor.getAttribute('role') === 'button') return null;
    ancestor = ancestor.parentElement;
  }

  // Pure numbers — skip (likely counters, indices)
  if (/^\d+$/.test(text)) return null;

  // ---- High-confidence classifiers (keep these) ----

  // Price (currency symbols/codes are very distinctive)
  if (/^[\$£€¥₹]\s*[\d,.]+/.test(text) || /^[\d,.]+\s*[\$£€¥₹]/.test(text) || /^[\d,.]+\s*(USD|EUR|GBP|AUD|CAD|JPY|INR|NZD|kr|zł)/i.test(text)) {
    const isStrikethrough = el.closest('s, strike, del') !== null;
    return { name: isStrikethrough ? 'Was Price' : 'Price', attribute: 'text', priority: 4 };
  }

  // Discount percentage
  if (/^\d+\s*%\s*(off|discount|save)/i.test(text) || /^-?\d+\s*%\s*(off)?$/i.test(text)) {
    return { name: 'Discount', attribute: 'text', priority: 5 };
  }

  // Star rating
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

  // ---- Generic text classification (no guessing names) ----
  // Use DOM context for priority, not text patterns

  // Use tag context for priority: prominent elements first
  if (tag === 'span' || tag === 'div' || tag === 'p' || tag === 'a' || tag === 'li' || tag === 'td') {
    // Longer text = lower priority (descriptions come after titles)
    if (text.length > 100) return { name: 'Text', attribute: 'text', priority: 7 };
    if (text.length > 40) return { name: 'Text', attribute: 'text', priority: 6 };
    return { name: 'Text', attribute: 'text', priority: 5 };
  }

  // Emphasis/strong text
  if (tag === 'strong' || tag === 'b' || tag === 'em') {
    return { name: 'Text', attribute: 'text', priority: 4 };
  }

  if (text.length > 0) return { name: 'Text', attribute: 'text', priority: 6 };
  return null;
}
