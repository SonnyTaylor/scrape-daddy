import { useState, useEffect } from 'react';
import {
  ChevronLeft, MousePointerClick, Check, Loader2, AlertCircle, ExternalLink,
  ArrowDownToLine, ChevronRightCircle, Plus, RotateCcw, Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import type {
  ElementSelection, ColumnDefinition, Message,
  PaginationStatus, LoadMoreStatus, DetectedButton,
} from '@/types';
import { useContentScript } from '@/lib/useContentScript';
import { getSettings } from '@/lib/storage';

interface ListExtractorProps {
  onNavigate: (view: View) => void;
}

type Step = 'select' | 'configure' | 'extracting';
type Strategy = 'none' | 'autoscroll' | 'pagination' | 'loadmore';

export default function ListExtractor({ onNavigate }: ListExtractorProps) {
  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [picking, setPicking] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('none');
  const [detectedNextBtn, setDetectedNextBtn] = useState<DetectedButton | null>(null);
  const [detectedLoadMoreBtn, setDetectedLoadMoreBtn] = useState<DetectedButton | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Progress state
  const [paginationStatus, setPaginationStatus] = useState<PaginationStatus | null>(null);
  const [loadMoreStatus, setLoadMoreStatus] = useState<LoadMoreStatus | null>(null);
  const [autoScrollStatus, setAutoScrollStatus] = useState<{ scrollCount: number; height: number } | null>(null);

  // Settings
  const [maxPages, setMaxPages] = useState(10);
  const [maxClicks, setMaxClicks] = useState(20);

  const { sendMessage, loading, error, setError } = useContentScript();

  // Load settings
  useEffect(() => {
    getSettings().then(s => {
      setMaxPages(s.maxPages);
      setMaxClicks(s.maxLoadMoreClicks);
    });
  }, []);

  // Listen for messages from content script
  useEffect(() => {
    const listener = (message: Message) => {
      switch (message.type) {
        case 'ELEMENT_SELECTED':
          handleElementSelected(message.payload);
          break;
        case 'CANCEL_PICKER':
          setPicking(false);
          break;
        case 'PAGINATION_STATUS':
          setPaginationStatus(message.payload as PaginationStatus);
          if ((message.payload as PaginationStatus).done) setExtracting(false);
          break;
        case 'LOAD_MORE_STATUS':
          setLoadMoreStatus(message.payload as LoadMoreStatus);
          if ((message.payload as LoadMoreStatus).done) setExtracting(false);
          break;
        case 'AUTOSCROLL_STATUS':
          setAutoScrollStatus(message.payload as { scrollCount: number; height: number });
          break;
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const handleElementSelected = async (sel: ElementSelection) => {
    setSelection(sel);
    setPicking(false);
    setError(null);

    // Auto-detect columns
    try {
      const detected = await sendMessage({
        type: 'AUTO_DETECT_COLUMNS',
        payload: { itemSelector: sel.similarSelector },
      });
      const cols: ColumnDefinition[] = (Array.isArray(detected) && detected.length > 0)
        ? detected.map((c: ColumnDefinition) => ({ name: c.name, selector: c.selector, attribute: c.attribute }))
        : [{ name: 'Text', selector: '', attribute: 'text' }];
      setColumns(cols);
    } catch {
      setColumns([{ name: 'Text', selector: '', attribute: 'text' }]);
    }

    setStep('configure');
  };

  const handleStartPicker = async () => {
    try {
      setPicking(true);
      setError(null);
      setSelection(null);
      setStrategy('none');
      await sendMessage({ type: 'START_PICKER' });
    } catch {
      setPicking(false);
    }
  };

  const handleReselect = () => {
    setStep('select');
    setSelection(null);
    setColumns([]);
    setStrategy('none');
    setDetectedNextBtn(null);
    setDetectedLoadMoreBtn(null);
  };

  const handleSelectStrategy = async (s: Strategy) => {
    setStrategy(s);

    if (s === 'pagination' && !detectedNextBtn) {
      setDetecting(true);
      try {
        const result = await sendMessage({ type: 'DETECT_NEXT_BUTTON' });
        if (result && result.selector) setDetectedNextBtn(result as DetectedButton);
      } catch { /* ignore */ }
      setDetecting(false);
    }

    if (s === 'loadmore' && !detectedLoadMoreBtn) {
      setDetecting(true);
      try {
        const result = await sendMessage({ type: 'DETECT_LOAD_MORE_BUTTON' });
        if (result && result.selector) setDetectedLoadMoreBtn(result as DetectedButton);
      } catch { /* ignore */ }
      setDetecting(false);
    }
  };

  const handleStartExtraction = async () => {
    if (!selection) return;
    setStep('extracting');
    setExtracting(true);
    setError(null);
    setPaginationStatus(null);
    setLoadMoreStatus(null);

    try {
      let result: any;

      if (strategy === 'autoscroll') {
        // Auto-scroll first, then extract
        await sendMessage({ type: 'START_AUTOSCROLL', payload: { delay: 2000, maxScrolls: 50, itemSelector: selection.similarSelector } });
        result = await sendMessage({
          type: 'START_EXTRACTION',
          payload: { itemSelector: selection.similarSelector, columns },
        });
      } else if (strategy === 'pagination') {
        result = await sendMessage({
          type: 'START_PAGINATION',
          payload: {
            itemSelector: selection.similarSelector,
            columns,
            nextButtonSelector: detectedNextBtn?.selector,
            maxPages,
          },
        });
      } else if (strategy === 'loadmore') {
        result = await sendMessage({
          type: 'START_LOAD_MORE',
          payload: {
            itemSelector: selection.similarSelector,
            columns,
            loadMoreSelector: detectedLoadMoreBtn?.selector,
            maxClicks,
          },
        });
      } else {
        // No strategy — extract what's visible
        result = await sendMessage({
          type: 'START_EXTRACTION',
          payload: { itemSelector: selection.similarSelector, columns },
        });
      }

      // Open data table with results
      if (result && result.rows) {
        await browser.runtime.sendMessage({
          type: 'OPEN_DATATABLE',
          payload: {
            columns: columns.map(c => ({ name: c.name, attribute: c.attribute })),
            rows: result.rows,
            url: result.url || window.location.href,
            timestamp: result.timestamp || Date.now(),
            itemCount: result.rows.length,
          },
        });
      }
    } catch {
      // error set by hook
    }
    setExtracting(false);
  };

  const handleStop = async () => {
    if (strategy === 'autoscroll') await sendMessage({ type: 'STOP_AUTOSCROLL' });
    else if (strategy === 'pagination') await sendMessage({ type: 'STOP_PAGINATION' });
    else if (strategy === 'loadmore') await sendMessage({ type: 'STOP_LOAD_MORE' });
    setExtracting(false);
  };

  const isWorking = picking || loading;

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
        {step !== 'select' && (
          <span className="ml-auto text-[10px] text-[#78716c]">
            {step === 'configure' ? 'Step 2/3' : 'Step 3/3'}
          </span>
        )}
      </div>

      <div className="h-px bg-white/[0.05]" />

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {/* ====== STEP 1: SELECT ====== */}
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-[12px] text-[#a8a29e]">
            Hover over a list or grid on the page — we'll detect it automatically. Click to select.
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
              Select a List
            </button>
          )}
        </div>
      )}

      {/* ====== STEP 2: CONFIGURE ====== */}
      {step === 'configure' && selection && (
        <div className="space-y-4">
          {/* Selection summary */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <Check className="w-4 h-4 text-green-500 shrink-0" />
            <div className="flex-1">
              <p className="text-[12px] text-green-400">
                List Selected — <span className="font-semibold">{selection.count} items</span>, {columns.length} column{columns.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={handleReselect}
              className="p-1 rounded text-green-500/60 hover:text-green-400 transition-colors"
              title="Re-select"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Strategy heading */}
          <div>
            <h3
              className="text-[12px] font-semibold text-[#e7e5e4] mb-1"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Load More Items
            </h3>
            <p className="text-[11px] text-[#78716c]">
              Choose how to load additional items, or skip to extract what's visible.
            </p>
          </div>

          {/* Strategy cards */}
          <div className="space-y-2">
            <StrategyCard
              icon={<ArrowDownToLine className="w-4 h-4" />}
              title="Auto-Scroll"
              description="Scrolls down to load more items automatically"
              selected={strategy === 'autoscroll'}
              onClick={() => handleSelectStrategy('autoscroll')}
            />

            <StrategyCard
              icon={<ChevronRightCircle className="w-4 h-4" />}
              title="Pagination"
              description="Clicks button or link to navigate to the next page"
              selected={strategy === 'pagination'}
              onClick={() => handleSelectStrategy('pagination')}
              detecting={detecting && strategy === 'pagination'}
              detectedButton={strategy === 'pagination' ? detectedNextBtn : null}
            />

            <StrategyCard
              icon={<Plus className="w-4 h-4" />}
              title="Load More"
              description="Clicks button to load more items on same page"
              selected={strategy === 'loadmore'}
              onClick={() => handleSelectStrategy('loadmore')}
              detecting={detecting && strategy === 'loadmore'}
              detectedButton={strategy === 'loadmore' ? detectedLoadMoreBtn : null}
            />
          </div>

          {/* Start extraction button */}
          <button
            onClick={handleStartExtraction}
            disabled={isWorking}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
              'bg-amber-500 text-black text-sm font-semibold',
              'hover:bg-amber-400 active:bg-amber-600 transition-colors',
              isWorking && 'opacity-50 pointer-events-none',
            )}
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            <ExternalLink className="w-4 h-4" />
            Start Extraction
          </button>
        </div>
      )}

      {/* ====== STEP 3: EXTRACTING ====== */}
      {step === 'extracting' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            {extracting ? (
              <>
                <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                <ProgressDisplay
                  strategy={strategy}
                  paginationStatus={paginationStatus}
                  loadMoreStatus={loadMoreStatus}
                  autoScrollStatus={autoScrollStatus}
                />
              </>
            ) : (
              <>
                <Check className="w-6 h-6 text-green-500" />
                <p className="text-[12px] text-green-400">Extraction complete!</p>
                <ProgressDisplay
                  strategy={strategy}
                  paginationStatus={paginationStatus}
                  loadMoreStatus={loadMoreStatus}
                  autoScrollStatus={autoScrollStatus}
                />
              </>
            )}
          </div>

          {extracting ? (
            <button
              onClick={handleStop}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                'bg-red-500/20 text-red-400 text-sm font-semibold border border-red-500/30',
                'hover:bg-red-500/30 transition-colors',
              )}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleReselect}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                'bg-white/5 text-[#e7e5e4] text-sm font-semibold border border-white/10',
                'hover:bg-white/10 transition-colors',
              )}
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              <RotateCcw className="w-4 h-4" />
              Extract Another List
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

function StrategyCard({
  icon, title, description, selected, onClick, detecting, detectedButton,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  detecting?: boolean;
  detectedButton?: DetectedButton | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
        'border',
        selected
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]',
      )}
    >
      <div className={cn(
        'mt-0.5 shrink-0',
        selected ? 'text-amber-500' : 'text-[#78716c]',
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-[12px] font-semibold',
          selected ? 'text-amber-500' : 'text-[#e7e5e4]',
        )} style={{ fontFamily: "'Outfit', sans-serif" }}>
          {title}
        </p>
        <p className="text-[11px] text-[#78716c] mt-0.5">{description}</p>
        {selected && detecting && (
          <div className="flex items-center gap-1.5 mt-2">
            <Loader2 className="w-3 h-3 text-amber-500/60 animate-spin" />
            <span className="text-[10px] text-[#78716c]">Detecting button...</span>
          </div>
        )}
        {selected && !detecting && detectedButton !== undefined && (
          <div className="mt-2">
            {detectedButton ? (
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-[10px] text-green-400">
                  Found: "{detectedButton.text}"
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500/60" />
                <span className="text-[10px] text-[#78716c]">
                  No button detected — will try during extraction
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={cn(
        'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
        selected ? 'border-amber-500' : 'border-white/20',
      )}>
        {selected && <div className="w-2 h-2 rounded-full bg-amber-500" />}
      </div>
    </button>
  );
}

function ProgressDisplay({
  strategy, paginationStatus, loadMoreStatus, autoScrollStatus,
}: {
  strategy: Strategy;
  paginationStatus: PaginationStatus | null;
  loadMoreStatus: LoadMoreStatus | null;
  autoScrollStatus?: { scrollCount: number; height: number } | null;
}) {
  if (strategy === 'pagination' && paginationStatus) {
    return (
      <p className="text-[12px] text-[#a8a29e]">
        Page {paginationStatus.currentPage} — {paginationStatus.totalRows} items collected
      </p>
    );
  }
  if (strategy === 'loadmore' && loadMoreStatus) {
    return (
      <p className="text-[12px] text-[#a8a29e]">
        {loadMoreStatus.clicks} click{loadMoreStatus.clicks !== 1 ? 's' : ''} — {loadMoreStatus.totalRows} items loaded
      </p>
    );
  }
  if (strategy === 'autoscroll') {
    if (autoScrollStatus) {
      return (
        <p className="text-[12px] text-[#a8a29e]">
          Scroll {autoScrollStatus.scrollCount} — scrolling page...
        </p>
      );
    }
    return <p className="text-[12px] text-[#a8a29e]">Starting auto-scroll...</p>;
  }
  return <p className="text-[12px] text-[#a8a29e]">Extracting visible items...</p>;
}
