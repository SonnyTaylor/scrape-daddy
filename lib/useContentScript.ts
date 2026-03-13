import { useState, useCallback } from 'react';
import type { Message } from '@/types';

export function useContentScript() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: Message): Promise<any> => {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      // Ensure content script is injected before sending
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'PING' });
      } catch {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/content-scripts/content.js'],
        });
      }

      const response = await browser.tabs.sendMessage(tab.id, message);
      if (response?.error) throw new Error(response.error);
      return response;
    } catch (err: any) {
      const msg = err?.message || 'Failed to communicate with page';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, loading, error, setError };
}
