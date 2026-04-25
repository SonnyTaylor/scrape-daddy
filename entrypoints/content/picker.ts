import type { ElementSelection } from '@/types';
import { injectStyles } from './styles';
import {
  generateSelectorForElement,
  findSimilarElements,
  findByDataAttributes,
  findByAriaRoles,
  isUtilClass,
  isVisibleListItem,
} from './selectors';
import { log } from './logger';

// ============ STATE ============

let pickerActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let containerOverlay: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let similarHighlights: HTMLDivElement[] = [];
let countBadges: HTMLDivElement[] = [];
let scrollListener: (() => void) | null = null;
let trackedSimilarElements: Element[] = [];
let hoverItemHighlights: HTMLDivElement[] = [];

// Smart list detection cache
let cachedListDetection: ListDetection | null = null;
let lastHoverTarget: Element | null = null;
let hoverDebounceTimer: number | null = null;

// Scroll throttle
let scrollRafId: number | null = null;

interface ListDetection {
  container: Element;
  items: Element[];
  selector: string;
  itemSelector: string;
}

// ============ PUBLIC API ============

export function startPicker() {
  injectStyles();
  pickerActive = true;
  cachedListDetection = null;
  lastHoverTarget = null;
  log.clear();
  log.info('='.repeat(60));
  log.info('PICKER STARTED  url:', window.location.href);
  log.info('tip: run __scrapeDaddyDumpLogs() in this console to copy logs');
  log.info('='.repeat(60));
  document.addEventListener('mousemove', onPickerMouseMove, true);
  document.addEventListener('click', onPickerClick, true);
  document.addEventListener('keydown', onPickerKeyDown, true);
  document.body.style.cursor = 'crosshair';
  createOverlays();
}

export function stopPicker() {
  pickerActive = false;
  cachedListDetection = null;
  lastHoverTarget = null;
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
  document.removeEventListener('mousemove', onPickerMouseMove, true);
  document.removeEventListener('click', onPickerClick, true);
  document.removeEventListener('keydown', onPickerKeyDown, true);
  document.body.style.cursor = '';
  removeHighlights();
}

// ============ OVERLAY MANAGEMENT ============

function createOverlays() {
  if (!highlightOverlay) {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'scrape-daddy-highlight';
    document.body.appendChild(highlightOverlay);
  }
  if (!containerOverlay) {
    containerOverlay = document.createElement('div');
    containerOverlay.id = 'scrape-daddy-container';
    document.body.appendChild(containerOverlay);
  }
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'scrape-daddy-tooltip';
    document.body.appendChild(tooltipEl);
  }
}

function removeHighlights() {
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    scrollListener = null;
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  trackedSimilarElements = [];

  highlightOverlay?.remove();
  highlightOverlay = null;
  containerOverlay?.remove();
  containerOverlay = null;
  tooltipEl?.remove();
  tooltipEl = null;
  clearHoverItemHighlights();
  similarHighlights.forEach(h => h.remove());
  similarHighlights = [];
  countBadges.forEach(b => b.remove());
  countBadges = [];
}

function clearHoverItemHighlights() {
  hoverItemHighlights.forEach(h => h.remove());
  hoverItemHighlights = [];
}

function showHoverItemHighlights(items: Element[]) {
  clearHoverItemHighlights();
  items.forEach(el => {
    const rect = el.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'scrape-daddy-hover-item';
    Object.assign(highlight.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    document.body.appendChild(highlight);
    hoverItemHighlights.push(highlight);
  });
}

function positionOverlay(el: HTMLDivElement, rect: DOMRect) {
  el.style.top = rect.top + 'px';
  el.style.left = rect.left + 'px';
  el.style.width = rect.width + 'px';
  el.style.height = rect.height + 'px';
}

function isScrapeOverlay(el: Element): boolean {
  const id = el.id || '';
  return id.startsWith('scrape-daddy-') || el.classList.contains('scrape-daddy-hover-item') || el.classList.contains('scrape-daddy-similar') || el.classList.contains('scrape-daddy-badge');
}

// ============ MOUSE EVENTS ============

function onPickerMouseMove(e: MouseEvent) {
  if (!pickerActive || !highlightOverlay) return;
  const target = e.target as Element;
  if (isScrapeOverlay(target)) return;

  if (target === lastHoverTarget) return;
  lastHoverTarget = target;

  // Debounced list detection
  if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
  hoverDebounceTimer = window.setTimeout(() => {
    runListDetection(target);
  }, 60);

  // If inside cached list, hide single highlight
  if (cachedListDetection && cachedListDetection.container.contains(target)) {
    highlightOverlay.style.display = 'none';
    return;
  }

  // Show single element highlight
  const rect = target.getBoundingClientRect();
  highlightOverlay.style.display = 'block';
  positionOverlay(highlightOverlay, rect);

  if (containerOverlay) containerOverlay.style.display = 'none';
  if (tooltipEl) tooltipEl.style.display = 'none';
  clearHoverItemHighlights();
  cachedListDetection = null;
}

function runListDetection(target: Element) {
  if (!pickerActive) return;

  if (cachedListDetection && cachedListDetection.container.contains(target)) return;

  const detection = detectListFromElement(target);

  if (detection) {
    cachedListDetection = detection;
    highlightOverlay!.style.display = 'none';
    showListDetectionUI(detection);
  } else {
    cachedListDetection = null;
    if (containerOverlay) containerOverlay.style.display = 'none';
    if (tooltipEl) tooltipEl.style.display = 'none';
    clearHoverItemHighlights();

    const rect = target.getBoundingClientRect();
    highlightOverlay!.style.display = 'block';
    positionOverlay(highlightOverlay!, rect);
  }
}

// ============ LIST DETECTION ============

function isContainerTooLarge(container: Element, items: Element[]): boolean {
  // Never reject semantic content containers
  const tag = container.tagName.toLowerCase();
  const role = container.getAttribute('role');
  if (tag === 'main' || tag === 'section' || tag === 'article' || tag === 'ul' || tag === 'ol' ||
      tag === 'table' || tag === 'tbody' || role === 'main' || role === 'list' || role === 'grid') {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const viewportArea = window.innerWidth * window.innerHeight;
  const containerArea = containerRect.width * containerRect.height;
  const totalChildren = container.children.length;
  const areaRatio = containerArea / viewportArea;
  const childRatio = totalChildren > 0 ? items.length / totalChildren : 1;

  // Only reject if container covers > 90% of viewport (was 70% — too aggressive)
  if (areaRatio > 0.9) {
    log.warn('Container too large (area)', { areaRatio: areaRatio.toFixed(2), tag: container.tagName });
    return true;
  }
  // Very mixed content (< 15% list items among children)
  if (totalChildren > 5 && childRatio < 0.15) {
    log.warn('Container too large (child ratio)', { childRatio: childRatio.toFixed(2), items: items.length, totalChildren });
    return true;
  }
  return false;
}

function describeEl(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = (el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
  const clsStr = cls ? `.${cls}` : '';
  const r = el.getBoundingClientRect();
  const size = `[${Math.round(r.width)}x${Math.round(r.height)}]`;
  return `${tag}${id}${clsStr}${size}`;
}

function detectListFromElement(element: Element): ListDetection | null {
  log.group('detectListFromElement');
  log.info('target:', describeEl(element), 'text:', (element as HTMLElement).innerText?.slice(0, 80));

  // Fast paths: explicit list semantics
  const dataResult = findByDataAttributes(element);
  if (dataResult && dataResult.elements.length >= 3) {
    const parent = dataResult.elements[0].parentElement;
    if (parent) {
      const items = dataResult.elements.filter(isVisibleListItem);
      if (items.length >= 3) {
        log.info('matched by data-attrs:', { selector: dataResult.selector, count: items.length });
        log.groupEnd();
        return pack(parent, items, dataResult.selector);
      }
    }
  }
  const ariaResult = findByAriaRoles(element);
  if (ariaResult && ariaResult.elements.length >= 3) {
    const parent = ariaResult.elements[0].parentElement;
    if (parent) {
      const items = ariaResult.elements.filter(isVisibleListItem);
      if (items.length >= 3) {
        log.info('matched by ARIA:', { selector: ariaResult.selector, count: items.length });
        log.groupEnd();
        return pack(parent, items, ariaResult.selector);
      }
    }
  }

  // Structural walk-up — rank candidates at every level, pick smallest area.
  log.info('walking up for structural match…');
  let cur: Element | null = element;
  let depth = 0;
  const candidates: Array<{ container: Element; items: Element[]; itemSel: string; area: number; depth: number }> = [];

  while (cur && cur !== document.body && cur !== document.documentElement && depth < 10) {
    const parent: Element | null = cur.parentElement;
    if (!parent) break;

    const tag = cur.tagName;
    const sameTagSibs = Array.from(parent.children).filter(c => c.tagName === tag);
    const refShape = shapeKey(cur);
    const refWidth = (cur as HTMLElement).offsetWidth || cur.getBoundingClientRect().width;

    log.info(`[d=${depth}] ${describeEl(cur)}`, {
      parent: describeEl(parent),
      sameTagSibs: sameTagSibs.length,
      shape: refShape,
      refWidth: Math.round(refWidth),
    });

    if (sameTagSibs.length >= 3) {
      const group = findShapeGroup(cur, sameTagSibs);
      log.info(`  shape-group size: ${group.length}`);
      if (group.length >= 3) {
        const itemSel = buildItemSelector(parent, cur);
        const matched = Array.from(document.querySelectorAll(itemSel)).filter(isVisibleListItem);
        log.info(`  itemSel: "${itemSel}" → ${matched.length} matches`);
        if (matched.length >= 3) {
          const avgArea = avgRectArea(matched.slice(0, 10));
          log.info(`  candidate accepted, avgArea=${Math.round(avgArea)}`);
          if (avgArea > 0) candidates.push({ container: parent, items: matched, itemSel, area: avgArea, depth });
        } else {
          log.info(`  selector matches <3, skipped`);
        }
      }
    } else {
      log.info(`  <3 same-tag siblings, skipping level`);
    }
    cur = parent;
    depth++;
  }

  if (candidates.length === 0) {
    log.warn('no candidates found');
    log.groupEnd();
    return null;
  }

  candidates.sort((a, b) => a.area - b.area);
  log.info('candidates (sorted by area asc):');
  candidates.forEach((c, i) => log.info(`  ${i === 0 ? '★' : ' '} d=${c.depth} area=${Math.round(c.area)} items=${c.items.length} sel="${c.itemSel}"`));
  const best = candidates[0];
  log.info('chose:', { selector: best.itemSel, items: best.items.length, area: Math.round(best.area) });
  log.groupEnd();
  return pack(best.container, best.items, best.itemSel);
}

// Pack a detection, generating selectors on demand
function pack(container: Element, items: Element[], itemSelector: string): ListDetection {
  return { container, items, selector: generateSelectorForElement(container), itemSelector };
}

// Find siblings with matching "shape" — same direct-child tag sequence AND
// similar bounding-rect width (within 30% of ref). Class names are ignored
// entirely because frameworks generate too much noise.
function findShapeGroup(ref: Element, siblings: Element[]): Element[] {
  const refShape = shapeKey(ref);
  const refWidth = (ref as HTMLElement).offsetWidth || ref.getBoundingClientRect().width;

  return siblings.filter(s => {
    if (!isVisibleListItem(s)) return false;
    if (shapeKey(s) !== refShape) return false;
    if (refWidth > 0) {
      const w = (s as HTMLElement).offsetWidth || s.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - refWidth) / refWidth > 0.3) return false;
    }
    return true;
  });
}

// Shape = first 4 direct-child tag names joined. Purely structural, no classes.
function shapeKey(el: Element): string {
  return Array.from(el.children).slice(0, 4).map(c => c.tagName).join(',');
}

function avgRectArea(els: Element[]): number {
  let sum = 0;
  let n = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      sum += r.width * r.height;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

// Prefer tag+stable-class; fall back to just tag. We've already confirmed
// siblings match shape, so `parent > tag` is always at least good enough.
function buildItemSelector(parent: Element, item: Element): string {
  const parentSel = generateSelectorForElement(parent);
  const tag = item.tagName.toLowerCase();
  const classes = Array.from(item.classList).filter(c => !isUtilClass(c));
  if (classes.length > 0) {
    const sel = `${parentSel} > ${tag}${classes.map(c => `.${CSS.escape(c)}`).join('')}`;
    const matched = document.querySelectorAll(sel).length;
    if (matched >= 3) return sel;
  }
  return `${parentSel} > ${tag}`;
}

function showListDetectionUI(detection: ListDetection) {
  if (!containerOverlay || !tooltipEl) return;

  // Only consider items that are at least partially visible in the viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visibleItems = detection.items.filter(el => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.height > 0;
  });

  const itemsForBounds = visibleItems.length > 0 ? visibleItems : detection.items.slice(0, 5);
  const rects = itemsForBounds.map(el => el.getBoundingClientRect());

  // Clamp bounds to viewport
  const minLeft = Math.max(0, Math.min(...rects.map(r => r.left)));
  const minTop = Math.max(0, Math.min(...rects.map(r => r.top)));
  const maxRight = Math.min(vw, Math.max(...rects.map(r => r.right)));
  const maxBottom = Math.min(vh, Math.max(...rects.map(r => r.bottom)));

  const pad = 6;
  Object.assign(containerOverlay.style, {
    display: 'block',
    top: (minTop - pad) + 'px',
    left: (minLeft - pad) + 'px',
    width: (maxRight - minLeft + pad * 2) + 'px',
    height: (maxBottom - minTop + pad * 2) + 'px',
  });

  // Only highlight visible items
  showHoverItemHighlights(visibleItems.length > 0 ? visibleItems : detection.items.slice(0, 10));

  const count = detection.items.length;
  const visibleCount = visibleItems.length;
  const countLabel = visibleCount < count
    ? `${count} items (${visibleCount} visible)`
    : `${count} items`;
  tooltipEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:16px">👆</span><div><div>List with ${countLabel} found</div><div style="font-size:11px;font-weight:400;opacity:0.8">Click to select this list</div></div></div>`;

  const tooltipWidth = Math.min(320, tooltipEl.offsetWidth || 280);
  const containerCenterX = (minLeft + maxRight) / 2;
  let tooltipLeft = containerCenterX - tooltipWidth / 2;
  let tooltipTop = minTop - 70;

  if (tooltipTop < 8) tooltipTop = maxBottom + 12;
  if (tooltipLeft < 8) tooltipLeft = 8;
  if (tooltipLeft + tooltipWidth > window.innerWidth - 8) tooltipLeft = window.innerWidth - tooltipWidth - 8;

  Object.assign(tooltipEl.style, {
    display: 'block',
    top: tooltipTop + 'px',
    left: tooltipLeft + 'px',
  });
}

// ============ CLICK / SELECTION ============

function onPickerClick(e: MouseEvent) {
  if (!pickerActive) return;
  e.preventDefault();
  e.stopPropagation();

  const target = e.target as Element;
  if (isScrapeOverlay(target)) return;

  let selector: string;
  let similarSelector: string;
  let elements: Element[];
  let tagName: string;
  let className: string;

  if (cachedListDetection) {
    selector = cachedListDetection.selector;
    similarSelector = cachedListDetection.itemSelector;
    elements = cachedListDetection.items;
    tagName = elements[0]?.tagName.toLowerCase() || target.tagName.toLowerCase();
    className = (elements[0] as HTMLElement)?.className || '';
  } else {
    selector = generateSelectorForElement(target);
    const similar = findSimilarElements(target);
    similarSelector = similar.selector;
    elements = similar.elements;
    tagName = target.tagName.toLowerCase();
    className = target.className;
  }

  highlightSimilarElements(elements);

  const selection: ElementSelection = {
    selector,
    similarSelector,
    count: elements.length,
    preview: elements.slice(0, 5).map(el => (el as HTMLElement).innerText?.trim().slice(0, 100) || ''),
    tagName,
    className,
  };

  log.group('ELEMENT SELECTED');
  log.info('containerSelector:', selector);
  log.info('itemSelector:', similarSelector);
  log.info('count:', elements.length);
  log.info('tagName:', tagName);
  log.info('first item HTML (200 chars):', (elements[0] as HTMLElement)?.innerHTML?.slice(0, 200));
  log.info('first item innerText:', (elements[0] as HTMLElement)?.innerText?.trim().slice(0, 200));
  log.info('preview:', selection.preview);
  log.groupEnd();

  stopPicker();
  browser.runtime.sendMessage({ type: 'ELEMENT_SELECTED', payload: selection });
}

function onPickerKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopPicker();
    browser.runtime.sendMessage({ type: 'CANCEL_PICKER' });
  }
}

// ============ POST-CLICK HIGHLIGHTS (with rAF throttle) ============

function highlightSimilarElements(elements: Element[]) {
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    scrollListener = null;
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  similarHighlights.forEach(h => h.remove());
  similarHighlights = [];
  countBadges.forEach(b => b.remove());
  countBadges = [];
  trackedSimilarElements = elements;

  const total = elements.length;

  function updatePositions() {
    trackedSimilarElements.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (similarHighlights[i]) {
        positionOverlay(similarHighlights[i], rect);
      }
      if (countBadges[i]) {
        countBadges[i].style.top = (rect.top + 4) + 'px';
        countBadges[i].style.left = (rect.right - 36) + 'px';
      }
    });
  }

  elements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();

    const highlight = document.createElement('div');
    highlight.className = 'scrape-daddy-similar';
    positionOverlay(highlight, rect);
    document.body.appendChild(highlight);
    similarHighlights.push(highlight);

    const badge = document.createElement('div');
    badge.className = 'scrape-daddy-badge';
    badge.textContent = `${i + 1}/${total}`;
    badge.style.top = (rect.top + 4) + 'px';
    badge.style.left = (rect.right - 36) + 'px';
    document.body.appendChild(badge);
    countBadges.push(badge);
  });

  // Throttled scroll updates via requestAnimationFrame
  const throttledUpdate = () => {
    scrollRafId = requestAnimationFrame(() => {
      updatePositions();
      scrollRafId = null;
    });
  };

  scrollListener = throttledUpdate;
  window.addEventListener('scroll', throttledUpdate, { capture: true, passive: true });
}
