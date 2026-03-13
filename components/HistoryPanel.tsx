import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Download,
  FileText,
  Mail,
  Phone,
  ImageIcon,
  List,
  FileSearch,
  Inbox,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Link2,
  Table,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHistory, deleteHistory, clearHistory } from '@/lib/storage';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import type { ScrapeHistoryEntry, EmailResult, PhoneResult, LinkResult, TableResult, TextResult, ExtractionResult, StructuredDataResult } from '@/types';

// Type guards for history data
function isEmailResult(data: ScrapeHistoryEntry['data']): data is EmailResult {
  return !!data && 'emails' in data;
}
function isPhoneResult(data: ScrapeHistoryEntry['data']): data is PhoneResult {
  return !!data && 'phones' in data;
}
function isLinkResult(data: ScrapeHistoryEntry['data']): data is LinkResult {
  return !!data && 'links' in data;
}
function isTableResult(data: ScrapeHistoryEntry['data']): data is TableResult {
  return !!data && 'tables' in data;
}
function isTextResult(data: ScrapeHistoryEntry['data']): data is TextResult {
  return !!data && 'markdown' in data;
}
function isExtractionResult(data: ScrapeHistoryEntry['data']): data is ExtractionResult {
  return !!data && 'columns' in data && 'rows' in data;
}

type ToolFilter = 'all' | string;

const toolIcons: Record<string, React.ReactNode> = {
  list: <List className="w-3.5 h-3.5" />,
  'page-details': <FileSearch className="w-3.5 h-3.5" />,
  'structured-data': <FileSearch className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  phone: <Phone className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
  text: <FileText className="w-3.5 h-3.5" />,
  markdown: <FileText className="w-3.5 h-3.5" />,
  link: <Link2 className="w-3.5 h-3.5" />,
  table: <Table className="w-3.5 h-3.5" />,
};

const toolLabels: Record<string, string> = {
  list: 'List',
  'page-details': 'Structured Data',
  'structured-data': 'Structured Data',
  email: 'Email',
  phone: 'Phone',
  image: 'Image',
  text: 'Markdown',
  markdown: 'Markdown',
  link: 'Links',
  table: 'Table',
};

const toolColors: Record<string, string> = {
  list: 'text-blue-400',
  'page-details': 'text-green-400',
  'structured-data': 'text-green-400',
  email: 'text-amber-400',
  phone: 'text-teal-400',
  image: 'text-red-400',
  text: 'text-purple-400',
  markdown: 'text-purple-400',
  link: 'text-cyan-400',
  table: 'text-pink-400',
};

export default function HistoryPanel() {
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    getHistory().then((h) => {
      setHistory(h);
      setLoaded(true);
    });
  }, []);

  const handleClearAll = async () => {
    await clearHistory();
    setHistory([]);
  };

  const handleDelete = async (id: string) => {
    await deleteHistory(id);
    setHistory((prev) => prev.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleExport = (entry: ScrapeHistoryEntry, format: 'csv' | 'xlsx' | 'sheets') => {
    if (!entry.data) return;
    const data = entry.data;
    const name = `scrape-${entry.tool}`;

    if (isEmailResult(data)) {
      const cols = ['Email', 'Source', 'Context'];
      const rows = data.emails.map(e => [e.email, e.source, e.context]);
      doExport(cols, rows, name, format);
    } else if (isPhoneResult(data)) {
      const cols = ['Phone', 'Source', 'Context'];
      const rows = data.phones.map(p => [p.number, p.source, p.context]);
      doExport(cols, rows, name, format);
    } else if (isLinkResult(data)) {
      const cols = ['URL', 'Text', 'Type', 'Context'];
      const rows = data.links.map(l => [l.url, l.text, l.type, l.context]);
      doExport(cols, rows, name, format);
    } else if (isTableResult(data)) {
      for (const t of data.tables) {
        doExport(t.headers, t.rows, t.caption || name, format);
      }
    } else if (isTextResult(data)) {
      navigator.clipboard.writeText(data.markdown);
    } else if (isExtractionResult(data)) {
      doExport(data.columns, data.rows, name, format);
    } else {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    }
  };

  const doExport = (
    cols: string[],
    rows: string[][],
    name: string,
    format: 'csv' | 'xlsx' | 'sheets',
  ) => {
    if (format === 'csv') exportCSV(cols, rows, name);
    else if (format === 'xlsx') exportExcel(cols, rows, name);
    else copyForSheets(cols, rows);
  };

  const handleCopyData = (entry: ScrapeHistoryEntry) => {
    if (!entry.data) return;
    const data = entry.data;
    let text = '';

    if (isEmailResult(data)) {
      text = data.emails.map(e => e.email).join('\n');
    } else if (isPhoneResult(data)) {
      text = data.phones.map(p => p.number).join('\n');
    } else if (isLinkResult(data)) {
      text = data.links.map(l => l.url).join('\n');
    } else if (isTextResult(data)) {
      text = data.markdown;
    } else {
      text = JSON.stringify(data, null, 2);
    }

    navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const toolTypes = useMemo(() => [...new Set(history.map((e) => e.tool))], [history]);

  const filtered = useMemo(() => {
    let result = history;
    if (toolFilter !== 'all') {
      result = result.filter((e) => e.tool === toolFilter);
    }
    if (search) {
      result = result.filter((e) => e.url.toLowerCase().includes(search.toLowerCase()));
    }
    return result;
  }, [history, toolFilter, search]);

  const getPreviewData = (entry: ScrapeHistoryEntry): string[] => {
    if (!entry.data) return [];
    const data = entry.data;
    if (isEmailResult(data)) {
      return data.emails.slice(0, 5).map(e => e.email);
    }
    if (isPhoneResult(data)) {
      return data.phones.slice(0, 5).map(p => p.number);
    }
    if (isLinkResult(data)) {
      return data.links.slice(0, 5).map(l => l.url);
    }
    if (isTableResult(data)) {
      return data.tables.map(
        (t, i) => `${t.caption || `Table ${i + 1}`}: ${t.headers.length} cols, ${t.rows.length} rows`,
      );
    }
    if (isTextResult(data)) {
      return [data.markdown.slice(0, 200) + '...'];
    }
    if (isExtractionResult(data)) {
      return [`${data.columns.length} columns, ${data.rows.length} rows`];
    }
    return [];
  };

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-[11px] font-semibold uppercase tracking-widest text-[#78716c]"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          Recent Scrapes
        </h2>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear All
          </button>
        )}
      </div>

      {/* Search + filter */}
      {history.length > 0 && (
        <div className="space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by URL..."
            className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] placeholder:text-[#57534e] focus:outline-none focus:border-amber-500/30 transition-colors"
          />
          {toolTypes.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setToolFilter('all')}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                  toolFilter === 'all'
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                    : 'bg-white/[0.03] text-[#78716c] border-white/[0.06] hover:text-[#a8a29e]',
                )}
              >
                All
              </button>
              {toolTypes.map((tool) => (
                <button
                  key={tool}
                  onClick={() => setToolFilter(tool)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                    toolFilter === tool
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                      : 'bg-white/[0.03] text-[#78716c] border-white/[0.06] hover:text-[#a8a29e]',
                  )}
                >
                  {toolLabels[tool] || tool}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {loaded && history.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Inbox className="w-8 h-8 text-[#78716c]/50" />
          <p className="text-[12px] text-[#78716c]">No scrapes yet. Start extracting data!</p>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-2">
        {filtered.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const preview = getPreviewData(entry);

          return (
            <div
              key={entry.id}
              className={cn(
                'rounded-[10px]',
                'bg-white/[0.02] border border-white/[0.05]',
                'hover:bg-white/[0.04] transition-colors',
              )}
            >
              {/* Main row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] shrink-0',
                    toolColors[entry.tool] || 'text-[#a8a29e]',
                  )}
                >
                  {toolIcons[entry.tool] || <FileText className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-[#78716c] uppercase">
                      {toolLabels[entry.tool] || entry.tool}
                    </span>
                    <span className="text-[9px] text-[#57534e]">&middot;</span>
                    <span className="text-[10px] text-[#57534e]">{entry.rowCount} items</span>
                  </div>
                  <p className="text-[12px] text-[#e7e5e4] truncate">{entry.url}</p>
                  <p className="text-[10px] text-[#78716c]">
                    {formatDate(entry.timestamp)} at {formatTime(entry.timestamp)}
                  </p>
                </div>
                <div className="shrink-0 text-[#57534e]">
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && entry.data && (
                <div className="border-t border-white/[0.05] px-3 py-2.5 space-y-2">
                  {/* Preview */}
                  {preview.length > 0 && (
                    <div className="space-y-1 max-h-[150px] overflow-y-auto">
                      {preview.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-white/[0.02] text-[10px] text-[#a8a29e] font-mono truncate"
                        >
                          {item}
                        </div>
                      ))}
                      {entry.rowCount > 5 && (
                        <p className="text-[9px] text-[#57534e] text-center">
                          +{entry.rowCount - 5} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleExport(entry, 'csv')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/20 hover:bg-amber-500/25 transition-colors"
                    >
                      <Download className="w-2.5 h-2.5" />
                      CSV
                    </button>
                    <button
                      onClick={() => handleExport(entry, 'xlsx')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.04] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4] transition-colors"
                    >
                      <Download className="w-2.5 h-2.5" />
                      Excel
                    </button>
                    <button
                      onClick={() => handleExport(entry, 'sheets')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.04] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4] transition-colors"
                    >
                      <Download className="w-2.5 h-2.5" />
                      Sheets
                    </button>
                    <button
                      onClick={() => handleCopyData(entry)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                        copiedId === entry.id
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-white/[0.04] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4]',
                      )}
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : (
                        <Copy className="w-2.5 h-2.5" />
                      )}
                      {copiedId === entry.id ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.04] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4] transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Open URL
                    </a>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors ml-auto"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
