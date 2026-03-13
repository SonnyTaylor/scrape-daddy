import type { AutoScrollStatus } from '@/types';

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
      const loadMoreClicked = tryClickLoadMore();
      if (!loadMoreClicked) break;
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
