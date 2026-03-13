import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  Phone,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  Link,
  CopyCheck,
  PhoneCall,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportMenu from '@/components/ExportMenu';
import type { View } from '@/components/Layout';
import { useContentScript } from '@/lib/useContentScript';
import { useClipboard } from '@/lib/useClipboard';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import { addHistory, generateId } from '@/lib/storage';
import type { PhoneEntry } from '@/types';

interface PhoneExtractorProps {
  onNavigate: (view: View) => void;
}

export default function PhoneExtractor({ onNavigate }: PhoneExtractorProps) {
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [filter, setFilter] = useState('');
  const { sendMessage, loading, error } = useContentScript();
  const { copiedIdx, copiedAll, copyOne, copyAll } = useClipboard();

  const handleExtract = async () => {
    try {
      const result = await sendMessage({ type: 'EXTRACT_PHONES' });
      setPhones(result.phones);
      setState('done');

      await addHistory({
        id: generateId(),
        tool: 'phone',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: result.phones.length,
        data: result,
      });
    } catch {
      // error is set by the hook
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'sheets') => {
    const columns = ['Phone', 'Source', 'Context'];
    const rows = filteredPhones.map((p) => [p.number, p.source, p.context]);
    if (format === 'csv') exportCSV(columns, rows, 'phones');
    else if (format === 'xlsx') exportExcel(columns, rows, 'phones');
    else copyForSheets(columns, rows);
  };

  const filteredPhones = useMemo(
    () =>
      filter
        ? phones.filter(
            (p) =>
              p.number.includes(filter) || p.context.toLowerCase().includes(filter.toLowerCase()),
          )
        : phones,
    [phones, filter],
  );

  // Format phone number for tel: link
  const getTelHref = (number: string) => {
    return 'tel:' + number.replace(/[^\d+]/g, '');
  };

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
          Phone Extractor
        </h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {state === 'idle' && !loading && (
        <div className="space-y-3">
          <p className="text-[12px] text-[#a8a29e]">
            Scan the current page for phone numbers. Detects international formats, local numbers,
            and tel: links.
          </p>
          <button
            onClick={handleExtract}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
              'bg-amber-500 text-black text-sm font-semibold',
              'hover:bg-amber-400 active:bg-amber-600 transition-colors',
            )}
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            <Phone className="w-4 h-4" />
            Extract Phone Numbers
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Scanning page for phone numbers...</p>
        </div>
      )}

      {state === 'done' && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[11px] font-semibold">
              {phones.length} found
            </span>
            {phones.filter((p) => p.source === 'tel-link').length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                {phones.filter((p) => p.source === 'tel-link').length} verified (tel:)
              </span>
            )}
          </div>

          {phones.length === 0 ? (
            <p className="text-[12px] text-[#78716c] py-4 text-center">
              No phone numbers found on this page.
            </p>
          ) : (
            <>
              {/* Search filter */}
              {phones.length > 3 && (
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter phone numbers..."
                  className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] placeholder:text-[#57534e] focus:outline-none focus:border-amber-500/30 transition-colors"
                />
              )}

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredPhones.map((phone, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[12px] text-[#e7e5e4] font-mono">{phone.number}</span>
                        {phone.source === 'tel-link' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
                            <Link className="w-2.5 h-2.5" />
                            tel:
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <a
                          href={getTelHref(phone.number)}
                          className="p-1 rounded text-[#78716c] hover:text-green-400 transition-colors"
                          title="Call this number"
                        >
                          <PhoneCall className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => copyOne(phone.number, i)}
                          className="p-1 rounded text-[#78716c] hover:text-amber-500 transition-colors"
                        >
                          {copiedIdx === i ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    {phone.context && (
                      <p className="text-[10px] text-[#78716c] mt-1 truncate">{phone.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {phones.length > 0 && <ExportMenu onExport={handleExport} />}
              {phones.length > 1 && (
                <button
                  onClick={() => copyAll(filteredPhones.map(p => p.number).join('\n'))}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                    copiedAll
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-white/[0.03] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4]',
                  )}
                >
                  {copiedAll ? (
                    <CopyCheck className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedAll ? 'Copied!' : 'Copy All'}
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setState('idle');
                setPhones([]);
                setFilter('');
              }}
              className="text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] transition-colors"
            >
              Re-scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
