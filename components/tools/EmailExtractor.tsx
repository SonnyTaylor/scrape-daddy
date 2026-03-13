import { useState, useMemo } from 'react';
import { ChevronLeft, Mail, Loader2, Copy, Check, AlertCircle, Link, FileText, CopyCheck, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportMenu from '@/components/ExportMenu';
import type { View } from '@/components/Layout';
import { useContentScript } from '@/lib/useContentScript';
import { useClipboard } from '@/lib/useClipboard';
import { exportCSV, exportExcel, copyForSheets } from '@/lib/export';
import { addHistory, generateId } from '@/lib/storage';
import type { EmailEntry } from '@/types';

interface EmailExtractorProps {
  onNavigate: (view: View) => void;
}

export default function EmailExtractor({ onNavigate }: EmailExtractorProps) {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [filter, setFilter] = useState('');
  const { sendMessage, loading, error } = useContentScript();
  const { copiedIdx, copiedAll, copyOne, copyAll } = useClipboard();

  const handleExtract = async () => {
    try {
      const result = await sendMessage({ type: 'EXTRACT_EMAILS' });
      setEmails(result.emails);
      setState('done');

      await addHistory({
        id: generateId(),
        tool: 'email',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: result.emails.length,
        data: result,
      });
    } catch {
      // error is set by the hook
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'sheets') => {
    const columns = ['Email', 'Source', 'Context'];
    const rows = filteredEmails.map((e) => [e.email, e.source, e.context]);
    if (format === 'csv') exportCSV(columns, rows, 'emails');
    else if (format === 'xlsx') exportExcel(columns, rows, 'emails');
    else copyForSheets(columns, rows);
  };

  const filteredEmails = useMemo(
    () =>
      filter
        ? emails.filter(
            (e) =>
              e.email.toLowerCase().includes(filter.toLowerCase()) ||
              e.context.toLowerCase().includes(filter.toLowerCase()),
          )
        : emails,
    [emails, filter],
  );

  // Group by domain for summary
  const { domainCounts, topDomains } = useMemo(() => {
    const counts = emails.reduce(
      (acc, e) => {
        const domain = e.email.split('@')[1] || 'unknown';
        acc[domain] = (acc[domain] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { domainCounts: counts, topDomains: top };
  }, [emails]);

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
          Email Extractor
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
            Scan the current page for email addresses. Works with mailto links, visible text, and
            href attributes.
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
            <Mail className="w-4 h-4" />
            Extract Emails
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Scanning page for emails...</p>
        </div>
      )}

      {state === 'done' && !loading && (
        <div className="space-y-4">
          {/* Count badge + domain summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[11px] font-semibold">
              {emails.length} found
            </span>
            {topDomains.map(([domain, count]) => (
              <span
                key={domain}
                className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.04] text-[#78716c] border border-white/[0.06]"
              >
                @{domain} ({count})
              </span>
            ))}
          </div>

          {emails.length === 0 ? (
            <p className="text-[12px] text-[#78716c] py-4 text-center">
              No email addresses found on this page.
            </p>
          ) : (
            <>
              {/* Search filter */}
              {emails.length > 3 && (
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter emails..."
                  className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] placeholder:text-[#57534e] focus:outline-none focus:border-amber-500/30 transition-colors"
                />
              )}

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredEmails.map((entry, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[12px] text-[#e7e5e4] truncate font-mono">
                          {entry.email}
                        </span>
                        {entry.source === 'mailto' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 shrink-0">
                            <Link className="w-2.5 h-2.5" />
                            mailto
                          </span>
                        )}
                        {entry.source === 'href' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                            <Link className="w-2.5 h-2.5" />
                            href
                          </span>
                        )}
                        {entry.source === 'page-text' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                            <FileText className="w-2.5 h-2.5" />
                            text
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <a
                          href={`mailto:${entry.email}`}
                          className="p-1 rounded text-[#78716c] hover:text-amber-500 transition-colors"
                          title="Compose email"
                        >
                          <Send className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => copyOne(entry.email, i)}
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
                    {entry.context && (
                      <p className="text-[10px] text-[#78716c] mt-1 truncate">{entry.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {emails.length > 0 && <ExportMenu onExport={handleExport} />}
              {emails.length > 1 && (
                <button
                  onClick={() => copyAll(filteredEmails.map(e => e.email).join('\n'))}
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
                setEmails([]);
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
