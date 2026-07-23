import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, MousePointerClick, Check, Loader2, AlertCircle,
  ArrowDownToLine, ChevronRightCircle, Plus, RotateCcw, Square,
  FileSpreadsheet, X, Type, Link2, Image as ImageIcon, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import type {
  ElementSelection, ColumnDefinition, Message, ExtractionResult,
  PaginationStatus, LoadMoreStatus, AutoScrollStatus, DetectedButton,
} from '@/types';
import { useContentScript } from '@/lib/useContentScript';
import { getSettings } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/types';

interface ListExtractorProps {
  onNavigate: (view: View) => void;
}

type Step = 'select' | 'configure' | 'extracting';
type Strategy = 'none' | 'autoscroll' | 'pagination' | 'loadmore';

export default function ListExtractor({ onNavigate }: ListExtractorProps) {
  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<ElementSelection | null>(null);
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<ColumnDefinition[]>([]);
  const [picking, setPicking] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('none');
  const [detectedNextBtn, setDetectedNextBtn] = useState<DetectedButton | null | undefined>(undefined);
  const [detectedLoadMoreBtn, setDetectedLoadMoreBtn] = useState<DetectedButton | null | undefined>(undefined);
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lastResult, setLastResult] = useState<ExtractionResult | null>(null);

  // Progress state
  const [paginationStatus, setPaginationStatus] = useState<PaginationStatus | null>(null);
  const [loadMoreStatus, setLoadMoreStatus] = useState<LoadMoreStatus | null>(null);
  const [autoScrollStatus, setAutoScrollStatus] = useState<AutoScrollStatus | null>(null);

  // Limits (seeded from settings)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [maxPages, setMaxPages] = useState(DEFAULT_SETTINGS.maxPages);
  const [maxClicks, setMaxClicks] = useState(DEFAULT_SETTINGS.maxLoadMoreClicks);
  const [maxScrolls, setMaxScrolls] = useState(DEFAULT_SETTINGS.maxAutoScrolls);

  const { sendMessage, loading, error, setError } = useContentScript();

  // The selection the runtime listener should act on — refs avoid stale closures
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      setMaxPages(s.maxPages);
      setMaxClicks(s.maxLoadMoreClicks);
      setMaxScrolls(s.maxAutoScrolls);
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
          setPaginationStatus(message.payload);
          break;
        case 'LOAD_MORE_STATUS':
          setLoadMoreStatus(message.payload);
          break;
        case 'AUTOSCROLL_STATUS':
          setAutoScrollStatus(message.payload);
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
    let cols: ColumnDefinition[] = [{ name: 'Text', selector: '', attribute: 'text' }];
    try {
      const detected = await sendMessage({
        type: 'AUTO_DETECT_COLUMNS',
        payload: { itemSelector: sel.similarSelector },
      });
      if (Array.isArray(detected) && detected.length > 0) {
        cols = detected.map((c: ColumnDefinition) => ({ name: c.name, selector: c.selector, attribute: c.attribute }));
      }
    } catch { /* fall back to Text column */ }
    setColumns(cols);
    setDetectedColumns(cols);
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
    setDetectedColumns([]);
    setStrategy('none');
    setDetectedNextBtn(undefined);
    setDetectedLoadMoreBtn(undefined);
    setLastResult(null);
    setPaginationStatus(null);
    setLoadMoreStatus(null);
    setAutoScrollStatus(null);
  };

  const removeColumn = (idx: number) => {
    setColumns(prev => prev.filter((_, i) => i !== idx));
  };

  const restoreColumns = () => setColumns(detectedColumns);

  const handleSelectStrategy = async (s: Strategy) => {
    setStrategy(s);
    const itemSelector = selectionRef.current?.similarSelector;

    if (s === 'pagination' && detectedNextBtn === undefined) {
      setDetecting(true);
      try {
        const result = await sendMessage({ type: 'DETECT_NEXT_BUTTON', payload: { itemSelector } });
        setDetectedNextBtn(result && result.selector ? (result as DetectedButton) : null);
      } catch { setDetectedNextBtn(null); }
      setDetecting(false);
    }

    if (s === 'loadmore' && detectedLoadMoreBtn === undefined) {
      setDetecting(true);
      try {
        const result = await sendMessage({ type: 'DETECT_LOAD_MORE_BUTTON', payload: { itemSelector } });
        setDetectedLoadMoreBtn(result && result.selector ? (result as DetectedButton) : null);
      } catch { setDetectedLoadMoreBtn(null); }
      setDetecting(false);
    }
  };

  const openDataTable = async (result: ExtractionResult, cols: ColumnDefinition[]) => {
    await browser.runtime.sendMessage({
      type: 'OPEN_DATATABLE',
      payload: {
        columns: cols.map(c => ({ name: c.name, selector: c.selector, attribute: c.attribute })),
        rows: result.rows,
        url: result.url || '',
        timestamp: result.timestamp || Date.now(),
        itemCount: result.rows.length,
      },
    });
  };

  const handleStartExtraction = async () => {
    if (!selection || columns.length === 0) return;
    setStep('extracting');
    setExtracting(true);
    setError(null);
    setPaginationStatus(null);
    setLoadMoreStatus(null);
    setAutoScrollStatus(null);
    setLastResult(null);

    const itemSelector = selection.similarSelector;
    const delay = settings.autoScrollDelay;

    try {
      let result: ExtractionResult | undefined;

      if (strategy === 'autoscroll') {
        await sendMessage({
          type: 'START_AUTOSCROLL',
          payload: { delay, maxScrolls, itemSelector },
        });
        result = await sendMessage({ type: 'START_EXTRACTION', payload: { itemSelector, columns } });
      } else if (strategy === 'pagination') {
        result = await sendMessage({
          type: 'START_PAGINATION',
          payload: { itemSelector, columns, nextButtonSelector: detectedNextBtn?.selector, maxPages, delay },
        });
      } else if (strategy === 'loadmore') {
        result = await sendMessage({
          type: 'START_LOAD_MORE',
          payload: { itemSelector, columns, loadMoreSelector: detectedLoadMoreBtn?.selector, maxClicks, delay },
        });
      } else {
        result = await sendMessage({ type: 'START_EXTRACTION', payload: { itemSelector, columns } });
      }

      if (result && result.rows) {
        setLastResult(result);
        await openDataTable(result, columns);
      }
    } catch {
      // error surfaced by the hook
    }
    setExtracting(false);
  };

  const handleStop = async () => {
    try {
      if (strategy === 'autoscroll') await sendMessage({ type: 'STOP_AUTOSCROLL' });
      else if (strategy === 'pagination') await sendMessage({ type: 'STOP_PAGINATION' });
      else if (strategy === 'loadmore') await sendMessage({ type: 'STOP_LOAD_MORE' });
    } catch { /* stopping a finished run is fine */ }
    // The in-flight extraction promise resolves with whatever was collected.
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
                List Selected — <span className="font-semibold">{selection.count} items</span>
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

          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3
                className="text-[12px] font-semibold text-[#e7e5e4]"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Columns <span className="text-[#78716c] font-normal">({columns.length})</span>
              </h3>
              {columns.length < detectedColumns.length && (
                <button
                  onClick={restoreColumns}
                  className="flex items-center gap-1 text-[10px] text-amber-500/80 hover:text-amber-400 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Restore all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col, i) => (
                <span
                  key={`${col.name}-${i}`}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-[#e7e5e4]"
                >
                  <ColumnIcon attribute={col.attribute} />
                  {col.name}
                  <button
                    onClick={() => removeColumn(i)}
                    className="p-0.5 rounded-full text-[#78716c] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title={`Remove "${col.name}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {columns.length === 0 && (
                <p className="text-[11px] text-red-400">
                  All columns removed — restore at least one to extract.
                </p>
              )}
            </div>
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
              How should we gather items beyond what's currently loaded?
            </p>
          </div>

          {/* Strategy cards */}
          <div className="space-y-2">
            <StrategyCard
              icon={<FileSpreadsheet className="w-4 h-4" />}
              title="Just this page"
              description="Extract the items already loaded — quick and simple"
              selected={strategy === 'none'}
              onClick={() => handleSelectStrategy('none')}
            />

            <StrategyCard
              icon={<ArrowDownToLine className="w-4 h-4" />}
              title="Auto-Scroll"
              description="Scrolls down to load more items (infinite scroll)"
              selected={strategy === 'autoscroll'}
              onClick={() => handleSelectStrategy('autoscroll')}
            >
              {strategy === 'autoscroll' && (
                <LimitInput label="Max scrolls" value={maxScrolls} onChange={setMaxScrolls} max={200} />
              )}
            </StrategyCard>

            <StrategyCard
              icon={<Plus className="w-4 h-4" />}
              title="Load More Button"
              description="Clicks a “Load more” button until everything is loaded"
              selected={strategy === 'loadmore'}
              onClick={() => handleSelectStrategy('loadmore')}
              detecting={detecting && strategy === 'loadmore'}
              detectedButton={strategy === 'loadmore' ? detectedLoadMoreBtn : undefined}
            >
              {strategy === 'loadmore' && (
                <LimitInput label="Max clicks" value={maxClicks} onChange={setMaxClicks} max={200} />
              )}
            </StrategyCard>

            <StrategyCard
              icon={<ChevronRightCircle className="w-4 h-4" />}
              title="Pagination"
              description="Follows Next-page links and combines all pages"
              selected={strategy === 'pagination'}
              onClick={() => handleSelectStrategy('pagination')}
              detecting={detecting && strategy === 'pagination'}
              detectedButton={strategy === 'pagination' ? detectedNextBtn : undefined}
            >
              {strategy === 'pagination' && (
                <LimitInput label="Max pages" value={maxPages} onChange={setMaxPages} max={200} />
              )}
            </StrategyCard>
          </div>

          {/* Start extraction button */}
          <button
            onClick={handleStartExtraction}
            disabled={isWorking || columns.length === 0}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
              'bg-amber-500 text-black text-sm font-semibold',
              'hover:bg-amber-400 active:bg-amber-600 transition-colors',
              (isWorking || columns.length === 0) && 'opacity-50 pointer-events-none',
            )}
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            <FileSpreadsheet className="w-4 h-4" />
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
                <p className="text-[13px] text-green-400 font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {lastResult ? `${lastResult.rows.length} rows extracted` : 'Extraction finished'}
                </p>
                {!lastResult && (
                  <p className="text-[11px] text-[#78716c]">No rows were collected — try re-selecting the list.</p>
                )}
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
              Stop &amp; keep what's collected
            </button>
          ) : (
            <div className="space-y-2">
              {lastResult && (
                <button
                  onClick={() => openDataTable(lastResult, columns)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
                    'bg-amber-500 text-black text-sm font-semibold',
                    'hover:bg-amber-400 transition-colors',
                  )}
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  View Results
                </button>
              )}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

function ColumnIcon({ attribute }: { attribute: string }) {
  if (attribute === 'href') return <Link2 className="w-3 h-3 text-cyan-400/80" />;
  if (attribute === 'src' || attribute === 'background') return <ImageIcon className="w-3 h-3 text-red-400/80" />;
  return <Type className="w-3 h-3 text-[#78716c]" />;
}

function LimitInput({ label, value, onChange, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  return (
    <div
      className="flex items-center gap-2 mt-2"
      onClick={e => e.stopPropagation()}
    >
      <span className="text-[10px] text-[#78716c]">{label}</span>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        className="w-16 px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.1] text-[11px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/40 transition-colors"
      />
    </div>
  );
}

function StrategyCard({
  icon, title, description, selected, onClick, detecting, detectedButton, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  detecting?: boolean;
  /** undefined = not yet detected; null = detection ran, nothing found */
  detectedButton?: DetectedButton | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all cursor-pointer',
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
                <span className="text-[10px] text-green-400 truncate">
                  Found: "{detectedButton.text}"{detectedButton.href ? ' (link — pages fetched in background)' : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500/60" />
                <span className="text-[10px] text-[#78716c]">
                  No button detected — will keep trying during extraction
                </span>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
      <div className={cn(
        'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
        selected ? 'border-amber-500' : 'border-white/20',
      )}>
        {selected && <div className="w-2 h-2 rounded-full bg-amber-500" />}
      </div>
    </div>
  );
}

function ProgressDisplay({
  strategy, paginationStatus, loadMoreStatus, autoScrollStatus,
}: {
  strategy: Strategy;
  paginationStatus: PaginationStatus | null;
  loadMoreStatus: LoadMoreStatus | null;
  autoScrollStatus: AutoScrollStatus | null;
}) {
  if (strategy === 'pagination') {
    if (paginationStatus) {
      return (
        <p className="text-[12px] text-[#a8a29e]">
          Page {paginationStatus.currentPage} — {paginationStatus.totalRows} rows collected
          {paginationStatus.mode === 'fetch' && <span className="text-[#78716c]"> (fetching pages)</span>}
        </p>
      );
    }
    return <p className="text-[12px] text-[#a8a29e]">Starting pagination...</p>;
  }
  if (strategy === 'loadmore') {
    if (loadMoreStatus) {
      return (
        <p className="text-[12px] text-[#a8a29e]">
          {loadMoreStatus.clicks} click{loadMoreStatus.clicks !== 1 ? 's' : ''} — {loadMoreStatus.totalRows} items loaded
        </p>
      );
    }
    return <p className="text-[12px] text-[#a8a29e]">Looking for the load-more button...</p>;
  }
  if (strategy === 'autoscroll') {
    if (autoScrollStatus) {
      return (
        <p className="text-[12px] text-[#a8a29e]">
          {autoScrollStatus.itemCount
            ? `${autoScrollStatus.itemCount} items loaded — scroll ${autoScrollStatus.scrollCount}`
            : `Scroll ${autoScrollStatus.scrollCount} — scrolling page...`}
        </p>
      );
    }
    return <p className="text-[12px] text-[#a8a29e]">Starting auto-scroll...</p>;
  }
  return <p className="text-[12px] text-[#a8a29e]">Extracting visible items...</p>;
}
