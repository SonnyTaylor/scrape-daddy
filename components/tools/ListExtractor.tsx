import { useState, useEffect } from 'react';
import { ChevronLeft, MousePointerClick, Check, X, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import type { ElementSelection } from '@/types';
import { useContentScript } from '@/lib/useContentScript';

interface ListExtractorProps {
  onNavigate: (view: View) => void;
}

interface ColumnDef {
  name: string;
  selector: string;
  attribute: string;
}

export default function ListExtractor({ onNavigate }: ListExtractorProps) {
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [picking, setPicking] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [opening, setOpening] = useState(false);
  const { sendMessage, loading, error, setError } = useContentScript();

  // Listen for element selection from content script
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'ELEMENT_SELECTED') {
        setSelection(message.payload);
        setPicking(false);
        // Immediately detect columns and open data table
        openDataTable(message.payload);
      } else if (message.type === 'CANCEL_PICKER') {
        setPicking(false);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const handleStartPicker = async () => {
    try {
      setPicking(true);
      setError(null);
      setSelection(null);
      if (autoScroll) {
        await sendMessage({ type: 'START_AUTOSCROLL', payload: { delay: 2000, maxScrolls: 20 } });
      }
      await sendMessage({ type: 'START_PICKER' });
    } catch {
      setPicking(false);
    }
  };

  const openDataTable = async (sel: ElementSelection) => {
    setOpening(true);
    try {
      // Auto-detect columns
      const detected = await sendMessage({
        type: 'AUTO_DETECT_COLUMNS',
        payload: { itemSelector: sel.similarSelector },
      });
      const cols: (ColumnDef & { enabled: boolean })[] = (Array.isArray(detected) && detected.length > 0)
        ? detected.map((c: any) => ({ ...c, enabled: true }))
        : [{ name: 'Text', selector: '', attribute: 'text', enabled: true }];

      // Extract all data
      const result = await sendMessage({
        type: 'START_EXTRACTION',
        payload: {
          itemSelector: sel.similarSelector,
          columns: cols.map(({ name, selector, attribute }) => ({ name, selector, attribute })),
        },
      });

      // Open the data table popup via background script
      await browser.runtime.sendMessage({
        type: 'OPEN_DATATABLE',
        payload: {
          columns: cols,
          rows: result.rows || [],
          url: result.url || window.location.href,
          timestamp: result.timestamp || Date.now(),
          itemCount: sel.count,
        },
      });
    } catch {
      // error set by hook
    }
    setOpening(false);
  };

  const isWorking = picking || opening || loading;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('tools')}
          className="p-1 rounded-md text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2
          className="text-sm font-semibold text-[#e7e5e4]"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          List Extractor
        </h2>
      </div>

      <div className="h-px bg-white/[0.05]" />

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {/* Selection status */}
      {selection && !opening && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <Check className="w-4 h-4 text-green-500 shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] text-green-400">
              Opened <span className="font-semibold">{selection.count} items</span> in data table
            </p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-green-500/50" />
        </div>
      )}

      {/* Opening state */}
      {opening && (
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Detecting columns & opening data table...</p>
        </div>
      )}

      {/* Main content */}
      {!opening && (
        <div className="space-y-4">
          <p className="text-[12px] text-[#a8a29e]">
            Hover over a list or grid on the page — we'll detect it automatically. Click to select and open the data table.
          </p>
          {picking ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <p className="text-[12px] text-[#a8a29e]">Hover over a list on the page...</p>
              <p className="text-[10px] text-[#78716c]">Press ESC to cancel</p>
            </div>
          ) : (
            <button
              onClick={handleStartPicker}
              disabled={isWorking}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                'bg-amber-500 text-black text-sm font-semibold',
                'hover:bg-amber-400 active:bg-amber-600 transition-colors',
                isWorking && 'opacity-50 pointer-events-none',
              )}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              <MousePointerClick className="w-4 h-4" />
              {selection ? 'Select Another List' : 'Select a List'}
            </button>
          )}
        </div>
      )}

      {/* Auto-scroll toggle */}
      {!picking && !opening && (
        <>
          <div className="h-px bg-white/[0.05]" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#78716c]">Auto-scroll before picking</span>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  'w-8 h-[18px] rounded-full transition-colors relative',
                  autoScroll ? 'bg-amber-500' : 'bg-white/10'
                )}
              >
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded-full bg-white absolute top-[2px] transition-transform',
                    autoScroll ? 'translate-x-[17px]' : 'translate-x-[2px]'
                  )}
                />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
