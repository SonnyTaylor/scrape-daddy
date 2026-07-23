// Shared DOM helpers for the content-script extraction engine.

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * An item is "real" if it renders any content — text, an image, or a
 * background image. Deliberately cheap and permissive: a bare <li><a>text</a></li>
 * must pass, while unrendered template stubs (empty divs) must not.
 */
export function isRealItem(el: HTMLElement): boolean {
  if ((el.innerText || el.textContent || '').trim().length > 0) return true;
  if (el.querySelector('img, picture, svg, video')) return true;
  return false;
}

/**
 * Visibility test that works for position:fixed/sticky elements
 * (el.offsetParent is null for those, so it can't be used).
 */
export function isElementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function isElementDisabled(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.classList.contains('disabled')) return true;
  return false;
}

/**
 * Click that survives React/Vue synthetic event systems: full pointer +
 * mouse event sequence instead of a bare .click().
 */
export function simulateClick(el: HTMLElement): void {
  const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

/**
 * Cheap content hash over the first/last N items matching a selector.
 * Detects DOM changes even when the item count stays the same (classic
 * pagination replaces items in place).
 */
export function hashItems(selector: string, root: ParentNode = document): number {
  const items = root.querySelectorAll(selector);
  const count = items.length;
  if (count === 0) return 0;
  const sample: number[] = [];
  const take = 10;
  for (let i = 0; i < Math.min(take, count); i++) sample.push(i);
  if (count > take) {
    for (let i = Math.max(take, count - take); i < count; i++) sample.push(i);
  }
  let acc = 0;
  for (const i of sample) {
    const el = items[i] as HTMLElement | undefined;
    if (!el) continue;
    const key = (el.innerText || el.textContent || '').slice(0, 80);
    for (let j = 0; j < key.length; j++) {
      acc = (acc << 5) - acc + key.charCodeAt(j);
      acc |= 0;
    }
  }
  return acc;
}

/**
 * Wait until the items matching `selector` change (count grows or content
 * hash shifts), or until `timeout` elapses. Resolves true if a change was
 * observed. Adds a short settle delay after the first mutation so batched
 * inserts finish rendering.
 */
export function waitForItemChange(
  selector: string,
  prevCount: number,
  prevHash: number,
  timeout: number,
): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    let settleTimer: number | null = null;

    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      resolve(changed);
    };

    const check = () => {
      const count = document.querySelectorAll(selector).length;
      if (count !== prevCount || hashItems(selector) !== prevHash) {
        // Let the batch of inserts finish before resolving.
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => finish(true), 400);
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const timeoutTimer = window.setTimeout(() => finish(false), timeout);
    check();
  });
}
