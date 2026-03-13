import { useState } from 'react';
import {
  ChevronLeft,
  Table,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  CopyCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportMenu from '@/components/ExportMenu';
import type { View } from '@/components/Layout';
import { useContentScript } from '@/lib/useContentScript';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import { addHistory, generateId } from '@/lib/storage';

interface TableExtractorProps {
  onNavigate: (view: View) => void;
}

interface TableData {
  headers: string[];
  rows: string[][];
  caption: string;
  index: number;
}

export default function TableExtractor({ onNavigate }: TableExtractorProps) {
  const [tables, setTables] = useState<TableData[]>([]);
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<number | null>(null);
  const { sendMessage, loading, error } = useContentScript();

  const handleExtract = async () => {
    try {
      const result = await sendMessage({ type: 'EXTRACT_TABLES' });
      setTables(result.tables);
      setState('done');
      // Auto-expand first table
      if (result.tables.length > 0) {
        setExpandedTable(0);
      }

      await addHistory({
        id: generateId(),
        tool: 'table',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: result.tables.reduce((sum: number, t: TableData) => sum + t.rows.length, 0),
        data: result,
      });
    } catch {
      // error set by hook
    }
  };

  const handleExport = (tableIdx: number, format: 'csv' | 'xlsx' | 'sheets') => {
    const t = tables[tableIdx];
    if (!t) return;
    const name = t.caption || `table-${tableIdx + 1}`;
    if (format === 'csv') exportCSV(t.headers, t.rows, name);
    else if (format === 'xlsx') exportExcel(t.headers, t.rows, name);
    else copyForSheets(t.headers, t.rows);
  };

  const handleCopyTable = (tableIdx: number) => {
    const t = tables[tableIdx];
    if (!t) return;
    const header = t.headers.join('\t');
    const body = t.rows.map((r) => r.join('\t')).join('\n');
    navigator.clipboard.writeText(header + '\n' + body);
    setCopiedAll(tableIdx);
    setTimeout(() => setCopiedAll(null), 1500);
  };

  const totalRows = tables.reduce((sum, t) => sum + t.rows.length, 0);

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
          Table Extractor
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
            Detect and extract all HTML tables from the current page. Each table can be previewed
            and exported individually.
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
            <Table className="w-4 h-4" />
            Extract Tables
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Scanning page for tables...</p>
        </div>
      )}

      {state === 'done' && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[11px] font-semibold">
              {tables.length} table{tables.length !== 1 ? 's' : ''} found
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.04] text-[#78716c] border border-white/[0.06]">
              {totalRows} total rows
            </span>
          </div>

          {tables.length === 0 ? (
            <p className="text-[12px] text-[#78716c] py-4 text-center">
              No tables found on this page.
            </p>
          ) : (
            <div className="space-y-2">
              {tables.map((table, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.02] overflow-hidden"
                >
                  {/* Table header */}
                  <button
                    onClick={() => setExpandedTable(expandedTable === idx ? null : idx)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    {expandedTable === idx ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
                    )}
                    <span className="shrink-0 text-pink-400">
                      <Table className="w-3.5 h-3.5" />
                    </span>
                    <span
                      className="text-[12px] font-semibold text-[#e7e5e4] flex-1 truncate"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {table.caption || `Table ${idx + 1}`}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-400">
                      {table.headers.length} cols &middot; {table.rows.length} rows
                    </span>
                  </button>

                  {/* Expanded content */}
                  {expandedTable === idx && (
                    <div className="border-t border-white/[0.05]">
                      {/* Preview table */}
                      <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-white/[0.04]">
                              {table.headers.map((h, hi) => (
                                <th
                                  key={hi}
                                  className="px-2 py-1.5 text-left font-semibold text-amber-500 whitespace-nowrap border-b border-white/[0.05]"
                                >
                                  {h || `Col ${hi + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.slice(0, 20).map((row, ri) => (
                              <tr
                                key={ri}
                                className="border-b border-white/[0.03] hover:bg-white/[0.02]"
                              >
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    className="px-2 py-1 text-[#e7e5e4] whitespace-nowrap max-w-[200px] truncate"
                                    title={cell}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {table.rows.length > 20 && (
                          <p className="text-[10px] text-[#78716c] px-2 py-1.5 text-center">
                            Showing 20 of {table.rows.length} rows. Export to see all.
                          </p>
                        )}
                      </div>

                      {/* Table actions */}
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.05]">
                        <ExportMenu onExport={(format) => handleExport(idx, format)} />
                        <button
                          onClick={() => handleCopyTable(idx)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                            copiedAll === idx
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                              : 'bg-white/[0.03] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4]',
                          )}
                        >
                          {copiedAll === idx ? (
                            <CopyCheck className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedAll === idx ? 'Copied!' : 'Copy Table'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              setState('idle');
              setTables([]);
              setExpandedTable(null);
            }}
            className="text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] transition-colors"
          >
            Re-scan
          </button>
        </div>
      )}
    </div>
  );
}
