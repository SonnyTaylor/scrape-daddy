import type { Message } from '@/types';

export async function sendToContent(tabId: number, message: Message): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message);
}

export function sendToSidePanel(message: Message): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
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
