import { useState } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ScanSearch,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Code,
  Globe,
  Share2,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import { useContentScript } from '@/lib/useContentScript';
import { addHistory, generateId } from '@/lib/storage';
import type { StructuredDataResult } from '@/types';
import { saveAs } from 'file-saver';

interface PageDetailsExtractorProps {
  onNavigate: (view: View) => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, count, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#78716c] shrink-0" />
        )}
        <span className="shrink-0 text-[#a8a29e]">{icon}</span>
        <span
          className="text-[12px] font-semibold text-[#e7e5e4] flex-1"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          {title}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
          {count}
        </span>
      </button>
      {open && <div className="px-3 pb-3 border-t border-white/[0.05]">{children}</div>}
    </div>
  );
}

function KeyValueList({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-[11px] text-[#78716c] py-2">No data found</p>;

  return (
    <div className="space-y-1.5 pt-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-[11px]">
          <span className="text-[#78716c] font-mono shrink-0 min-w-0 break-all">{key}</span>
          <span className="text-[#a8a29e] break-all flex-1">{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PageDetailsExtractor({ onNavigate }: PageDetailsExtractorProps) {
  const [data, setData] = useState<StructuredDataResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { sendMessage, loading, error } = useContentScript();

  const handleScan = async () => {
    try {
      const result: StructuredDataResult = await sendMessage({
        type: 'EXTRACT_STRUCTURED_DATA',
      });

      setData(result);

      const totalItems =
        result.jsonLd.length +
        Object.keys(result.openGraph).length +
        Object.keys(result.twitterCard).length +
        Object.keys(result.meta).length +
        result.microdata.length;

      await addHistory({
        id: generateId(),
        tool: 'structured-data',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: totalItems,
        data: result,
      });
    } catch {
      // error set by hook
    }
  };

  const handleCopyAll = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const hostname = new URL(data.url).hostname.replace(/\./g, '-');
    saveAs(blob, `structured-data-${hostname}.json`);
  };

  const handleRescan = () => {
    setData(null);
    setCopied(false);
  };

  const ogImageUrl = data?.openGraph['og:image'];

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
          Structured Data
        </h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {/* Initial state — scan button */}
      {!data && !loading && (
        <div className="space-y-4">
          <p className="text-[12px] text-[#a8a29e]">
            Auto-detect and display all structured metadata from this page — JSON-LD, OpenGraph, Twitter Cards, meta tags, and Schema.org microdata.
          </p>
          <button
            onClick={handleScan}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
              'bg-amber-500 text-black text-sm font-semibold',
              'hover:bg-amber-400 active:bg-amber-600 transition-colors',
            )}
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            <ScanSearch className="w-4 h-4" />
            Scan Page
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-4 py-8">
          <div className="flex flex-col items-center space-y-3">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="text-[12px] text-[#a8a29e]">Scanning for structured data...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div className="space-y-3">
          {/* Meta Tags */}
          <CollapsibleSection
            title="Meta Tags"
            icon={<Globe className="w-3.5 h-3.5" />}
            count={Object.keys(data.meta).length}
            defaultOpen={true}
          >
            <KeyValueList data={data.meta} />
          </CollapsibleSection>

          {/* Open Graph */}
          <CollapsibleSection
            title="Open Graph"
            icon={<Share2 className="w-3.5 h-3.5" />}
            count={Object.keys(data.openGraph).length}
            defaultOpen={Object.keys(data.openGraph).length > 0}
          >
            {ogImageUrl && (
              <div className="pt-2 pb-1">
                <img
                  src={ogImageUrl}
                  alt="og:image preview"
                  className="w-full max-h-32 object-cover rounded border border-white/[0.08]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <KeyValueList data={data.openGraph} />
          </CollapsibleSection>

          {/* Twitter Card */}
          <CollapsibleSection
            title="Twitter Card"
            icon={<Share2 className="w-3.5 h-3.5" />}
            count={Object.keys(data.twitterCard).length}
            defaultOpen={Object.keys(data.twitterCard).length > 0}
          >
            <KeyValueList data={data.twitterCard} />
          </CollapsibleSection>

          {/* JSON-LD */}
          <CollapsibleSection
            title="JSON-LD"
            icon={<Code className="w-3.5 h-3.5" />}
            count={data.jsonLd.length}
            defaultOpen={data.jsonLd.length > 0}
          >
            {data.jsonLd.length === 0 ? (
              <p className="text-[11px] text-[#78716c] py-2">No JSON-LD found</p>
            ) : (
              <pre className="mt-2 p-3 rounded-md bg-black/30 border border-white/[0.05] overflow-x-auto text-[10px] leading-relaxed font-mono text-[#a8a29e]">
                <code>{JSON.stringify(data.jsonLd, null, 2)}</code>
              </pre>
            )}
          </CollapsibleSection>

          {/* Microdata */}
          <CollapsibleSection
            title="Microdata"
            icon={<Code className="w-3.5 h-3.5" />}
            count={data.microdata.length}
            defaultOpen={data.microdata.length > 0}
          >
            {data.microdata.length === 0 ? (
              <p className="text-[11px] text-[#78716c] py-2">No microdata found</p>
            ) : (
              <div className="space-y-3 pt-2">
                {data.microdata.map((item, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-[11px] font-mono text-amber-500/80 break-all">{item.type}</p>
                    <KeyValueList data={item.properties} />
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={handleCopyAll}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                copied
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-white/[0.03] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4] hover:border-white/[0.12]',
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy All
                </>
              )}
            </button>
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.03] text-[#a8a29e] border border-white/[0.08] hover:text-[#e7e5e4] hover:border-white/[0.12] transition-colors"
            >
              <Download className="w-3 h-3" />
              Export JSON
            </button>
            <button
              onClick={handleRescan}
              className="flex items-center gap-1.5 ml-auto text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] transition-colors"
            >
              <ScanSearch className="w-3 h-3" />
              Re-scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
