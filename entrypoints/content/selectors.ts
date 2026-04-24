// ============ UTILITY CLASS DETECTION ============

// Precomputed set of Tailwind utility prefixes for fast lookup
const UTIL_PREFIXES = [
  'w-', 'h-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
  'flex', 'grid', 'block', 'inline', 'hidden',
  'text-', 'font-', 'bg-', 'border-', 'rounded', 'shadow',
  'hover:', 'focus:', 'active:', 'disabled:',
  'sm:', 'md:', 'lg:', 'xl:', '2xl:',
  'transition', 'duration-', 'ease-',
  'absolute', 'relative', 'fixed', 'sticky',
  'top-', 'right-', 'bottom-', 'left-', 'z-',
  'overflow-', 'opacity-', 'cursor-', 'select-',
  'from-', 'to-', 'via-',
  'line-through', 'line-clamp-', 'underline', 'no-underline', 'overline',
  'items-', 'justify-', 'self-', 'place-', 'gap-', 'space-', 'divide-',
  'ring-', 'outline-', 'object-', 'aspect-',
  'col-', 'row-', 'auto-', 'max-', 'min-',
  'grow', 'shrink', 'basis-', 'order-',
  'float-', 'clear-', 'table-', 'caption-',
  'sr-only', 'not-sr-only',
  'pointer-events-', 'resize', 'snap-', 'scroll-', 'touch-',
  'will-', 'animate-', 'group-', 'peer-',
  'whitespace-', 'break-', 'truncate',
  'tracking-', 'leading-', 'decoration-', 'indent-', 'align-',
  'content-', 'drop-shadow', 'filter', 'blur', 'brightness',
  'contrast', 'grayscale', 'invert', 'saturate', 'sepia',
  'backdrop-', 'transform', 'translate-', 'rotate-', 'scale-', 'skew-', 'origin-',
  'accent-', 'caret-', 'fill-', 'stroke-', 'contain-', 'columns-',
];

// Exact-match utility classes
const UTIL_EXACT = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden',
  'absolute', 'relative', 'fixed', 'sticky',
  'transition', 'rounded', 'shadow',
  'underline', 'no-underline', 'overline', 'line-through',
  'truncate', 'grow', 'shrink', 'resize',
  'sr-only', 'not-sr-only',
  'filter', 'blur', 'brightness', 'contrast', 'grayscale',
  'invert', 'saturate', 'sepia', 'transform',
  'drop-shadow',
]);

export function isUtilClass(c: string): boolean {
  // Keep "group" and "peer" standalone (structural markers on list items)
  if (c === 'group' || c === 'peer') return false;
  // Keep BEM classes (semantic: block__element--modifier)
  if (c.includes('__') || c.includes('--')) return false;
  if (UTIL_EXACT.has(c)) return true;
  for (const prefix of UTIL_PREFIXES) {
    if (c.startsWith(prefix) && c !== prefix) return true;
  }
  // CSS Modules / auto-generated hashes (e.g., _1a2bCd, css-1abc2d)
  if (/^_[a-zA-Z0-9]{5,}$/.test(c)) return true;
  if (/^css-[a-z0-9]+$/i.test(c)) return true;
  // Bootstrap utility classes
  if (/^(d|btn|col|row|form|nav|list|card|alert|badge|modal|container|offset)-/i.test(c)) return true;
  return false;
}

// ============ SELECTOR GENERATION ============

export function generateSelectorForElement(element: Element): string {
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

export function getRelativeSelector(parent: Element, child: Element): string {
  if (child === parent) return '';

  const tag = child.tagName.toLowerCase();
  const classes = Array.from(child.classList).filter(c => !isUtilClass(c)).slice(0, 2);

  // Try direct class-based match first (shortest possible)
  if (classes.length > 0) {
    const sel = tag + classes.map(c => `.${CSS.escape(c)}`).join('');
    if (parent.querySelectorAll(sel).length === 1) return sel;
  }

  // Try unique tag
  if (parent.querySelectorAll(tag).length === 1) return tag;

  // Build a path from child up to parent, checking uniqueness at each step
  const pathParts: string[] = [];
  let current: Element | null = child;
  const maxDepth = 5; // Cap path depth for stability
  let depth = 0;

  while (current && current !== parent && depth < maxDepth) {
    const curTag = current.tagName.toLowerCase();
    const curClasses = Array.from(current.classList).filter(c => !isUtilClass(c)).slice(0, 2);
    let seg = curTag;

    if (curClasses.length > 0) {
      seg += curClasses.map(c => `.${CSS.escape(c)}`).join('');
    } else {
      // Use nth-of-type among direct siblings only
      const directParent = current.parentElement;
      if (directParent) {
        const sibs = Array.from(directParent.children).filter(c => c.tagName === current!.tagName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(current) + 1;
          seg += `:nth-of-type(${idx})`;
        }
      }
    }

    pathParts.unshift(seg);

    // Check if the partial path is already unique
    const partialSel = pathParts.join(' > ');
    if (parent.querySelectorAll(partialSel).length === 1) {
      // Try to shorten: check if a suffix of the path is also unique
      for (let start = 1; start < pathParts.length; start++) {
        const shorter = pathParts.slice(start).join(' > ');
        if (parent.querySelectorAll(shorter).length === 1) return shorter;
      }
      return partialSel;
    }

    current = current.parentElement;
    depth++;
  }

  // Fallback: use descendant selector instead of child combinator for flexibility
  const fullPath = pathParts.join(' > ');
  if (parent.querySelectorAll(fullPath).length === 1) return fullPath;

  // Last resort: nth-of-type on the child tag across all descendants
  const allOfTag = parent.querySelectorAll(tag);
  const idx = Array.from(allOfTag).indexOf(child) + 1;
  if (idx > 0) return `${tag}:nth-of-type(${idx})`;

  return fullPath;
}

// ============ SIMILAR ELEMENT DETECTION ============

export interface SimilarResult {
  selector: string;
  elements: Element[];
}

export function findSimilarElements(element: Element): SimilarResult {
  const parent = element.parentElement;
  if (!parent) return { selector: generateSelectorForElement(element), elements: [element] };

  const tag = element.tagName.toLowerCase();
  const parentTagLower = parent.tagName.toLowerCase();
  const classes = Array.from(element.classList).filter(c => !isUtilClass(c));

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

  // Strategy 2: Walk up for list container
  {
    const result = findListContainerMatch(element);
    if (result) return result;
  }

  // Strategy 3: data-* attributes
  {
    const result = findByDataAttributes(element);
    if (result) return result;
  }

  // Strategy 4: ARIA roles
  {
    const result = findByAriaRoles(element);
    if (result) return result;
  }

  // Legacy fallback
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

function findListContainerMatch(element: Element): SimilarResult | null {
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const pTag = parent.tagName.toLowerCase();
    if (pTag === 'body' || pTag === 'html') break;

    const currentTag = current.tagName;
    const sameTagSiblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);

    if (sameTagSiblings.length >= 3) {
      const tag = current.tagName.toLowerCase();
      const currentClasses = Array.from(current.classList).filter(c => !isUtilClass(c));

      if (currentClasses.length > 0) {
        const classSel = currentClasses.map(c => `.${CSS.escape(c)}`).join('');
        const parentSel = generateSelectorForElement(parent);
        const sel = `${parentSel} > ${tag}${classSel}`;
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length >= 3) return { selector: sel, elements: els };
      }

      const parentSel = generateSelectorForElement(parent);
      const sel = `${parentSel} > ${tag}`;
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length >= 3) return { selector: sel, elements: els };
    }

    current = parent;
  }

  return null;
}

export function findByDataAttributes(element: Element): SimilarResult | null {
  const listDataAttrs = ['data-testid', 'data-index', 'data-id', 'data-key', 'data-item', 'data-item-id', 'data-row', 'data-product-id'];

  let current: Element | null = element;
  let depth = 0;

  while (current && current !== document.documentElement && depth < 5) {
    const parent = current.parentElement;
    if (parent) {
      const tag = current.tagName.toLowerCase();

      for (const attr of listDataAttrs) {
        if (current.hasAttribute(attr)) {
          const value = current.getAttribute(attr)!;

          const siblingsWithSameValue = Array.from(parent.children).filter(
            (c: Element) => c.tagName === current!.tagName && c.getAttribute(attr) === value
          );
          if (siblingsWithSameValue.length >= 3) {
            const parentSel = generateSelectorForElement(parent);
            const sel = `${parentSel} > ${tag}[${attr}="${CSS.escape(value)}"]`;
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length >= 3) return { selector: sel, elements: els };
          }

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

export function findByAriaRoles(element: Element): SimilarResult | null {
  const listItemRoles = ['listitem', 'row', 'gridcell', 'option', 'tab', 'treeitem', 'menuitem'];
  const listContainerRoles = ['list', 'grid', 'listbox', 'tablist', 'tree', 'menu', 'menubar', 'table', 'rowgroup'];

  let current: Element | null = element;
  let depth = 0;

  while (current && current !== document.documentElement && depth < 5) {
    const role = current.getAttribute('role');

    if (role && listItemRoles.includes(role)) {
      const sel = `[role="${role}"]`;
      const parent = current.parentElement;
      if (parent) {
        const parentRole = parent.getAttribute('role');
        if (parentRole && listContainerRoles.includes(parentRole)) {
          const parentSel = generateSelectorForElement(parent);
          const scopedSel = `${parentSel} > [role="${role}"]`;
          const els = Array.from(document.querySelectorAll(scopedSel));
          if (els.length > 1) return { selector: scopedSel, elements: els };
        }
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 1) return { selector: sel, elements: els };
      }
    }

    if (role && listContainerRoles.includes(role)) {
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

export function isVisibleListItem(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if ((el as HTMLElement).style?.display === 'none') return false;
  if ((el as HTMLElement).offsetHeight === 0 && (el as HTMLElement).offsetWidth === 0) return false;
  if (el.children.length === 0 && (el.textContent || '').trim().length === 0) return false;
  return true;
}
