// ============ UTILITY CLASS DETECTION ============
// Trimmed set — prefixes that cover Tailwind / Bootstrap / CSS-in-JS hashes.
// Keep BEM (foo__bar, foo--baz) and standalone "group"/"peer" markers.

const UTIL_PREFIXES = [
  'w-', 'h-', 'min-', 'max-',
  'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
  'text-', 'font-', 'leading-', 'tracking-',
  'bg-', 'border-', 'rounded-', 'shadow-', 'ring-', 'outline-',
  'flex-', 'grid-', 'col-', 'row-', 'gap-', 'space-', 'items-', 'justify-', 'self-', 'place-',
  'hover:', 'focus:', 'active:', 'disabled:', 'group-', 'peer-',
  'sm:', 'md:', 'lg:', 'xl:', '2xl:',
  'top-', 'right-', 'bottom-', 'left-', 'z-', 'inset-',
  'overflow-', 'opacity-', 'cursor-', 'select-', 'pointer-events-',
  'transition', 'duration-', 'ease-', 'animate-',
  'translate-', 'rotate-', 'scale-', 'skew-', 'origin-',
  'object-', 'aspect-',
  'd-', 'btn-', 'card-', 'alert-', 'badge-', 'modal-', 'container-', // Bootstrap
];

const UTIL_EXACT = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden',
  'absolute', 'relative', 'fixed', 'sticky', 'static',
  'transition', 'rounded', 'shadow', 'border',
  'underline', 'no-underline', 'line-through', 'truncate',
  'sr-only', 'not-sr-only', 'transform',
]);

export function isUtilClass(c: string): boolean {
  if (c === 'group' || c === 'peer') return false;
  if (c.includes('__') || c.includes('--')) return false; // BEM
  if (UTIL_EXACT.has(c)) return true;
  if (/^_[a-zA-Z0-9]{5,}$/.test(c)) return true; // CSS Modules
  if (/^css-[a-z0-9]+$/i.test(c)) return true; // emotion / styled-components
  for (const prefix of UTIL_PREFIXES) {
    if (c.startsWith(prefix) && c !== prefix) return true;
  }
  return false;
}

// ============ SELECTOR GENERATION ============
// Three-fallback ladder, each validated for uniqueness against the document.
//   1. #id
//   2. .class.class (non-utility)
//   3. walk up building tag.class:nth-of-type(n), stop at first id or body

export function generateSelectorForElement(el: Element): string {
  // 1. id
  if (el.id) {
    const sel = `#${CSS.escape(el.id)}`;
    if (isUnique(sel, el)) return sel;
  }

  // 2. class combo
  const classes = Array.from(el.classList).filter(c => !isUtilClass(c));
  if (classes.length > 0) {
    const sel = classes.map(c => `.${CSS.escape(c)}`).join('');
    if (isUnique(sel, el)) return sel;
  }

  // 3. walk up
  const parts: string[] = [];
  let cur: Element | null = el;
  let anchored = false;

  while (cur && cur !== document.documentElement) {
    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      anchored = true;
      break;
    }
    let seg = cur.tagName.toLowerCase();
    const cls = Array.from(cur.classList).filter(c => !isUtilClass(c));
    if (cls.length > 0) {
      seg += cls.map(c => `.${CSS.escape(c)}`).join('');
    }
    const parent = cur.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
      if (sibs.length > 1) {
        seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
    }
    parts.unshift(seg);
    cur = cur.parentElement;
    if (cur === document.body) {
      anchored = true;
      break;
    }
  }
  return parts.join(' > ') || (anchored ? parts.join(' > ') : el.tagName.toLowerCase());
}

function isUnique(sel: string, el: Element): boolean {
  try {
    const matches = document.querySelectorAll(sel);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

// ============ SIMILAR ELEMENT DETECTION ============
// Strategy: try data-attributes → ARIA roles → same-tag-under-parent.
// Return the first strategy that finds 3+ siblings.

export interface SimilarResult {
  selector: string;
  elements: Element[];
}

export function findSimilarElements(element: Element): SimilarResult {
  return (
    findByDataAttributes(element) ||
    findByAriaRoles(element) ||
    findStructuralSiblings(element) ||
    { selector: generateSelectorForElement(element), elements: [element] }
  );
}

function findStructuralSiblings(el: Element): SimilarResult | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const parentTag = parent.tagName.toLowerCase();
  if (parentTag === 'body' || parentTag === 'html') return null;

  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter(c => !isUtilClass(c));
  const parentSel = generateSelectorForElement(parent);

  // Try parent > tag.class
  if (classes.length > 0) {
    const sel = `${parentSel} > ${tag}${classes.map(c => `.${CSS.escape(c)}`).join('')}`;
    const els = Array.from(document.querySelectorAll(sel));
    if (els.length > 1) return { selector: sel, elements: els };
  }

  // Try parent > tag
  const sel = `${parentSel} > ${tag}`;
  const els = Array.from(document.querySelectorAll(sel));
  if (els.length > 1) return { selector: sel, elements: els };

  return null;
}

// ============ DATA-ATTRIBUTE DETECTION ============

const LIST_DATA_ATTRS = ['data-testid', 'data-index', 'data-id', 'data-key', 'data-item', 'data-item-id', 'data-row', 'data-product-id'];

export function findByDataAttributes(element: Element): SimilarResult | null {
  let cur: Element | null = element;
  let depth = 0;

  while (cur && cur !== document.documentElement && depth < 5) {
    const parent = cur.parentElement;
    if (parent) {
      const tag = cur.tagName.toLowerCase();
      const parentSel = generateSelectorForElement(parent);

      // Try known list attribute names first
      for (const attr of LIST_DATA_ATTRS) {
        if (cur.hasAttribute(attr)) {
          const sameSibs = Array.from(parent.children).filter(
            c => c.tagName === cur!.tagName && c.hasAttribute(attr)
          );
          if (sameSibs.length >= 3) {
            const sel = `${parentSel} > ${tag}[${attr}]`;
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length >= 3) return { selector: sel, elements: els };
          }
        }
      }

      // Any data-* attribute present on 3+ siblings
      for (const attr of Array.from(cur.attributes)) {
        if (!attr.name.startsWith('data-')) continue;
        if (LIST_DATA_ATTRS.includes(attr.name)) continue; // already tried
        const sibs = Array.from(parent.children).filter(
          c => c.tagName === cur!.tagName && c.hasAttribute(attr.name)
        );
        if (sibs.length >= 3) {
          const sel = `${parentSel} > ${tag}[${attr.name}]`;
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length >= 3) return { selector: sel, elements: els };
        }
      }
    }
    cur = cur.parentElement;
    depth++;
  }
  return null;
}

// ============ ARIA ROLE DETECTION ============

const LIST_ITEM_ROLES = ['listitem', 'row', 'gridcell', 'option', 'tab', 'treeitem', 'menuitem'];
const LIST_CONTAINER_ROLES = ['list', 'grid', 'listbox', 'tablist', 'tree', 'menu', 'menubar', 'table', 'rowgroup'];

export function findByAriaRoles(element: Element): SimilarResult | null {
  let cur: Element | null = element;
  let depth = 0;

  while (cur && cur !== document.documentElement && depth < 5) {
    const role = cur.getAttribute('role');

    // Clicked an item role — scope to its container if possible
    if (role && LIST_ITEM_ROLES.includes(role)) {
      const parent = cur.parentElement;
      if (parent) {
        const parentRole = parent.getAttribute('role');
        if (parentRole && LIST_CONTAINER_ROLES.includes(parentRole)) {
          const parentSel = generateSelectorForElement(parent);
          const sel = `${parentSel} > [role="${role}"]`;
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length > 1) return { selector: sel, elements: els };
        }
        const sel = `[role="${role}"]`;
        const els = Array.from(document.querySelectorAll(sel));
        if (els.length > 1) return { selector: sel, elements: els };
      }
    }

    // Clicked inside a container role — find its item children
    if (role && LIST_CONTAINER_ROLES.includes(role)) {
      const items = Array.from(cur.children).filter(c => {
        const r = c.getAttribute('role');
        return r && LIST_ITEM_ROLES.includes(r);
      });
      if (items.length > 1) {
        const itemRole = items[0].getAttribute('role')!;
        const containerSel = generateSelectorForElement(cur);
        return { selector: `${containerSel} > [role="${itemRole}"]`, elements: items };
      }
    }

    cur = cur.parentElement;
    depth++;
  }
  return null;
}

// ============ VISIBILITY ============

export function isVisibleListItem(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  const he = el as HTMLElement;
  if (he.style?.display === 'none') return false;
  if (he.offsetHeight === 0 && he.offsetWidth === 0) return false;
  if (el.children.length === 0 && (el.textContent || '').trim().length === 0) return false;
  return true;
}
