import { useState, useCallback } from 'react';
import type { Message } from '@/types';
import { getActiveTabId, ensureContentScript, sendToContent } from '@/lib/messaging';

export function useContentScript() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: Message): Promise<any> => {
    setLoading(true);
    setError(null);
    try {
      const tabId = await getActiveTabId();
      if (!tabId) throw new Error('No active tab found');

      await ensureContentScript(tabId);

      const response = await sendToContent(tabId, message) as Record<string, unknown> | undefined;
      if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
        throw new Error(response.error);
      }
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to communicate with page';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, loading, error, setError };
}
