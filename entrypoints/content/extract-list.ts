import type { ColumnDefinition, ExtractionResult } from '@/types';
import { log } from './logger';

// ============ LIST EXTRACTION ============

export function extractListData(payload: { itemSelector: string; columns: ColumnDefinition[] }): ExtractionResult {
  log.group('extractListData');
  log.info('itemSelector:', payload.itemSelector);

  const allItems = Array.from(document.querySelectorAll(payload.itemSelector)) as HTMLElement[];
  // Skip empty/unrendered template slots (Angular ng-repeat stubs etc.)
  const items = allItems.filter(it => it.querySelectorAll('*').length >= 5 && (it.innerText || '').trim().length > 0);
  log.info(`matched items: ${allItems.length} (${items.length} with content)`);

  const columns = payload.columns.map(c => c.name);
  const rows = items.map(item => {
    return payload.columns.map(col => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) return '';
      if (col.attribute === 'href') return (target as HTMLAnchorElement).href || '';
      if (col.attribute === 'src') return resolveImgSrc(target as HTMLImageElement);
      if (col.attribute !== 'text') return target.getAttribute(col.attribute) || '';
      return (target as HTMLElement).innerText?.trim() || target.textContent?.trim() || '';
    });
  });

  log.info('total rows:', rows.length);
  log.groupEnd();

  return { columns, rows, url: window.location.href, timestamp: Date.now() };
}

// ============ COLUMN AUTO-DETECTION ============
// Port of the walker from UltimateWebScraper (background.bundle.js:1175-1474).
// Walks each item recursively, emits {breadcrumb: value} pairs. Post-processes
// breadcrumbs into column names.

type Attribute = 'text' | 'href' | 'src' | 'alt' | 'background' | 'aria-label';

interface Cell {
  attribute: Attribute;
  value: string;
  selector: string; // relative to item root
}

export function autoDetectColumns(itemSelector: string): ColumnDefinition[] {
  log.group('autoDetectColumns');
  log.info('itemSelector:', itemSelector);

  const allItems = Array.from(document.querySelectorAll(itemSelector)) as HTMLElement[];
  log.info('matched items:', allItems.length);

  if (allItems.length === 0) {
    log.warn('no items matched selector');
    log.groupEnd();
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  // Filter out empty/unrendered items (Angular ng-repeat stubs, virtualized
  // below-fold cards, hidden duplicate trees). Same selector can match real
  // cards AND empty template slots.
  const items = allItems.filter(it => it.querySelectorAll('*').length >= 5 && (it.innerText || '').trim().length > 0);
  log.info(`filtered to ${items.length} items with content (dropped ${allItems.length - items.length} empty)`);
  if (items.length === 0) {
    log.warn('all items empty after filtering');
    log.groupEnd();
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  // Snapshot of item #0
  const first = items[0];
  log.info('item[0] outline:', {
    tag: first.tagName,
    class: first.className?.slice(0, 100),
    descendants: first.querySelectorAll('*').length,
    textPreview: (first.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  });

  // Walk a sample, union their breadcrumb sets.
  const sample = items.slice(0, Math.min(5, items.length));
  const seen = new Map<string, Cell>();

  sample.forEach((item, idx) => {
    const emitted = walkItem(item);
    log.info(`item[${idx}] walker emitted ${emitted.size} breadcrumbs`);
    for (const [breadcrumb, cell] of emitted) {
      if (!seen.has(breadcrumb)) seen.set(breadcrumb, cell);
    }
  });
  log.info('total unique breadcrumbs across sample:', seen.size);

  // Convert each breadcrumb → named ColumnDefinition
  const nameCounts = new Map<string, number>();
  const candidates: Array<ColumnDefinition & { breadcrumb: string }> = [];
  for (const [breadcrumb, cell] of seen) {
    const named = nameFromBreadcrumb(breadcrumb, cell);
    const count = (nameCounts.get(named) || 0) + 1;
    nameCounts.set(named, count);
    const name = count > 1 ? `${named} ${count}` : named;
    const attr: ColumnDefinition['attribute'] =
      cell.attribute === 'background' ? 'src' : cell.attribute;
    candidates.push({ name, selector: cell.selector, attribute: attr, breadcrumb });
  }
  log.info('candidate columns after naming:', candidates.length);

  // Compute value-vector for every candidate against valid items, drop low-hit/no-diversity
  const withValues = candidates.map(col => {
    const values: string[] = [];
    let hits = 0;
    for (const item of items) {
      const target = col.selector ? item.querySelector(col.selector) : item;
      if (!target) { values.push(''); continue; }
      hits++;
      values.push(extractValue(target, col.attribute));
    }
    return { col, values, hits };
  });

  const surviving = withValues.filter(({ col, values, hits }) => {
    const hitRate = hits / items.length;
    if (hitRate < 0.5) {
      log.info(`  drop "${col.name}" hit rate ${(hitRate * 100).toFixed(0)}% sel="${col.selector}"`);
      return false;
    }
    if (col.attribute === 'text' && values.length >= 3) {
      const uniq = new Set(values.filter(v => v.length > 0));
      if (uniq.size <= 1) {
        log.info(`  drop "${col.name}" no diversity: "${values[0]}"`);
        return false;
      }
    }
    return true;
  });

  // Dedup by value vector — when overlay/popup duplicates a card's fields,
  // both columns produce the same values; keep the one with shortest breadcrumb.
  const byKey = new Map<string, typeof surviving[number]>();
  for (const entry of surviving) {
    const key = entry.col.attribute + '|' + entry.values.join('§');
    const existing = byKey.get(key);
    if (!existing || entry.col.breadcrumb.length < existing.col.breadcrumb.length) {
      if (existing) log.info(`  dedup "${existing.col.name}" → "${entry.col.name}" (same values)`);
      byKey.set(key, entry);
    } else {
      log.info(`  dedup "${entry.col.name}" → "${existing.col.name}" (same values)`);
    }
  }

  const finalColumns: ColumnDefinition[] = Array.from(byKey.values()).map(({ col }) => ({
    name: col.name,
    selector: col.selector,
    attribute: col.attribute,
  }));

  log.info('final columns:', finalColumns.length);
  finalColumns.forEach(c => log.info(`  ✓ "${c.name}" (${c.attribute}) sel="${c.selector}"`));
  log.groupEnd();

  return finalColumns.length > 0 ? finalColumns : [{ name: 'Text', selector: '', attribute: 'text' }];
}

// ============ WALKER ============

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

function walkItem(root: HTMLElement): Map<string, Cell> {
  const out = new Map<string, Cell>();
  walk(root, root, [], new Map(), out);
  return out;
}

function walk(
  root: Element,
  el: Element,
  breadcrumbs: string[],
  siblingCounter: Map<string, number>,
  out: Map<string, Cell>,
): void {
  if (SKIP_TAGS.has(el.tagName)) return;

  const label = displayLabel(el);
  const n = (siblingCounter.get(label) || 0) + 1;
  siblingCounter.set(label, n);
  const segment = n > 1 ? `${label} (${n})` : label;
  const path = [...breadcrumbs, segment];
  const breadcrumb = path.join(' > ');
  const tag = el.tagName.toLowerCase();

  // Direct text-node children (not descendants)
  const directText = Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ');
  if (directText) {
    set(out, breadcrumb, { attribute: 'text', value: directText, selector: relativeSelector(root, el) });
  }

  // <a href>
  if (tag === 'a') {
    const href = (el as HTMLAnchorElement).getAttribute('href') || '';
    if (href && !href.trim().toLowerCase().startsWith('javascript:') && href !== '#') {
      set(out, `${breadcrumb} href`, {
        attribute: 'href',
        value: absUrl(href),
        selector: relativeSelector(root, el),
      });
    }
  }

  // <img src/alt>
  if (tag === 'img') {
    const src = resolveImgSrc(el as HTMLImageElement);
    if (src && !src.startsWith('data:')) {
      set(out, `${breadcrumb} src`, { attribute: 'src', value: src, selector: relativeSelector(root, el) });
    }
    const alt = (el as HTMLImageElement).getAttribute('alt');
    if (alt && alt.trim()) {
      set(out, `${breadcrumb} alt`, {
        attribute: 'alt',
        value: alt.trim(),
        selector: relativeSelector(root, el),
      });
    }
  }

  // role="img" — expose aria-label as description
  if (el.getAttribute('role') === 'img') {
    const al = el.getAttribute('aria-label');
    if (al) {
      set(out, `${breadcrumb} aria-label`, {
        attribute: 'aria-label',
        value: al.trim(),
        selector: relativeSelector(root, el),
      });
    }
  }

  // Background image (computed style or inline) — and <video poster>
  const bg = resolveBackgroundImage(el);
  if (bg) {
    set(out, `${breadcrumb} background`, {
      attribute: 'background',
      value: bg,
      selector: relativeSelector(root, el),
    });
  }

  // Recurse — children use their own sibling counter
  const childCounter = new Map<string, number>();
  for (const child of Array.from(el.children)) {
    walk(root, child, path, childCounter, out);
  }
}

function set(out: Map<string, Cell>, key: string, cell: Cell): void {
  if (!out.has(key)) out.set(key, cell);
}

// ============ DISPLAY LABELS ============
// Port of UltimateWS's label picker. Priority:
//   1. first `data-*` attribute name (minus "data-" prefix)
//   2. id
//   3. role
//   4. aria-label (normalized)
//   5. tag-specific defaults (link/image/button/heading/paragraph)
//   6. <span> content-based: numeric_value / time_value / description / text_content
//   7. <div> content-based: image_container / link_container / container
//   8. first non-BEM / non-sc- / non-auto class
//   9. tag name

function displayLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();

  // 1. data-* attribute name
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-') && attr.name.length > 5) {
      return attr.name.slice(5);
    }
  }

  // 2. id
  if (el.id) return el.id;

  // 3. role
  const role = el.getAttribute('role');
  if (role) return role;

  // 4. aria-label (short only)
  const aria = el.getAttribute('aria-label');
  if (aria && aria.length > 0 && aria.length < 40) {
    return aria.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || tag;
  }

  // 5. tag-specific defaults
  if (tag === 'a') return 'link';
  if (tag === 'img') return 'image';
  if (tag === 'button') return 'button';
  if (/^h[1-4]$/.test(tag)) return 'heading';
  if (tag === 'p') return 'paragraph';

  // 6. <span> content-based
  if (tag === 'span') {
    const t = el.textContent?.trim() || '';
    if (t) {
      if (/^[\d,]+$/.test(t) || /^[\d,]+\.\d+$/.test(t)) return 'numeric_value';
      if (/\b(days?|hours?|minutes?|seconds?|weeks?|months?|ago)\b/i.test(t)) return 'time_value';
      if (t.length > 20) return 'description';
      return 'text_content';
    }
  }

  // 7. <div> content-based
  if (tag === 'div') {
    if (el.querySelector('img')) return 'image_container';
    if (el.querySelector('a')) return 'link_container';
    if (el.querySelectorAll('div, span').length > 3) return 'container';
  }

  // 8. first semantic-looking class
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const semantic = classes.find(
    c => !c.includes('__') && !/^sc-[a-z0-9]/.test(c) && !/^[a-z][0-9]/.test(c) && c.length > 2 && !isFrameworkClass(c),
  );
  if (semantic) return semantic;
  if (classes.length > 0) return classes[0];

  // 9. fallback
  return tag;
}

function isFrameworkClass(c: string): boolean {
  if (/^(w-|h-|p[xytblr]?-|m[xytblr]?-|text-|bg-|flex|grid|border-|rounded|shadow|hover:|sm:|md:|lg:|xl:)/.test(c)) return true;
  if (/^_[a-zA-Z0-9]{5,}$/.test(c)) return true;
  if (/^css-[a-z0-9]+$/i.test(c)) return true;
  return false;
}

// ============ BREADCRUMB → COLUMN NAME ============
// Port of UltimateWS's column namer (background.bundle.js:1436-1460).
//   1. Strip trailing attribute suffix, map to "URL"/"Image"/"Description"/etc.
//   2. Take last path segment (strip sibling counter "(n)")
//   3. Match against semantic keywords (title/price/date/rating/review/…)
//   4. Title-case, or fall back to "Text" / "Column N"

function nameFromBreadcrumb(breadcrumb: string, cell: Cell): string {
  let name = breadcrumb;
  let suffix: string | null = null;
  if (name.endsWith(' href')) { name = name.slice(0, -5); suffix = 'URL'; }
  else if (name.endsWith(' src')) { name = name.slice(0, -4); suffix = 'Image'; }
  else if (name.endsWith(' alt')) { name = name.slice(0, -4); suffix = 'Description'; }
  else if (name.endsWith(' background')) { name = name.slice(0, -11); suffix = 'Image'; }
  else if (name.endsWith(' aria-label')) { name = name.slice(0, -11); suffix = 'Description'; }

  const segments = name.split(' > ');
  let last = segments[segments.length - 1].replace(/\s*\(\d+\)$/, '').trim();
  const lower = last.toLowerCase();

  if (lower.includes('title') || lower.includes('heading')) return 'Title';
  if (lower.includes('description') || lower.includes('summary') || lower.includes('excerpt')) return 'Description';
  if (lower.includes('price')) return 'Price';
  if (lower.includes('author') || lower.includes('byline')) return 'Author';
  if (lower.includes('date') || lower.includes('published')) return 'Date';
  if (lower.includes('rating') || lower.includes('star')) return 'Rating';
  if (lower.includes('review')) return 'Reviews';
  if (lower === 'time_value' || lower === 'time') return 'Time';
  if (lower === 'numeric_value') return 'Number';
  if (lower === 'link' && cell.attribute === 'href') return 'Link';
  if (lower === 'image' || lower === 'img') return 'Image';

  if (suffix) return suffix;

  // Generic fallback
  if (!last || last === 'container' || last === 'text_content' || /^(div|span)$/.test(last)) return 'Text';

  // Title-case + split camelCase (productTile_name → "Product Tile Name")
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ============ HELPERS ============

function resolveImgSrc(img: HTMLImageElement): string {
  // Prefer srcset's widest, fall through data-src* variants
  const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
  if (srcset) {
    const best = pickBestSrcset(srcset);
    if (best) return absUrl(best);
  }
  for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'src']) {
    const v = img.getAttribute(attr);
    if (v) return absUrl(v);
  }
  return '';
}

function pickBestSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(',').map(p => p.trim()).filter(Boolean)) {
    const [url, size] = part.split(/\s+/);
    const w = size?.endsWith('w') ? parseInt(size, 10) || 0 : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url || null;
}

function resolveBackgroundImage(el: Element): string | null {
  // <video poster>
  if (el.tagName === 'VIDEO') {
    const poster = (el as HTMLVideoElement).getAttribute('poster');
    if (poster) return absUrl(poster);
  }

  // Computed style background-image
  const cs = getComputedStyle(el);
  let bg = cs.backgroundImage;

  // Inline style fallback (some frameworks set style="background-image:url(...)")
  if (!bg || bg === 'none') {
    const inline = el.getAttribute('style');
    if (inline) {
      const m = inline.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);
      if (m?.[1]) bg = `url("${m[1]}")`;
    }
  }

  if (!bg || bg === 'none') return null;
  const m = bg.match(/url\(['"]?(.*?)['"]?\)/i);
  if (!m?.[1]) return null;
  const url = m[1];
  if (url.startsWith('data:')) return null;

  // Skip sprite sheets (negative background-position)
  const pos = cs.backgroundPosition;
  if (pos) {
    const [x, y] = pos.split(' ').map(p => (p.endsWith('%') ? 0 : parseInt(p, 10) || 0));
    if (x < 0 || y < 0) return null;
  }

  return absUrl(url);
}

function absUrl(u: string): string {
  try { return new URL(u, window.location.href).href; } catch { return u; }
}

function extractValue(el: Element, attribute: string): string {
  if (attribute === 'href') return (el as HTMLAnchorElement).href || '';
  if (attribute === 'src') return resolveImgSrc(el as HTMLImageElement);
  if (attribute === 'alt') return (el as HTMLImageElement).getAttribute('alt')?.trim() || '';
  if (attribute === 'aria-label') return el.getAttribute('aria-label')?.trim() || '';
  if (attribute !== 'text') return el.getAttribute(attribute) || '';
  return (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '';
}

// Shortest unique selector from item root to descendant.
function relativeSelector(root: Element, child: Element): string {
  if (child === root) return '';
  const parts: string[] = [];
  let cur: Element | null = child;
  let depth = 0;
  while (cur && cur !== root && depth < 6) {
    let seg = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList).find(c => !isFrameworkClass(c) && c.length > 2);
    if (cls) {
      seg += `.${CSS.escape(cls)}`;
    } else {
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
        if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(seg);
    const partial = parts.join(' > ');
    if (root.querySelectorAll(partial).length === 1) return partial;
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ');
}
