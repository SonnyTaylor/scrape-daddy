import { useState } from 'react';
import {
  ChevronLeft,
  FileText,
  Loader2,
  Copy,
  Check,
  Download,
  AlertCircle,
  Clock,
  Type,
  FileCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import type { TextResult } from '@/types';
import { useContentScript } from '@/lib/useContentScript';
import { addHistory, generateId } from '@/lib/storage';
import { saveAs } from 'file-saver';

interface TextExtractorProps {
  onNavigate: (view: View) => void;
}

export default function TextExtractor({ onNavigate }: TextExtractorProps) {
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [result, setResult] = useState<TextResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const { sendMessage, loading, error } = useContentScript();

  const handleExtract = async () => {
    try {
      const res = await sendMessage({ type: 'EXTRACT_TEXT' });
      setResult(res);
      setState('done');

      await addHistory({
        id: generateId(),
        tool: 'markdown',
        url: res.url,
        timestamp: res.timestamp,
        rowCount: 1,
        data: res,
      });
    } catch {
      // error is set by the hook
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyPlain = () => {
    if (!result) return;
    // Strip markdown syntax for plain text
    const plain = result.markdown
      .replace(/^#{1,6}\s+/gm, '') // headings
      .replace(/\*\*(.*?)\*\*/g, '$1') // bold
      .replace(/\*(.*?)\*/g, '$1') // italic
      .replace(/`([^`]+)`/g, '$1') // inline code
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim()) // code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
      .replace(/^[>\-*]\s+/gm, '') // blockquotes, list markers
      .replace(/^\d+\.\s+/gm, '') // ordered list markers
      .replace(/^\|.*\|$/gm, (row) =>
        row
          .split('|')
          .filter(Boolean)
          .map((c) => c.trim())
          .join('\t'),
      ) // tables to TSV
      .replace(/^\|[\s\-|]+\|$/gm, '') // table separators
      .replace(/^---$/gm, '') // hr
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    navigator.clipboard.writeText(plain);
    setCopiedPlain(true);
    setTimeout(() => setCopiedPlain(false), 1500);
  };

  const handleExportMd = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
    const filename = getFilename(result.title);
    saveAs(blob, filename + '.md');
  };

  const handleExportTxt = () => {
    if (!result) return;
    const plain = result.markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
    const filename = getFilename(result.title);
    saveAs(blob, filename + '.txt');
  };

  const handleExportHtml = () => {
    if (!result) return;
    // Basic markdown to HTML conversion for export
    let html = result.markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.title}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6;color:#333}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:1rem;border-radius:6px;overflow-x:auto}blockquote{border-left:3px solid #ddd;padding-left:1rem;color:#666}img{max-width:100%}</style>
</head>
<body>
${html}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const filename = getFilename(result.title);
    saveAs(blob, filename + '.html');
  };

  const getFilename = (title: string) =>
    (title || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);

  const handleReset = () => {
    setState('idle');
    setResult(null);
    setCopied(false);
    setCopiedPlain(false);
  };

  // Reading time: ~200 words/minute average
  const readingTime = result ? Math.max(1, Math.ceil(result.wordCount / 200)) : 0;

  // Character count
  const charCount = result ? result.markdown.length : 0;

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
          Page to Markdown
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
            Convert the current page into clean, well-structured markdown. Useful for AI input,
            note-taking, and documentation.
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
            <FileText className="w-4 h-4" />
            Convert to Markdown
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Converting page to markdown...</p>
        </div>
      )}

      {state === 'done' && !loading && result && (
        <div className="space-y-3">
          {/* Stats badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/20"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              <Type className="w-2.5 h-2.5" />
              {result.wordCount.toLocaleString()} words
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
              <Clock className="w-2.5 h-2.5" />
              {readingTime} min read
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-[#78716c] border border-white/[0.06]">
              {charCount.toLocaleString()} chars
            </span>
          </div>

          {/* Markdown preview */}
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
              <span
                className="text-[11px] font-semibold uppercase tracking-wide text-[#78716c]"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Markdown Preview
              </span>
              <span className="text-[9px] text-[#57534e] font-mono">
                {result.title}
              </span>
            </div>
            <div className="px-3 py-2 max-h-[320px] overflow-y-auto">
              <pre className="text-[11px] text-[#e7e5e4] whitespace-pre-wrap font-mono leading-relaxed">
                {result.markdown}
              </pre>
            </div>
          </div>

          {/* Copy buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-amber-500/15 text-amber-500 border border-amber-500/20',
                'hover:bg-amber-500/25 transition-colors',
              )}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? 'Copied!' : 'Copy Markdown'}
            </button>

            <button
              onClick={handleCopyPlain}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-white/[0.04] text-[#a8a29e] border border-white/[0.08]',
                'hover:text-[#e7e5e4] hover:bg-white/[0.06] transition-colors',
              )}
            >
              {copiedPlain ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Type className="w-3.5 h-3.5" />
              )}
              {copiedPlain ? 'Copied!' : 'Copy Plain Text'}
            </button>
          </div>

          {/* Export buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportMd}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-white/[0.04] text-[#a8a29e] border border-white/[0.08]',
                'hover:text-[#e7e5e4] hover:bg-white/[0.06] transition-colors',
              )}
            >
              <Download className="w-3.5 h-3.5" />
              .md
            </button>

            <button
              onClick={handleExportTxt}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-white/[0.04] text-[#a8a29e] border border-white/[0.08]',
                'hover:text-[#e7e5e4] hover:bg-white/[0.06] transition-colors',
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              .txt
            </button>

            <button
              onClick={handleExportHtml}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-white/[0.04] text-[#a8a29e] border border-white/[0.08]',
                'hover:text-[#e7e5e4] hover:bg-white/[0.06] transition-colors',
              )}
            >
              <FileCode className="w-3.5 h-3.5" />
              .html
            </button>

            <button
              onClick={handleReset}
              className="ml-auto text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] transition-colors"
            >
              Re-extract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
