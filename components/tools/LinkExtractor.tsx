import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  Link2,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  CopyCheck,
  ExternalLink,
  Globe,
  Share2,
  FileDown,
  Mail,
  Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportMenu from '@/components/ExportMenu';
import type { View } from '@/components/Layout';
import type { LinkEntry } from '@/types';
import { useContentScript } from '@/lib/useContentScript';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import { addHistory, generateId } from '@/lib/storage';
import { useClipboard } from '@/lib/useClipboard';

interface LinkExtractorProps {
  onNavigate: (view: View) => void;
}

type LinkFilter = 'all' | 'internal' | 'external' | 'social' | 'email' | 'phone' | 'file';

const typeConfig: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }
> = {
  internal: {
    label: 'Internal',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    icon: <Globe className="w-2.5 h-2.5" />,
  },
  external: {
    label: 'External',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    icon: <ExternalLink className="w-2.5 h-2.5" />,
  },
  social: {
    label: 'Social',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    icon: <Share2 className="w-2.5 h-2.5" />,
  },
  email: {
    label: 'Email',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    icon: <Mail className="w-2.5 h-2.5" />,
  },
  phone: {
    label: 'Phone',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/20',
    icon: <Phone className="w-2.5 h-2.5" />,
  },
  file: {
    label: 'File',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    icon: <FileDown className="w-2.5 h-2.5" />,
  },
  other: {
    label: 'Other',
    color: 'text-[#78716c]',
    bgColor: 'bg-white/[0.04]',
    borderColor: 'border-white/[0.08]',
    icon: <Link2 className="w-2.5 h-2.5" />,
  },
};

export default function LinkExtractor({ onNavigate }: LinkExtractorProps) {
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<LinkFilter>('all');
  const { sendMessage, loading, error } = useContentScript();
  const { copiedIdx, copiedAll, copyOne, copyAll } = useClipboard();

  const handleExtract = async () => {
    try {
      const result = await sendMessage({ type: 'EXTRACT_LINKS' });
      setLinks(result.links);
      setState('done');

      await addHistory({
        id: generateId(),
        tool: 'link',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: result.links.length,
        data: result,
      });
    } catch {
      // error set by hook
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'sheets') => {
    const columns = ['URL', 'Text', 'Type', 'Context'];
    const rows = filteredLinks.map((l) => [l.url, l.text, l.type, l.context]);
    if (format === 'csv') exportCSV(columns, rows, 'links');
    else if (format === 'xlsx') exportExcel(columns, rows, 'links');
    else copyForSheets(columns, rows);
  };

  // Filter
  const filteredLinks = useMemo(() => {
    let result = links;
    if (typeFilter !== 'all') {
      result = result.filter((l) => l.type === typeFilter);
    }
    if (filter) {
      result = result.filter(
        (l) =>
          l.url.toLowerCase().includes(filter.toLowerCase()) ||
          l.text.toLowerCase().includes(filter.toLowerCase()),
      );
    }
    return result;
  }, [links, filter, typeFilter]);

  // Type counts
  const typeCounts = useMemo(
    () =>
      links.reduce(
        (acc, l) => {
          acc[l.type] = (acc[l.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [links],
  );

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
          Link Extractor
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
            Extract and classify all links from the current page — internal, external, social media,
            emails, phone numbers, and file downloads.
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
            <Link2 className="w-4 h-4" />
            Extract Links
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Scanning page for links...</p>
        </div>
      )}

      {state === 'done' && !loading && (
        <div className="space-y-4">
          {/* Count badge */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[11px] font-semibold">
              {links.length} found
            </span>
          </div>

          {links.length === 0 ? (
            <p className="text-[12px] text-[#78716c] py-4 text-center">
              No links found on this page.
            </p>
          ) : (
            <>
              {/* Type filter chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                    typeFilter === 'all'
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/20'
                      : 'bg-white/[0.03] text-[#78716c] border-white/[0.06] hover:text-[#a8a29e]',
                  )}
                >
                  All ({links.length})
                </button>
                {Object.entries(typeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const conf = typeConfig[type];
                    return (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(type as LinkFilter)}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                          typeFilter === type
                            ? `${conf.bgColor} ${conf.color} ${conf.borderColor}`
                            : 'bg-white/[0.03] text-[#78716c] border-white/[0.06] hover:text-[#a8a29e]',
                        )}
                      >
                        {conf.label} ({count})
                      </button>
                    );
                  })}
              </div>

              {/* Search */}
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by URL or text..."
                className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] placeholder:text-[#57534e] focus:outline-none focus:border-amber-500/30 transition-colors"
              />

              {/* Links list */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredLinks.map((link, i) => {
                  const conf = typeConfig[link.type];
                  return (
                    <div
                      key={i}
                      className="px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 border',
                              conf.bgColor,
                              conf.color,
                              conf.borderColor,
                            )}
                          >
                            {conf.icon}
                            {conf.label}
                          </span>
                          <span className="text-[11px] text-[#e7e5e4] truncate font-mono">
                            {link.url}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          {link.type !== 'email' && link.type !== 'phone' && (
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-[#78716c] hover:text-amber-500 transition-colors"
                              title="Open link"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {link.type === 'email' && (
                            <a
                              href={link.url}
                              className="p-1 rounded text-[#78716c] hover:text-amber-500 transition-colors"
                              title="Compose email"
                            >
                              <Mail className="w-3 h-3" />
                            </a>
                          )}
                          {link.type === 'phone' && (
                            <a
                              href={link.url}
                              className="p-1 rounded text-[#78716c] hover:text-green-400 transition-colors"
                              title="Call"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            onClick={() => copyOne(link.url, i)}
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
                      {link.text && (
                        <p className="text-[10px] text-[#a8a29e] mt-1 truncate">{link.text}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {filteredLinks.length > 0 && <ExportMenu onExport={handleExport} />}
              {filteredLinks.length > 1 && (
                <button
                  onClick={() => copyAll(filteredLinks.map(l => l.url).join('\n'))}
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
                  {copiedAll ? 'Copied!' : 'Copy All URLs'}
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setState('idle');
                setLinks([]);
                setFilter('');
                setTypeFilter('all');
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
