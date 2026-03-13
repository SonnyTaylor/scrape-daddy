import { useState, useCallback, useRef } from 'react';

export function useClipboard(feedbackMs = 1500) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyOne = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setCopiedAll(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedIdx(null), feedbackMs);
  }, [feedbackMs]);

  const copyAll = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setCopiedIdx(null);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedAll(false), feedbackMs);
  }, [feedbackMs]);

  return { copiedIdx, copiedAll, copyOne, copyAll };
}
