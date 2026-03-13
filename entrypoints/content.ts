import { Message, ElementSelection, ImageInfo, TextResult, StructuredDataResult, EmailEntry, LinkEntry, TableData } from '@/types';

// State
let pickerActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let containerOverlay: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let similarHighlights: HTMLDivElement[] = [];
let countBadges: HTMLDivElement[] = [];
let scrollListener: (() => void) | null = null;
let trackedSimilarElements: Element[] = [];
let scrolling = false;

// Smart list detection cache (used during hover)
let cachedListDetection: { container: Element; items: Element[]; selector: string; itemSelector: string } | null = null;
let lastHoverTarget: Element | null = null;
let hoverDebounceTimer: number | null = null;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for messages
    browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
      handleMessage(message).then(sendResponse);
      return true; // async response
    });
  },
});

async function handleMessage(message: Message): Promise<any> {
  switch (message.type) {
    case 'PING':
      return { status: 'ok' };

    case 'START_PICKER':
      startPicker();
      return { status: 'picker_started' };

    case 'CANCEL_PICKER':
      stopPicker();
      return { status: 'picker_cancelled' };

    case 'START_EXTRACTION':
      return extractListData(message.payload);

    case 'EXTRACT_EMAILS':
      return extractEmails();

    case 'EXTRACT_PHONES':
      return extractPhones();

    case 'EXTRACT_IMAGES':
      return extractImages(message.payload);

    case 'EXTRACT_TEXT':
      return extractMarkdown();

    case 'AUTO_DETECT_COLUMNS':
      return autoDetectColumns(message.payload.itemSelector);

    case 'START_AUTOSCROLL':
      return startAutoScroll(message.payload?.delay || 2000, message.payload?.maxScrolls || 50);

    case 'STOP_AUTOSCROLL':
      scrolling = false;
      return { status: 'stopped' };

    case 'EXTRACT_LINKS':
      return extractLinks();

    case 'EXTRACT_TABLES':
      return extractTables();

    case 'EXTRACT_STRUCTURED_DATA':
      return extractStructuredData();

    default:
      return { error: 'Unknown message type' };
  }
}

// ============ ELEMENT PICKER ============

function startPicker() {
  pickerActive = true;
  cachedListDetection = null;
  lastHoverTarget = null;
  document.addEventListener('mousemove', onPickerMouseMove, true);
  document.addEventListener('click', onPickerClick, true);
  document.addEventListener('keydown', onPickerKeyDown, true);
  document.body.style.cursor = 'crosshair';
  createHighlightOverlay();
  createContainerOverlay();
  createTooltip();
}

function stopPicker() {
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

function createHighlightOverlay() {
  if (highlightOverlay) return;
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = 'scrape-daddy-highlight';
  Object.assign(highlightOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '2px solid #f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: '4px',
    transition: 'all 0.1s ease',
    display: 'none',
  });
  document.body.appendChild(highlightOverlay);
}

function createContainerOverlay() {
  if (containerOverlay) return;
  containerOverlay = document.createElement('div');
  containerOverlay.id = 'scrape-daddy-container';
  Object.assign(containerOverlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483645',
    border: '3px dashed #f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderRadius: '6px',
    transition: 'all 0.15s ease',
    display: 'none',
  });
  document.body.appendChild(containerOverlay);
}

function createTooltip() {
  if (tooltipEl) return;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'scrape-daddy-tooltip';
  Object.assign(tooltipEl.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    backgroundColor: '#f59e0b',
    color: '#000',
    fontSize: '13px',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: '600',
    padding: '8px 14px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    display: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    lineHeight: '1.4',
  });
  document.body.appendChild(tooltipEl);
}

function removeHighlights() {
  // Clean up scroll listener
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    scrollListener = null;
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

// Lightweight highlights shown during hover (no badges, just dashed borders on items)
let hoverItemHighlights: HTMLDivElement[] = [];

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
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px dashed #d97706',
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderRadius: '4px',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    document.body.appendChild(highlight);
    hoverItemHighlights.push(highlight);
  });
}

function isScrapeOverlay(el: Element): boolean {
  const id = el.id || '';
  return id.startsWith('scrape-daddy-') || el.className === 'scrape-daddy-hover-item';
}

function onPickerMouseMove(e: MouseEvent) {
  if (!pickerActive || !highlightOverlay) return;
  const target = e.target as Element;
  if (isScrapeOverlay(target)) return;

  // Skip if we're still on the same element
  if (target === lastHoverTarget) return;
  lastHoverTarget = target;

  // Debounced list detection — runs 60ms after mouse settles on an element
  if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
  hoverDebounceTimer = window.setTimeout(() => {
    runListDetection(target);
  }, 60);

  // Immediate: show the single-element highlight (thin border, subtle)
  // If we already have a detected list and the target is inside it, skip the single highlight
  if (cachedListDetection && cachedListDetection.container.contains(target)) {
    highlightOverlay.style.display = 'none';
    return;
  }

  // No list detected yet for this area — show single element highlight
  const rect = target.getBoundingClientRect();
  Object.assign(highlightOverlay.style, {
    display: 'block',
    border: '2px solid #f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    top: rect.top + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  });

  // Hide container visuals when not in a detected list
  if (containerOverlay) containerOverlay.style.display = 'none';
  if (tooltipEl) tooltipEl.style.display = 'none';
  clearHoverItemHighlights();
  cachedListDetection = null;
}

function runListDetection(target: Element) {
  if (!pickerActive) return;

  // If target is still inside the cached container, no need to re-detect
  if (cachedListDetection && cachedListDetection.container.contains(target)) return;

  const detection = detectListFromElement(target);

  if (detection) {
    cachedListDetection = detection;
    highlightOverlay!.style.display = 'none';
    showListDetectionUI(detection);
  } else {
    // No list found — clear container UI, show single element
    cachedListDetection = null;
    if (containerOverlay) containerOverlay.style.display = 'none';
    if (tooltipEl) tooltipEl.style.display = 'none';
    clearHoverItemHighlights();

    // Show the single element highlight
    const rect = target.getBoundingClientRect();
    Object.assign(highlightOverlay!.style, {
      display: 'block',
      border: '2px solid #f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }
}

/**
 * Walk up from any element to detect if it's inside a repeating list pattern.
 * Returns the container element, its repeated children, and selectors.
 */
function detectListFromElement(element: Element): { container: Element; items: Element[]; selector: string; itemSelector: string } | null {
  let current: Element | null = element;
  let depth = 0;
  type ListDetection = { container: Element; items: Element[]; selector: string; itemSelector: string };
  let bestResult: ListDetection | null = null;

  while (current && current !== document.documentElement && depth < 8) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    // Never use body or html as a list container
    const parentTag = parent.tagName.toLowerCase();
    if (parentTag === 'body' || parentTag === 'html') break;

    // Try data-attribute detection first (most reliable)
    const dataResult = findByDataAttributes(current);
    if (dataResult && dataResult.elements.length >= 3) {
      const containerEl = current.parentElement;
      if (containerEl) {
        const items = dataResult.elements.filter((el: Element) => isVisibleListItem(el));
        if (items.length >= 3) {
          return { container: containerEl, items, selector: generateSelectorForElement(containerEl), itemSelector: dataResult.selector };
        }
      }
    }

    // Try ARIA role detection
    const ariaResult = findByAriaRoles(current);
    if (ariaResult && ariaResult.elements.length >= 3) {
      const containerEl = current.parentElement;
      if (containerEl) {
        const items = ariaResult.elements.filter((el: Element) => isVisibleListItem(el));
        if (items.length >= 3) {
          return { container: containerEl, items, selector: generateSelectorForElement(containerEl), itemSelector: ariaResult.selector };
        }
      }
    }

    // Structural similarity detection
    const currentTag = current.tagName;
    const sameTagSiblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);

    if (sameTagSiblings.length >= 3) {
      // Check structural similarity — compare child tag structure AND class fingerprints
      const structureKey = (el: Element) => {
        if (el.children.length === 0) return '';
        const childTags = Array.from(el.children).map((c: Element) => {
          const tag = c.tagName;
          // Include non-utility classes in the fingerprint for better discrimination
          const cls = Array.from(c.classList).filter((cl: string) => !isUtilClass(cl)).slice(0, 2).join('.');
          return cls ? `${tag}.${cls}` : tag;
        }).slice(0, 8).join(',');
        return childTags;
      };

      const refStructure = structureKey(current);
      // Skip if the reference has no children (empty/hidden elements)
      if (refStructure) {
        const structuralMatches = sameTagSiblings.filter((s: Element) => {
          const key = structureKey(s);
          return key === refStructure && isVisibleListItem(s);
        });

        if (structuralMatches.length >= 3 && structuralMatches.length >= sameTagSiblings.length * 0.5) {
          const tag = current.tagName.toLowerCase();
          const classes = Array.from(current.classList).filter((c: string) => !isUtilClass(c));
          const parentSel = generateSelectorForElement(parent);

          // Try class-scoped selector first
          if (classes.length > 0) {
            const classSel = classes.map((c: string) => `.${CSS.escape(c)}`).join('');
            const itemSel = `${parentSel} > ${tag}${classSel}`;
            const els = Array.from(document.querySelectorAll(itemSel)).filter((el: Element) => isVisibleListItem(el));
            if (els.length >= 3) {
              return { container: parent, items: els, selector: parentSel, itemSelector: itemSel };
            }
          }

          // Tag-only under parent
          const itemSel = `${parentSel} > ${tag}`;
          const els = Array.from(document.querySelectorAll(itemSel)).filter((el: Element) => isVisibleListItem(el));
          if (els.length >= 3) {
            return { container: parent, items: els, selector: parentSel, itemSelector: itemSel };
          }
        }
      }
    }

    current = parent;
    depth++;
  }

  return bestResult;
}

/** Check if an element is visible and has meaningful content (not hidden, not empty) */
function isVisibleListItem(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if ((el as HTMLElement).style?.display === 'none') return false;
  if ((el as HTMLElement).offsetHeight === 0 && (el as HTMLElement).offsetWidth === 0) return false;
  // Must have some child elements (real list items have structure)
  if (el.children.length === 0 && (el.textContent || '').trim().length === 0) return false;
  return true;
}

function showListDetectionUI(detection: { container: Element; items: Element[]; selector: string; itemSelector: string }) {
  if (!containerOverlay || !tooltipEl) return;

  // Compute bounding box of all items
  const rects = detection.items.map(el => el.getBoundingClientRect());
  const minLeft = Math.min(...rects.map(r => r.left));
  const minTop = Math.min(...rects.map(r => r.top));
  const maxRight = Math.max(...rects.map(r => r.right));
  const maxBottom = Math.max(...rects.map(r => r.bottom));

  const pad = 6;
  Object.assign(containerOverlay.style, {
    display: 'block',
    top: (minTop - pad) + 'px',
    left: (minLeft - pad) + 'px',
    width: (maxRight - minLeft + pad * 2) + 'px',
    height: (maxBottom - minTop + pad * 2) + 'px',
  });

  // Show item highlights
  showHoverItemHighlights(detection.items);

  // Tooltip — centered above the container
  const count = detection.items.length;
  tooltipEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:16px">👆</span><div><div>List with ${count} items found</div><div style="font-size:11px;font-weight:400;opacity:0.8">✨ Smart detection! Click to select this list</div></div></div>`;

  const tooltipWidth = Math.min(320, tooltipEl.offsetWidth || 280);
  const containerCenterX = (minLeft + maxRight) / 2;
  let tooltipLeft = containerCenterX - tooltipWidth / 2;
  let tooltipTop = minTop - 70;

  // Keep in viewport
  if (tooltipTop < 8) tooltipTop = maxBottom + 12;
  if (tooltipLeft < 8) tooltipLeft = 8;
  if (tooltipLeft + tooltipWidth > window.innerWidth - 8) tooltipLeft = window.innerWidth - tooltipWidth - 8;

  Object.assign(tooltipEl.style, {
    display: 'block',
    top: tooltipTop + 'px',
    left: tooltipLeft + 'px',
  });
}

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
    // Use the pre-detected list from hover
    selector = cachedListDetection.selector;
    similarSelector = cachedListDetection.itemSelector;
    elements = cachedListDetection.items;
    tagName = elements[0]?.tagName.toLowerCase() || target.tagName.toLowerCase();
    className = (elements[0] as HTMLElement)?.className || '';
  } else {
    // Fallback: no list was detected, use the old single-element logic
    selector = generateSelectorForElement(target);
    const similar = findSimilarElements(target);
    similarSelector = similar.selector;
    elements = similar.elements;
    tagName = target.tagName.toLowerCase();
    className = target.className;
  }

  // Highlight similar elements (post-click)
  highlightSimilarElements(elements);

  const selection: ElementSelection = {
    selector,
    similarSelector,
    count: elements.length,
    preview: elements.slice(0, 5).map(el => (el as HTMLElement).innerText?.trim().slice(0, 100) || ''),
    tagName,
    className,
  };

  stopPicker();
  browser.runtime.sendMessage({ type: 'ELEMENT_SELECTED', payload: selection });
}

function onPickerKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    stopPicker();
    browser.runtime.sendMessage({ type: 'CANCEL_PICKER' });
  }
}

function highlightSimilarElements(elements: Element[]) {
  // Clean up previous
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener, true);
    scrollListener = null;
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
        Object.assign(similarHighlights[i].style, {
          top: rect.top + 'px',
          left: rect.left + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
        });
      }
      if (countBadges[i]) {
        Object.assign(countBadges[i].style, {
          top: (rect.top + 4) + 'px',
          left: (rect.right - 36) + 'px',
        });
      }
    });
  }

  elements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();

    // Highlight div
    const highlight = document.createElement('div');
    Object.assign(highlight.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px dashed #d97706',
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderRadius: '4px',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
    document.body.appendChild(highlight);
    similarHighlights.push(highlight);

    // Count badge
    const badge = document.createElement('div');
    badge.textContent = `${i + 1}/${total}`;
    Object.assign(badge.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      backgroundColor: '#d97706',
      color: '#fff',
      fontSize: '10px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      padding: '1px 5px',
      borderRadius: '3px',
      lineHeight: '14px',
      top: (rect.top + 4) + 'px',
      left: (rect.right - 36) + 'px',
    });
    document.body.appendChild(badge);
    countBadges.push(badge);
  });

  // Update on scroll
  scrollListener = updatePositions;
  window.addEventListener('scroll', updatePositions, true);
}

// ============ SELECTOR GENERATION ============

function generateSelectorForElement(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    let seg = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const classes = Array.from(current.classList)
      .filter(c => !isUtilClass(c))
      .slice(0, 3);
    if (classes.length > 0) {
      seg += classes.map(c => `.${CSS.escape(c)}`).join('');
    } else {
      const parent = current.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(s => s.tagName === current!.tagName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
    }
    path.unshift(seg);
    current = current.parentElement;
  }
  return path.join(' > ');
}

function findSimilarElements(element: Element): { selector: string; elements: Element[] } {
  const parent = element.parentElement;
  if (!parent) return { selector: generateSelectorForElement(element), elements: [element] };

  const tag = element.tagName.toLowerCase();
  const parentTagLower = parent.tagName.toLowerCase();
  const classes = Array.from(element.classList).filter(c => !isUtilClass(c));

  // Never treat body > div or html > * as a list
  if (parentTagLower !== 'body' && parentTagLower !== 'html') {
    // Strategy 1: Same tag + meaningful classes under direct parent
    if (classes.length > 0) {
      const classSel = classes.map(c => `.${CSS.escape(c)}`).join('');
      const parentSel = generateSelectorForElement(parent);
      const sel = `${parentSel} > ${tag}${classSel}`;
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 1) return { selector: sel, elements: els };
    }

    // Strategy 1b: Same tag under direct parent
    {
      const parentSel = generateSelectorForElement(parent);
      const sel = `${parentSel} > ${tag}`;
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length > 1) return { selector: sel, elements: els };
    }
  }

  // Strategy 2: Walk up the tree looking for a "list container" pattern
  {
    const result = findListContainerMatch(element);
    if (result) return result;
  }

  // Strategy 3: data-* attribute matching
  {
    const result = findByDataAttributes(element);
    if (result) return result;
  }

  // Strategy 4: ARIA role matching
  {
    const result = findByAriaRoles(element);
    if (result) return result;
  }

  // Legacy fallback: go up one level
  const gp = parent.parentElement;
  if (gp) {
    const gpSel = generateSelectorForElement(gp);
    const pTag = parent.tagName.toLowerCase();
    const pClasses = Array.from(parent.classList).filter(c => !isUtilClass(c));
    let containerSel = pTag;
    if (pClasses.length > 0) containerSel += pClasses.map(c => `.${CSS.escape(c)}`).join('');
    const fullSel = `${gpSel} > ${containerSel}`;
    const containers = Array.from(document.querySelectorAll(fullSel));
    if (containers.length > 1) return { selector: fullSel, elements: containers };
  }

  return { selector: generateSelectorForElement(element), elements: [element] };
}

/**
 * Strategy 2: Walk up from the clicked element to find a list container.
 * A list container has 3+ children with the same tag name.
 * We find which ancestor of the clicked element is a repeated sibling, then return all such siblings.
 */
function findListContainerMatch(element: Element): { selector: string; elements: Element[] } | null {
  let current: Element | null = element;

  // Walk up the tree, at each level check if this element is a repeated sibling
  while (current && current !== document.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    // Never use body or html as a list container
    const pTag = parent.tagName.toLowerCase();
    if (pTag === 'body' || pTag === 'html') break;

    const currentTag = current.tagName;
    const sameTagSiblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);

    if (sameTagSiblings.length >= 3) {
      // Found a list container pattern — parent has 3+ children with the same tag
      const tag = current.tagName.toLowerCase();
      const currentClasses = Array.from(current.classList).filter(c => !isUtilClass(c));

      // Try to build a selector using meaningful classes that match all siblings
      if (currentClasses.length > 0) {
        const classSel = currentClasses.map(c => `.${CSS.escape(c)}`).join('');
        const parentSel = generateSelectorForElement(parent);
        const sel = `${parentSel} > ${tag}${classSel}`;
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length >= 3) return { selector: sel, elements: els };
      }

      // Fall back to tag-only under this parent
      const parentSel = generateSelectorForElement(parent);
      const sel = `${parentSel} > ${tag}`;
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length >= 3) return { selector: sel, elements: els };
    }

    current = parent;
  }

  return null;
}

/**
 * Strategy 3: Find similar elements using data-* attributes.
 * Many frameworks add data-testid, data-index, data-id, etc. for list items.
 */
function findByDataAttributes(element: Element): { selector: string; elements: Element[] } | null {
  const listDataAttrs = ['data-testid', 'data-index', 'data-id', 'data-key', 'data-item', 'data-item-id', 'data-row', 'data-product-id'];

  // Check the element itself and walk up
  let current: Element | null = element;
  let depth = 0;

  while (current && current !== document.documentElement && depth < 5) {
    const parent = current.parentElement;
    if (parent) {
      const tag = current.tagName.toLowerCase();

      // Check known list-item data attributes
      for (const attr of listDataAttrs) {
        if (current.hasAttribute(attr)) {
          const value = current.getAttribute(attr)!;

          // Check if siblings share the SAME attribute value (e.g., all data-testid="product-card")
          const siblingsWithSameValue = Array.from(parent.children).filter(
            (c: Element) => c.tagName === current!.tagName && c.getAttribute(attr) === value
          );
          if (siblingsWithSameValue.length >= 3) {
            const parentSel = generateSelectorForElement(parent);
            const sel = `${parentSel} > ${tag}[${attr}="${CSS.escape(value)}"]`;
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length >= 3) return { selector: sel, elements: els };
          }

          // Check if siblings have the same attribute but DIFFERENT values (e.g., data-id="123", data-id="456")
          const siblingsWithAttr = Array.from(parent.children).filter(
            (c: Element) => c.tagName === current!.tagName && c.hasAttribute(attr)
          );
          if (siblingsWithAttr.length >= 3) {
            const parentSel = generateSelectorForElement(parent);
            const sel = `${parentSel} > ${tag}[${attr}]`;
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length >= 3) return { selector: sel, elements: els };
          }
        }
      }

      // Check for any other data-* attribute that appears on sibling elements
      const attrs = Array.from(current.attributes)
        .filter(a => a.name.startsWith('data-') && !listDataAttrs.includes(a.name))
        .map(a => a.name);

      for (const attr of attrs) {
        const sibsWithAttr = Array.from(parent.children).filter(
          (c: Element) => c.tagName === current!.tagName && c.hasAttribute(attr)
        );
        if (sibsWithAttr.length >= 3) {
          const parentSel = generateSelectorForElement(parent);
          const sel = `${parentSel} > ${tag}[${attr}]`;
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length >= 3) return { selector: sel, elements: els };
        }
      }
    }

    current = current.parentElement;
    depth++;
  }

  return null;
}

/**
 * Strategy 4: Find similar elements using ARIA roles.
 * Elements with role="listitem", or inside role="list", role="grid", etc.
 */
function findByAriaRoles(element: Element): { selector: string; elements: Element[] } | null {
  const listItemRoles = ['listitem', 'row', 'gridcell', 'option', 'tab', 'treeitem', 'menuitem'];
  const listContainerRoles = ['list', 'grid', 'listbox', 'tablist', 'tree', 'menu', 'menubar', 'table', 'rowgroup'];

  // Check if the element itself has a list-item role
  let current: Element | null = element;
  let depth = 0;

  while (current && current !== document.documentElement && depth < 5) {
    const role = current.getAttribute('role');

    if (role && listItemRoles.includes(role)) {
      const sel = `[role="${role}"]`;
      // Scope to the nearest container
      const parent = current.parentElement;
      if (parent) {
        const parentRole = parent.getAttribute('role');
        if (parentRole && listContainerRoles.includes(parentRole)) {
          const parentSel = generateSelectorForElement(parent);
          const scopedSel = `${parentSel} > [role="${role}"]`;
          const els = Array.from(document.querySelectorAll(scopedSel));
          if (els.length > 1) return { selector: scopedSel, elements: els };
        }
        // Try unscoped
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 1) return { selector: sel, elements: els };
      }
    }

    // Check if we're inside a list container
    if (role && listContainerRoles.includes(role)) {
      // Get all direct children that share the same role or tag
      const children = Array.from(current.children);
      const childRoles = children.filter(c => {
        const r = c.getAttribute('role');
        return r && listItemRoles.includes(r);
      });
      if (childRoles.length > 1) {
        const childRole = childRoles[0].getAttribute('role')!;
        const containerSel = generateSelectorForElement(current);
        const sel = `${containerSel} > [role="${childRole}"]`;
        return { selector: sel, elements: childRoles };
      }
    }

    current = current.parentElement;
    depth++;
  }

  return null;
}

function isUtilClass(c: string): boolean {
  // Keep "group" standalone (used as structural marker on list items) but filter group-hover:, group-focus: etc.
  if (c === 'group' || c === 'peer') return false;
  return /^(w-|h-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|flex|grid|block|inline|hidden|text-|font-|bg-|border-|rounded|shadow|hover:|focus:|active:|disabled:|sm:|md:|lg:|xl:|2xl:|transition|duration-|ease-|absolute|relative|fixed|sticky|top-|right-|bottom-|left-|z-|overflow-|opacity-|cursor-|select-|from-|to-|via-|line-through|line-clamp-|underline|no-underline|overline|items-|justify-|self-|place-|gap-|space-|divide-|ring-|outline-|object-|aspect-|col-|row-|auto-|max-|min-|grow|shrink|basis-|order-|float-|clear-|table-|caption-|sr-only|not-sr-only|pointer-events-|resize|snap-|scroll-|touch-|will-|animate-|group-|peer-|whitespace-|break-|truncate|tracking-|leading-|decoration-|indent-|align-|content-|drop-shadow|filter|blur|brightness|contrast|grayscale|invert|saturate|sepia|backdrop-|transform|translate-|rotate-|scale-|skew-|origin-|accent-|caret-|fill-|stroke-|contain-|columns-)/.test(c);
}

// ============ LIST EXTRACTION ============

function extractListData(payload: { itemSelector: string; columns: { name: string; selector: string; attribute: string }[] }): any {
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

function autoDetectColumns(itemSelector: string): { name: string; selector: string; attribute: string }[] {
  const items = Array.from(document.querySelectorAll(itemSelector));
  if (items.length === 0) return [{ name: 'Text', selector: '', attribute: 'text' }];

  const firstItem = items[0];
  const detected: { name: string; selector: string; attribute: string; domIndex: number; priority: number }[] = [];
  const usedSelectors = new Set<string>();
  const capturedLinkEls = new Set<Element>();
  let domIndex = 0;

  function walkItem(el: Element, depth: number = 0) {
    const htmlEl = el as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Skip hidden elements
    if (htmlEl.offsetParent === null && tag !== 'img') return;

    // Image
    if (tag === 'img') {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Image', selector: sel, attribute: 'src', domIndex: domIndex++, priority: 1 });
      }
    }

    // Link — extract URL, but get text from the most specific child (heading or text node)
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

    // Heading — always capture, this is the title
    if (/^h[1-6]$/.test(tag)) {
      const sel = getRelativeSelector(firstItem, el);
      if (!usedSelectors.has(sel)) {
        usedSelectors.add(sel);
        detected.push({ name: 'Title', selector: sel, attribute: 'text', domIndex: domIndex++, priority: 2 });
      }
      return;
    }

    // Leaf text nodes — classify by content
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

    // Recurse into children
    if (tag !== 'img') {
      Array.from(el.children).forEach(c => walkItem(c, depth + 1));
    }
  }

  Array.from(firstItem.children).forEach(c => walkItem(c, 0));

  if (detected.length === 0) {
    return [{ name: 'Text', selector: '', attribute: 'text' }];
  }

  // Sort: by priority first (lower = more important), then by DOM order
  detected.sort((a, b) => a.priority - b.priority || a.domIndex - b.domIndex);

  // Deduplicate: remove columns that produce identical data across items
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
  const deduped = detected.filter((col, i) => {
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

  // Verify columns work across all items (at least 50% hit rate)
  const finalColumns = columns.filter(col => {
    const hits = items.filter(item => {
      const target = col.selector ? item.querySelector(col.selector) : item;
      return target !== null;
    }).length;
    return hits >= items.length * 0.5;
  });

  return finalColumns;
}

// Common button/action words that should NOT be treated as data
const ACTION_WORDS = new Set([
  'view', 'view details', 'view product', 'view more', 'read more',
  'buy', 'buy now', 'add', 'add to cart', 'add to bag', 'shop now',
  'learn more', 'details', 'quick view', 'quick shop', 'compare',
  'select', 'choose', 'order', 'order now', 'subscribe', 'remove',
  'edit', 'delete', 'save', 'cancel', 'close', 'share',
]);

function classifyTextContent(text: string, el: Element): { name: string; attribute: string; priority: number } | null {
  const lower = text.toLowerCase().trim();

  // Skip action/button text
  if (ACTION_WORDS.has(lower)) return null;

  // Also skip if the element looks like a button
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (tag === 'button' || role === 'button') return null;
  // Check parent — buttons often wrap spans
  const parent = el.parentElement;
  if (parent && (parent.tagName.toLowerCase() === 'button' || parent.getAttribute('role') === 'button')) return null;

  // Price patterns (multiple currencies, including prices like "$1,087")
  if (/^[\$£€¥₹]\s*[\d,.]+/.test(text) || /^[\d,.]+\s*[\$£€¥₹]/.test(text) || /^[\d,.]+\s*(USD|EUR|GBP|AUD|CAD|JPY|INR|NZD|kr|zł)/i.test(text)) {
    // Check for strikethrough/line-through — indicates original/was price
    const style = getComputedStyle(el as HTMLElement);
    const isStrikethrough = style.textDecoration.includes('line-through') || el.closest('s, strike, del') !== null;
    return { name: isStrikethrough ? 'Was Price' : 'Price', attribute: 'text', priority: 4 };
  }

  // Percentage / discount patterns
  if (/^\d+\s*%\s*(off|discount|save)/i.test(text) || /^-?\d+\s*%\s*(off)?$/i.test(text)) {
    return { name: 'Discount', attribute: 'text', priority: 5 };
  }

  // Rating patterns
  if (/^\d+(\.\d+)?\s*\/\s*5/.test(text) || /^[\d.]+\s*★/.test(text) || /^\(?\d+(\.\d+)?\)?\s*(stars?|reviews?|ratings?)/i.test(text)) {
    return { name: 'Rating', attribute: 'text', priority: 5 };
  }

  // Review count
  if (/^\(?\d[\d,]*\)?\s*(reviews?|ratings?|votes?)/i.test(text) || /^\(\d[\d,]*\)$/.test(text)) {
    return { name: 'Reviews', attribute: 'text', priority: 6 };
  }

  // Stock / availability
  if (/^(in stock|out of stock|available|sold out|limited|only \d+ left)/i.test(text)) {
    return { name: 'Availability', attribute: 'text', priority: 7 };
  }

  // Badge/label patterns
  if (/^(new|sale|hot|best seller|featured|popular|trending|free shipping|% off|\d+%\s*off)/i.test(text) && text.length <= 25) {
    return { name: 'Badge', attribute: 'text', priority: 6 };
  }

  // Short text classification
  if (text.length <= 20) {
    // Pure number — skip
    if (/^\d+$/.test(text)) return null;

    // All caps short text is likely a brand (e.g., "DELL", "HP", "ASUS")
    if (/^[A-Z][A-Z\s&.]+$/.test(text) && text.length <= 15) {
      return { name: 'Brand', attribute: 'text', priority: 3 };
    }

    // Short text with no digits — could be a category or label
    if (!/[\$£€¥₹]/.test(text) && !/^\d/.test(text)) {
      return { name: 'Label', attribute: 'text', priority: 6 };
    }
  }

  // Description-like: longer text blocks
  if (text.length > 80) {
    return { name: 'Description', attribute: 'text', priority: 5 };
  }

  // Medium-length text — specs, subtitle, etc.
  if (text.length > 20 && text.length <= 80) {
    return { name: 'Specs', attribute: 'text', priority: 5 };
  }

  // Short unclassified
  if (text.length > 0) {
    return { name: 'Text', attribute: 'text', priority: 6 };
  }

  return null;
}

function getRelativeSelector(parent: Element, child: Element): string {
  if (child === parent) return '';

  const tag = child.tagName.toLowerCase();
  const classes = Array.from(child.classList).filter(c => !isUtilClass(c)).slice(0, 2);

  if (classes.length > 0) {
    const sel = tag + classes.map(c => `.${CSS.escape(c)}`).join('');
    // Verify uniqueness within parent
    if (parent.querySelectorAll(sel).length === 1) return sel;
  }

  // Try tag only
  if (parent.querySelectorAll(tag).length === 1) return tag;

  // Use nth-of-type
  const siblings = parent.querySelectorAll(tag);
  const index = Array.from(siblings).indexOf(child) + 1;
  return `${tag}:nth-of-type(${index})`;
}

// ============ EMAIL EXTRACTION ============

function extractEmails(): any {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const seen = new Set<string>();
  const emails: Array<{ email: string; source: string; context: string }> = [];

  function getEmailContext(text: string, matchStart: number, matchEnd: number): string {
    const ctxStart = Math.max(0, matchStart - 40);
    const ctxEnd = Math.min(text.length, matchEnd + 40);
    let snippet = text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
    if (ctxStart > 0) snippet = '...' + snippet;
    if (ctxEnd < text.length) snippet = snippet + '...';
    return snippet;
  }

  // From mailto links
  document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const email = href.replace('mailto:', '').split('?')[0].toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      const linkText = (a as HTMLAnchorElement).innerText?.trim() || '';
      emails.push({ email, source: 'mailto', context: linkText || email });
    }
  });

  // From page text
  const text = document.body.innerText || '';
  let match: RegExpExecArray | null;
  emailRegex.lastIndex = 0;
  while ((match = emailRegex.exec(text)) !== null) {
    const email = match[0].toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      const context = getEmailContext(text, match.index, match.index + match[0].length);
      emails.push({ email, source: 'page-text', context });
    }
  }

  // From href attributes
  document.querySelectorAll('a[href]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const matches = href.match(emailRegex) || [];
    matches.forEach(e => {
      const email = e.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        const linkText = (a as HTMLAnchorElement).innerText?.trim() || '';
        emails.push({ email, source: 'href', context: linkText || href });
      }
    });
  });

  return { emails, url: window.location.href, timestamp: Date.now() };
}

// ============ PHONE EXTRACTION ============

function extractPhones(): any {
  // Strict phone regex patterns that require phone-like formatting:
  // 1. International format: +<country code> followed by separated digit groups
  // 2. Parenthesized area code: (123) 456-7890
  // 3. Separated digits: 123-456-7890 or 123.456.7890
  // Each pattern requires separators (dashes, dots, spaces) or parentheses to avoid matching
  // plain digit sequences like dates, zip codes, or product IDs.
  const phonePatterns = [
    // +international: +1 (555) 123-4567, +44 20 7123 4567, +1-800-555-0199
    /\+\d{1,4}[\s.-]?(?:\(?\d{1,5}\)?[\s.-]?)?\d{1,5}[\s.-]\d{1,5}(?:[\s.-]\d{1,5})?/g,
    // Parenthesized area code: (555) 123-4567, (020) 7123 4567
    /\(\d{2,5}\)[\s.-]?\d{1,5}[\s.-]\d{1,5}(?:[\s.-]\d{1,5})?/g,
    // Dash/dot/space-separated: 555-123-4567, 555.123.4567, 800 555 0199
    /(?<!\d)\d{1,5}[-.]\d{1,5}[-.]\d{1,5}(?:[-.]\d{1,5})?(?!\d)/g,
  ];

  // Patterns to reject: years (1900-2099), short sequences, pure digit runs
  const yearPattern = /^(19|20)\d{2}$/;

  function isValidPhone(candidate: string): boolean {
    const digitsOnly = candidate.replace(/\D/g, '');
    // Must have 7-15 digits
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
    // Reject year-like 4-digit sequences standing alone
    if (yearPattern.test(digitsOnly)) return false;
    // Reject if no separators/formatting at all and doesn't start with +
    const hasSeparators = /[().\-\s]/.test(candidate);
    const hasPlus = candidate.startsWith('+');
    if (!hasSeparators && !hasPlus) return false;
    // Reject sequences that look like dates (e.g. 2024-03-12 matched partially)
    if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(candidate)) return false;
    return true;
  }

  function getContext(text: string, matchStart: number, matchEnd: number): string {
    const ctxStart = Math.max(0, matchStart - 40);
    const ctxEnd = Math.min(text.length, matchEnd + 40);
    let snippet = text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
    if (ctxStart > 0) snippet = '...' + snippet;
    if (ctxEnd < text.length) snippet = snippet + '...';
    return snippet;
  }

  const phones: Array<{ number: string; source: string; context: string }> = [];
  const seen = new Set<string>();

  // From tel: links
  document.querySelectorAll('a[href^="tel:"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const phone = href.replace('tel:', '').trim();
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (!seen.has(digits)) {
        seen.add(digits);
        phones.push({ number: phone, source: 'tel-link', context: '' });
      }
    }
  });

  // From page text using strict patterns
  const text = document.body.innerText || '';
  for (const pattern of phonePatterns) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for each pattern
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[0].trim();
      if (!isValidPhone(candidate)) continue;
      const digits = candidate.replace(/\D/g, '');
      if (seen.has(digits)) continue;
      seen.add(digits);
      const context = getContext(text, match.index, match.index + match[0].length);
      phones.push({ number: candidate, source: 'page-text', context });
    }
  }

  return { phones, url: window.location.href, timestamp: Date.now() };
}

// ============ IMAGE EXTRACTION ============

function extractImages(payload?: { minWidth?: number; minHeight?: number }): any {
  const minW = payload?.minWidth || 0;
  const minH = payload?.minHeight || 0;
  const images: ImageInfo[] = [];
  const seen = new Set<string>();

  // From img tags
  document.querySelectorAll('img').forEach(img => {
    // Try multiple src attributes (lazy-loading patterns)
    const src = img.src || img.dataset.src || img.dataset.lazySrc || img.dataset.original || '';
    if (!src || seen.has(src)) return;
    seen.add(src);

    // Also grab highest-res from srcset if available
    const srcset = img.getAttribute('srcset') || img.dataset.srcset || '';
    let bestSrc = src;
    if (srcset) {
      const candidates = srcset.split(',').map(s => s.trim().split(/\s+/));
      let bestWidth = 0;
      for (const parts of candidates) {
        const url = parts[0];
        const descriptor = parts[1] || '';
        const w = parseInt(descriptor) || 0;
        if (w > bestWidth && url) {
          bestWidth = w;
          bestSrc = url;
        }
      }
      // Resolve relative URL
      try { bestSrc = new URL(bestSrc, window.location.href).href; } catch {}
    }

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w >= minW && h >= minH) {
      images.push({
        src: bestSrc,
        alt: img.alt || '',
        width: w,
        height: h,
        type: getImageType(bestSrc),
        source: 'img-tag',
      });
    }
  });

  // From background images — scan only elements likely to carry meaningful backgrounds
  document.querySelectorAll('div, section, figure, span, a, header, aside, article, li').forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        const htmlEl = el as HTMLElement;
        const w = htmlEl.offsetWidth || 0;
        const h = htmlEl.offsetHeight || 0;
        if (w >= minW && h >= minH) {
          images.push({ src: match[1], alt: '', width: w, height: h, type: getImageType(match[1]), source: 'background' });
        }
      }
    }
  });

  return { images, url: window.location.href, timestamp: Date.now() };
}

function getImageType(src: string): string {
  const ext = src.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) return ext;
  return 'unknown';
}

// ============ TEXT EXTRACTION ============

function extractMarkdown(): TextResult {
  const title = document.title || '';
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, nav, footer, header, [role="navigation"], [role="banner"], noscript, iframe').forEach(el => el.remove());

  function convertNode(node: Node, depth: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.replace(/\s+/g, ' ') || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Skip hidden elements
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1]);
        const text = el.innerText?.trim();
        if (!text) return '';
        return '\n\n' + '#'.repeat(level) + ' ' + text + '\n\n';
      }

      case 'p': {
        const inner = convertChildren(el, depth).trim();
        if (!inner) return '';
        return '\n\n' + inner + '\n\n';
      }

      case 'a': {
        const href = el.getAttribute('href') || '';
        const text = convertChildren(el, depth).trim();
        if (!text || href.startsWith('#')) return text;
        // Make relative URLs absolute
        try {
          const absoluteHref = new URL(href, window.location.href).href;
          return '[' + text + '](' + absoluteHref + ')';
        } catch {
          return '[' + text + '](' + href + ')';
        }
      }

      case 'img': {
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src') || '';
        if (!src) return '';
        try {
          const absoluteSrc = new URL(src, window.location.href).href;
          return '![' + alt + '](' + absoluteSrc + ')';
        } catch {
          return '![' + alt + '](' + src + ')';
        }
      }

      case 'strong': case 'b': {
        const text = convertChildren(el, depth).trim();
        return text ? '**' + text + '**' : '';
      }

      case 'em': case 'i': {
        const text = convertChildren(el, depth).trim();
        return text ? '*' + text + '*' : '';
      }

      case 'code': {
        // If inside a <pre>, don't wrap again
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return el.innerText || '';
        }
        const text = el.innerText?.trim() || '';
        return text ? '`' + text + '`' : '';
      }

      case 'pre': {
        const code = el.innerText?.trim() || '';
        if (!code) return '';
        return '\n\n```\n' + code + '\n```\n\n';
      }

      case 'ul': {
        return convertList(el, '-', depth);
      }

      case 'ol': {
        return convertList(el, 'ol', depth);
      }

      case 'li': {
        // Handled by ul/ol parent, but if standalone
        return convertChildren(el, depth);
      }

      case 'blockquote': {
        const inner = convertChildren(el, depth).trim();
        if (!inner) return '';
        const quoted = inner.split('\n').map(line => '> ' + line).join('\n');
        return '\n\n' + quoted + '\n\n';
      }

      case 'table': {
        return convertTable(el);
      }

      case 'br': {
        return '\n';
      }

      case 'hr': {
        return '\n\n---\n\n';
      }

      default: {
        return convertChildren(el, depth);
      }
    }
  }

  function convertChildren(el: HTMLElement, depth: number = 0): string {
    let result = '';
    for (const child of Array.from(el.childNodes)) {
      result += convertNode(child, depth);
    }
    return result;
  }

  function convertList(el: HTMLElement, marker: string, depth: number): string {
    const indent = '  '.repeat(depth);
    const items: string[] = [];
    let idx = 0;
    Array.from(el.children).forEach(child => {
      const tag = child.tagName.toLowerCase();
      if (tag === 'li') {
        idx++;
        const prefix = marker === 'ol' ? `${idx}. ` : '- ';
        // Separate text content from nested lists
        let textParts = '';
        let nestedLists = '';
        Array.from(child.childNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const childTag = (node as HTMLElement).tagName.toLowerCase();
            if (childTag === 'ul' || childTag === 'ol') {
              nestedLists += convertNode(node, depth + 1);
              return;
            }
          }
          textParts += convertNode(node, depth + 1);
        });
        const text = textParts.trim();
        if (text) {
          items.push(indent + prefix + text);
        }
        if (nestedLists) {
          items.push(nestedLists.replace(/^\n+|\n+$/g, ''));
        }
      }
    });
    if (!items.length) return '';
    return (depth === 0 ? '\n\n' : '\n') + items.join('\n') + (depth === 0 ? '\n\n' : '');
  }

  function convertTable(table: HTMLElement): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    const matrix: string[][] = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      matrix.push(cells.map(c => (c as HTMLElement).innerText?.trim().replace(/\|/g, '\\|') || ''));
    }

    if (!matrix.length) return '';

    const colCount = Math.max(...matrix.map(r => r.length));
    // Pad rows to same length
    for (const row of matrix) {
      while (row.length < colCount) row.push('');
    }

    let md = '\n\n';
    // First row as header
    md += '| ' + matrix[0].join(' | ') + ' |\n';
    md += '| ' + matrix[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < matrix.length; i++) {
      md += '| ' + matrix[i].join(' | ') + ' |\n';
    }
    md += '\n';
    return md;
  }

  let markdown = convertChildren(clone);

  // Clean up excessive whitespace
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  // Prepend title as H1 if present
  if (title) {
    markdown = '# ' + title + '\n\n' + markdown;
  }

  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;

  return {
    markdown,
    title,
    url: window.location.href,
    timestamp: Date.now(),
    wordCount,
  };
}

// ============ LINK EXTRACTION ============

function extractLinks(): any {
  const pageUrl = window.location.href;
  const pageHost = window.location.hostname;
  const seen = new Set<string>();
  const links: LinkEntry[] = [];

  const socialDomains = [
    'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
    'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'github.com',
    'discord.gg', 'discord.com', 'threads.net', 'mastodon.social', 'bsky.app',
  ];

  const fileExts = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar',
    'gz', 'tar', 'csv', 'json', 'xml', 'txt', 'mp3', 'mp4', 'avi', 'mov',
  ];

  function classifyLink(href: string): LinkEntry['type'] {
    if (href.startsWith('mailto:')) return 'email';
    if (href.startsWith('tel:')) return 'phone';
    try {
      const url = new URL(href, pageUrl);
      const ext = url.pathname.split('.').pop()?.toLowerCase() || '';
      if (fileExts.includes(ext)) return 'file';
      if (socialDomains.some(d => url.hostname.includes(d))) return 'social';
      if (url.hostname === pageHost) return 'internal';
      return 'external';
    } catch {
      return 'other';
    }
  }

  document.querySelectorAll('a[href]').forEach(a => {
    const anchor = a as HTMLAnchorElement;
    let href = anchor.getAttribute('href') || '';
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    // Resolve relative URLs
    try {
      href = new URL(href, pageUrl).href;
    } catch {
      return;
    }

    if (seen.has(href)) return;
    seen.add(href);

    const text = anchor.innerText?.trim().replace(/\s+/g, ' ').slice(0, 120) || '';
    const type = classifyLink(href);

    // Get context: parent text
    const parent = anchor.parentElement;
    let context = '';
    if (parent) {
      const parentText = parent.innerText?.trim().replace(/\s+/g, ' ') || '';
      if (parentText.length > text.length) {
        context = parentText.slice(0, 150);
      }
    }

    links.push({ url: href, text, type, context });
  });

  return { links, url: pageUrl, timestamp: Date.now() };
}

// ============ TABLE EXTRACTION ============

function extractTables(): any {
  const tables: TableData[] = [];

  document.querySelectorAll('table').forEach((table, index) => {
    const caption = table.querySelector('caption')?.innerText?.trim() || '';
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Detect headers
    let headers: string[] = [];
    let dataStartIdx = 0;

    // Try thead first
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        headers = Array.from(headerRow.querySelectorAll('th, td')).map(
          c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
        );
        dataStartIdx = 0;
        // Find where tbody rows start
        const tbody = table.querySelector('tbody');
        const allRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : rows.slice(1);
        const dataRows = allRows.map(row =>
          Array.from(row.querySelectorAll('th, td')).map(
            c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
          )
        );

        if (headers.length > 0 || dataRows.length > 0) {
          // Pad to consistent column count
          const colCount = Math.max(headers.length, ...dataRows.map(r => r.length));
          while (headers.length < colCount) headers.push('');
          for (const row of dataRows) {
            while (row.length < colCount) row.push('');
          }
          tables.push({ headers, rows: dataRows, caption, index });
        }
        return;
      }
    }

    // No thead — first row with th elements or first row as header
    const firstRow = rows[0];
    const firstCells = Array.from(firstRow.querySelectorAll('th, td'));
    const hasThElements = firstCells.some(c => c.tagName.toLowerCase() === 'th');

    if (hasThElements || rows.length > 1) {
      headers = firstCells.map(c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || '');
      dataStartIdx = 1;
    } else {
      // Single row table, use Column 1, Column 2... headers
      const colCount = firstCells.length;
      headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
      dataStartIdx = 0;
    }

    const dataRows = rows.slice(dataStartIdx).map(row =>
      Array.from(row.querySelectorAll('th, td')).map(
        c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
      )
    );

    // Skip empty tables
    if (dataRows.length === 0 && headers.every(h => !h)) return;

    const colCount = Math.max(headers.length, ...dataRows.map(r => r.length));
    while (headers.length < colCount) headers.push('');
    for (const row of dataRows) {
      while (row.length < colCount) row.push('');
    }

    tables.push({ headers, rows: dataRows, caption, index });
  });

  return { tables, url: window.location.href, timestamp: Date.now() };
}

// ============ STRUCTURED DATA EXTRACTION ============

function extractStructuredData(): StructuredDataResult {
  // 1. JSON-LD
  const jsonLd: any[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const parsed = JSON.parse(script.textContent || '');
      if (Array.isArray(parsed)) {
        jsonLd.push(...parsed);
      } else {
        jsonLd.push(parsed);
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  // 2. OpenGraph
  const openGraph: Record<string, string> = {};
  document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
    const property = meta.getAttribute('property') || '';
    const content = meta.getAttribute('content') || '';
    if (property) openGraph[property] = content;
  });

  // 3. Twitter Cards
  const twitterCard: Record<string, string> = {};
  document.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach(meta => {
    const key = meta.getAttribute('name') || meta.getAttribute('property') || '';
    const content = meta.getAttribute('content') || '';
    if (key) twitterCard[key] = content;
  });

  // 4. Standard Meta
  const meta: Record<string, string> = {};
  meta['title'] = document.title || '';

  const descriptionEl = document.querySelector('meta[name="description"]');
  if (descriptionEl) meta['description'] = descriptionEl.getAttribute('content') || '';

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) meta['canonical'] = canonicalEl.getAttribute('href') || '';

  const authorEl = document.querySelector('meta[name="author"]');
  if (authorEl) meta['author'] = authorEl.getAttribute('content') || '';

  const robotsEl = document.querySelector('meta[name="robots"]');
  if (robotsEl) meta['robots'] = robotsEl.getAttribute('content') || '';

  const viewportEl = document.querySelector('meta[name="viewport"]');
  if (viewportEl) meta['viewport'] = viewportEl.getAttribute('content') || '';

  const charsetEl = document.querySelector('meta[charset]');
  if (charsetEl) meta['charset'] = charsetEl.getAttribute('charset') || '';

  const lang = document.documentElement.getAttribute('lang');
  if (lang) meta['language'] = lang;

  const themeColorEl = document.querySelector('meta[name="theme-color"]');
  if (themeColorEl) meta['theme-color'] = themeColorEl.getAttribute('content') || '';

  const keywordsEl = document.querySelector('meta[name="keywords"]');
  if (keywordsEl) meta['keywords'] = keywordsEl.getAttribute('content') || '';

  const generatorEl = document.querySelector('meta[name="generator"]');
  if (generatorEl) meta['generator'] = generatorEl.getAttribute('content') || '';

  // Favicon
  const faviconEl = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (faviconEl) meta['favicon'] = faviconEl.getAttribute('href') || '';

  // 5. Schema.org Microdata
  const microdata: Array<{ type: string; properties: Record<string, string> }> = [];
  document.querySelectorAll('[itemscope][itemtype]').forEach(el => {
    // Only extract top-level itemscope elements (not nested ones)
    if (el.closest('[itemscope]') !== el && el.parentElement?.closest('[itemscope]')) return;

    const type = el.getAttribute('itemtype') || '';
    const properties: Record<string, string> = {};

    el.querySelectorAll('[itemprop]').forEach(prop => {
      const name = prop.getAttribute('itemprop') || '';
      if (!name) return;
      // Get value from content attribute, href, src, or text content
      const value =
        prop.getAttribute('content') ||
        prop.getAttribute('href') ||
        prop.getAttribute('src') ||
        (prop as HTMLElement).innerText?.trim() ||
        '';
      properties[name] = value;
    });

    microdata.push({ type, properties });
  });

  return {
    jsonLd,
    openGraph,
    twitterCard,
    meta,
    microdata,
    url: window.location.href,
    timestamp: Date.now(),
  };
}

// ============ AUTO-SCROLL ============

async function startAutoScroll(delay: number, maxScrolls: number): Promise<{ status: string; scrollCount: number }> {
  scrolling = true;
  let scrollCount = 0;
  let lastHeight = document.documentElement.scrollHeight;

  while (scrolling && scrollCount < maxScrolls) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    await sleep(delay);

    const newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight) {
      // Try clicking "load more" buttons
      const loadMoreClicked = tryClickLoadMore();
      if (!loadMoreClicked) break;
      await sleep(delay);
    }
    lastHeight = document.documentElement.scrollHeight;
    scrollCount++;

    browser.runtime.sendMessage({
      type: 'AUTOSCROLL_STATUS',
      payload: { scrollCount, scrolling, height: newHeight },
    });
  }

  scrolling = false;
  return { status: 'complete', scrollCount };
}

function tryClickLoadMore(): boolean {
  const patterns = [
    'load more', 'show more', 'see more', 'view more',
    'load more results', 'show more results',
    'next', 'more',
  ];

  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  for (const btn of buttons) {
    const text = (btn as HTMLElement).innerText?.trim().toLowerCase() || '';
    if (patterns.some(p => text === p || text.startsWith(p))) {
      (btn as HTMLElement).click();
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
