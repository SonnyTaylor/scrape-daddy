import type { Message } from '@/types';

export async function sendToContent(tabId: number, message: Message): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message);
}

export function sendToSidePanel(message: Message): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

export async function getActiveTab(): Promise<{ id: number; url: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return null;
  return { id: tab.id, url: tab.url || '' };
}

export async function getActiveTabId(): Promise<number | null> {
  const tab = await getActiveTab();
  return tab?.id ?? null;
}

/** Pages the extension is not allowed to touch. */
export function isRestrictedUrl(url: string): boolean {
  return /^(chrome|chrome-extension|edge|about|moz-extension|devtools|view-source):/.test(url)
    || url.startsWith('https://chromewebstore.google.com')
    || url.startsWith('https://chrome.google.com/webstore')
    || url.startsWith('https://addons.mozilla.org');
}

export async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'PING' } satisfies Message);
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  }
}
