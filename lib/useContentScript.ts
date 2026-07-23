import { useState, useCallback } from 'react';
import type { Message } from '@/types';
import { getActiveTab, ensureContentScript, sendToContent, isRestrictedUrl } from '@/lib/messaging';

export function useContentScript() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: Message): Promise<any> => {
    setLoading(true);
    setError(null);
    try {
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab found');
      if (isRestrictedUrl(tab.url)) {
        throw new Error("This page can't be scraped — browsers block extensions on internal pages and web stores. Switch to a regular website tab.");
      }

      await ensureContentScript(tab.id);

      const response = await sendToContent(tab.id, message) as Record<string, unknown> | undefined;
      if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
        throw new Error(response.error);
      }
      return response;
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Failed to communicate with page';
      if (/Receiving end does not exist|message port closed|Cannot access/i.test(msg)) {
        msg = 'Lost connection to the page — reload the tab and try again.';
      }
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, loading, error, setError };
}
