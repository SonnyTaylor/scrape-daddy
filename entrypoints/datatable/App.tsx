import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download, X, Eye, EyeOff, Pencil, Check, Search, FileSpreadsheet, FileText, Copy, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import { addHistory, generateId } from '@/lib/storage';

interface ColumnDef {
  name: string;
  selector: string;
  attribute: string;
  enabled: boolean;
}

interface TableData {
  columns: ColumnDef[];
  rows: string[][];
  url: string;
  timestamp: number;
  itemCount: number;
}

// Pre-compiled image detection regex patterns
const IMAGE_URL_PATTERNS = [
  /\.(jpg|jpeg|png|gif|webp|svg|avif)/i,
  /\/(image|img|photo|thumb)/i,
  /_next\/image/i,
  /cdn\.shopify/i,
  /cloudinary/i,
  /imgix/i,
];

export default function App() {
  const [data, setData] = useState<TableData | null>(null);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exported, setExported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editingCol !== null && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingCol]);

  const loadData = async () => {
    const result = await browser.storage.local.get('datatable_pending') as Record<string, unknown>;
    const pending = result['datatable_pending'] as TableData | undefined;
    if (!pending) return;

    setData(pending);
    setColumns(pending.columns);
    setRows(pending.rows);

    // Clean up
    await browser.storage.local.remove('datatable_pending');
  };

  const toggleColumn = (idx: number) => {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
  };

  const startEditing = (idx: number) => {
    setEditingCol(idx);
    setEditValue(columns[idx].name);
  };

  const finishEditing = () => {
    if (editingCol !== null && editValue.trim()) {
      setColumns(prev => prev.map((c, i) => i === editingCol ? { ...c, name: editValue.trim() } : c));
    }
    setEditingCol(null);
  };

  const removeColumn = (idx: number) => {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, enabled: false } : c));
  };

  // Memoized filtered view
  const enabledIndices = useMemo(
    () => columns.map((c, i) => c.enabled ? i : -1).filter(i => i >= 0),
    [columns]
  );

  const visibleColumns = useMemo(
    () => columns.filter(c => c.enabled),
    [columns]
  );

  const filteredRows = useMemo(
    () => rows
      .map(row => enabledIndices.map(i => row[i] || ''))
      .filter(row => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return row.some(cell => cell.toLowerCase().includes(q));
      }),
    [rows, enabledIndices, searchQuery]
  );

  const handleExport = async (format: 'csv' | 'xlsx' | 'sheets') => {
    const colNames = visibleColumns.map(c => c.name);
    if (format === 'csv') {
      exportCSV(colNames, filteredRows, 'scrape-data');
      showToast('CSV file downloaded');
    } else if (format === 'xlsx') {
      exportExcel(colNames, filteredRows, 'scrape-data');
      showToast('Excel file downloaded');
    } else {
      copyForSheets(colNames, filteredRows);
      showToast('Copied to clipboard — paste into Google Sheets');
    }

    // Save to history
    if (data && !exported) {
      await addHistory({
        id: generateId(),
        tool: 'list',
        url: data.url,
        timestamp: data.timestamp,
        rowCount: filteredRows.length,
        columns: colNames,
        data: { columns: colNames, rows: filteredRows, url: data.url, timestamp: data.timestamp },
      });
      setExported(true);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen text-[#78716c] text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        Loading data...
      </div>
    );
  }

  const hostname = (() => {
    try { return new URL(data.url).hostname; } catch { return data.url; }
  })();

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#1e1c1a]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            <h1
              className="text-base font-semibold text-[#e7e5e4]"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Data Table
            </h1>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-xs text-[#78716c] truncate max-w-[300px]" title={data.url}>{hostname}</span>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-xs text-[#a8a29e]">{filteredRows.length} rows</span>
          <span className="text-xs text-[#78716c]">{visibleColumns.length} columns</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#78716c] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search rows..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-xs text-[#e7e5e4] placeholder-[#78716c] focus:outline-none focus:border-amber-500/30 w-[180px] transition-colors"
            />
          </div>

          {/* Export buttons */}
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-xs text-[#e7e5e4] hover:bg-white/[0.08] transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-xs text-[#e7e5e4] hover:bg-white/[0.08] transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={() => handleExport('sheets')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-xs text-[#e7e5e4] hover:bg-white/[0.08] transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
        </div>
      </div>

      {/* Column pills bar */}
      <div className="flex items-center gap-1.5 px-5 py-2 border-b border-white/[0.05] bg-[#1a1816] overflow-x-auto">
        <span className="text-[10px] text-[#78716c] uppercase tracking-wide shrink-0 mr-1">Columns</span>
        {columns.map((col, i) => (
          <button
            key={i}
            onClick={() => toggleColumn(i)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition-all shrink-0',
              col.enabled
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                : 'bg-white/[0.03] text-[#78716c] border border-white/[0.06]'
            )}
          >
            {col.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {col.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#252220]">
              <th className="px-4 py-2.5 text-[11px] font-semibold text-[#78716c] w-[50px] text-center border-b border-white/[0.08]">#</th>
              {visibleColumns.map((col, i) => {
                const colIdx = columns.indexOf(col);
                return (
                  <th
                    key={colIdx}
                    className="px-4 py-2.5 border-b border-white/[0.08] min-w-[120px] group"
                  >
                    {editingCol === colIdx ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={editRef}
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={finishEditing}
                          onKeyDown={e => { if (e.key === 'Enter') finishEditing(); if (e.key === 'Escape') setEditingCol(null); }}
                          className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-amber-500/40 text-[12px] text-amber-400 font-semibold focus:outline-none w-full"
                          style={{ fontFamily: "'Outfit', sans-serif" }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide cursor-pointer hover:text-amber-400 transition-colors"
                          style={{ fontFamily: "'Outfit', sans-serif" }}
                          onClick={() => startEditing(colIdx)}
                        >
                          {col.name}
                        </span>
                        <Pencil className="w-3 h-3 text-amber-500/0 group-hover:text-amber-500/50 transition-colors cursor-pointer" onClick={() => startEditing(colIdx)} />
                        <X
                          className="w-3 h-3 text-amber-500/0 group-hover:text-red-400/60 transition-colors cursor-pointer ml-auto"
                          onClick={() => removeColumn(colIdx)}
                        />
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-2.5 text-[11px] text-[#78716c] text-center tabular-nums">{ri + 1}</td>
                {row.map((cell, ci) => {
                  const isUrl = cell.startsWith('http://') || cell.startsWith('https://');
                  // Check if this column is an image column by header name or URL pattern
                  const colName = visibleColumns[ci]?.name.toLowerCase() || '';
                  const isImageCol = colName === 'image' || colName.startsWith('image');
                  const isImageUrl = isUrl && IMAGE_URL_PATTERNS.some(pattern => pattern.test(cell));
                  const showAsImage = isImageCol || isImageUrl;

                  return (
                    <td
                      key={ci}
                      className="px-4 py-2 text-[#e7e5e4] max-w-[300px]"
                      title={cell}
                    >
                      {showAsImage && isUrl ? (
                        <img
                          src={cell}
                          alt=""
                          className="w-12 h-12 rounded object-cover bg-white/[0.05] border border-white/[0.08]"
                          loading="lazy"
                        />
                      ) : isUrl ? (
                        <a
                          href={cell}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-500/80 hover:text-amber-400 underline underline-offset-2 truncate block max-w-[280px] text-[12px]"
                        >
                          {cell}
                        </a>
                      ) : (
                        <span className="truncate block">{cell || <span className="text-[#78716c]">—</span>}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="flex items-center justify-center py-16 text-[#78716c] text-sm">
            {searchQuery ? 'No rows match your search' : 'No data to display'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-white/[0.08] bg-[#1a1816]">
        <span className="text-[11px] text-[#78716c]">
          {filteredRows.length} of {rows.length} rows
          {searchQuery && ` (filtered)`}
        </span>
        <span className="text-[11px] text-[#78716c]">
          ScrapeDaddy · {new Date(data.timestamp).toLocaleDateString()}
        </span>
      </div>

      {/* Toast notification */}
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg',
          'bg-[#252220] border border-amber-500/20 shadow-lg shadow-black/30',
          'transition-all duration-300',
          toast
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-3 pointer-events-none'
        )}
      >
        <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-[12px] text-[#e7e5e4]">{toast}</span>
      </div>
    </div>
  );
}
