import { Message } from '@/types';

// Send message from side panel to content script (via background)
export async function sendToContent(tabId: number, message: Message): Promise<any> {
  return browser.tabs.sendMessage(tabId, message);
}

// Send message from content script to side panel (via background/runtime)
export function sendToSidePanel(message: Message): Promise<any> {
  return browser.runtime.sendMessage(message);
}

// Get the active tab ID
export async function getActiveTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

// Inject content script into active tab if not already injected
export async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  }
}
