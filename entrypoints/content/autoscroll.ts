import type { AutoScrollStatus } from '@/types';
import { detectLoadMoreButton } from './button-detect';

let scrolling = false;

export function stopAutoScroll() {
  scrolling = false;
}

export async function startAutoScroll(delay: number, maxScrolls: number): Promise<{ status: string; scrollCount: number }> {
  scrolling = true;
  let scrollCount = 0;
  let lastHeight = document.documentElement.scrollHeight;

  while (scrolling && scrollCount < maxScrolls) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    await sleep(delay);

    const newHeight = document.documentElement.scrollHeight;
    if (newHeight === lastHeight) {
      const detected = detectLoadMoreButton();
      if (!detected) break;
      const btn = document.querySelector(detected.selector) as HTMLElement | null;
      if (!btn) break;
      btn.click();
      await sleep(delay);
    }
    lastHeight = document.documentElement.scrollHeight;
    scrollCount++;

    const status: AutoScrollStatus = { scrollCount, scrolling, height: newHeight };
    browser.runtime.sendMessage({ type: 'AUTOSCROLL_STATUS', payload: status });
  }

  scrolling = false;
  return { status: 'complete', scrollCount };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
