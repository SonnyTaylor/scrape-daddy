import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ScanSearch,
  Loader2,
  Download,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowUpDown,
  Check,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { View } from '@/components/Layout';
import type { ImageInfo } from '@/types';
import { useContentScript } from '@/lib/useContentScript';
import { addHistory, generateId } from '@/lib/storage';
import { useClipboard } from '@/lib/useClipboard';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ImageDownloaderProps {
  onNavigate: (view: View) => void;
}

interface SelectableImage extends ImageInfo {
  id: number;
  selected: boolean;
}

type SortMode = 'default' | 'size-desc' | 'size-asc' | 'type';

export default function ImageDownloader({ onNavigate }: ImageDownloaderProps) {
  const [state, setState] = useState<'idle' | 'done'>('idle');
  const [images, setImages] = useState<SelectableImage[]>([]);
  const [minWidth, setMinWidth] = useState(100);
  const [minHeight, setMinHeight] = useState(100);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [urlFilter, setUrlFilter] = useState('');
  const { sendMessage, loading, error } = useContentScript();
  const { copiedIdx, copyOne } = useClipboard();

  const handleScan = async () => {
    try {
      const result = await sendMessage({ type: 'EXTRACT_IMAGES', payload: { minWidth, minHeight } });
      const selectableImages: SelectableImage[] = result.images.map((img: ImageInfo, i: number) => ({
        ...img,
        id: i,
        selected: true,
      }));
      setImages(selectableImages);
      setState('done');

      await addHistory({
        id: generateId(),
        tool: 'image',
        url: result.url,
        timestamp: result.timestamp,
        rowCount: result.images.length,
        data: result,
      });
    } catch {
      // error is set by the hook
    }
  };

  const toggleImage = (id: number) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, selected: !img.selected } : img)),
    );
  };

  const selectAll = () => setImages((prev) => prev.map((img) => ({ ...img, selected: true })));
  const deselectAll = () => setImages((prev) => prev.map((img) => ({ ...img, selected: false })));

  // Apply filters and sorting
  const sortedImages = useMemo(() => {
    let filteredImages = images.filter((img) => img.width >= minWidth && img.height >= minHeight);
    if (urlFilter) {
      filteredImages = filteredImages.filter((img) =>
        img.src.toLowerCase().includes(urlFilter.toLowerCase()),
      );
    }

    // Sort
    return [...filteredImages].sort((a, b) => {
      switch (sortMode) {
        case 'size-desc':
          return b.width * b.height - a.width * a.height;
        case 'size-asc':
          return a.width * a.height - b.width * b.height;
        case 'type':
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });
  }, [images, minWidth, minHeight, urlFilter, sortMode]);

  const selectedCount = useMemo(
    () => sortedImages.filter((img) => img.selected).length,
    [sortedImages],
  );

  const { totalPixels, estimatedMB } = useMemo(() => {
    const pixels = sortedImages
      .filter((img) => img.selected)
      .reduce((sum, img) => sum + img.width * img.height, 0);
    return { totalPixels: pixels, estimatedMB: (pixels * 3) / (1024 * 1024) };
  }, [sortedImages]);

  const cycleSortMode = () => {
    const modes: SortMode[] = ['default', 'size-desc', 'size-asc', 'type'];
    const idx = modes.indexOf(sortMode);
    setSortMode(modes[(idx + 1) % modes.length]);
  };

  const sortLabel = {
    default: 'Default order',
    'size-desc': 'Largest first',
    'size-asc': 'Smallest first',
    type: 'By type',
  }[sortMode];

  const handleDownload = async () => {
    const selected = sortedImages.filter((img) => img.selected);
    if (selected.length === 0) return;

    setDownloading(true);
    setDownloadProgress(0);
    try {
      const zip = new JSZip();
      const folder = zip.folder('images');
      if (!folder) return;

      let completed = 0;
      await Promise.all(
        selected.map(async (img, i) => {
          try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            const ext = img.type !== 'unknown' ? img.type : 'png';
            // Use alt text or dimensions for filename
            const name = img.alt
              ? img.alt.replace(/[^a-z0-9]/gi, '-').slice(0, 40)
              : `image-${i + 1}`;
            folder.file(`${name}.${ext}`, blob);
          } catch {
            // Skip images that fail to download
          }
          completed++;
          setDownloadProgress(Math.round((completed / selected.length) * 100));
        }),
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'images.zip');
    } catch {
      // Download failed silently
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
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
          Image Downloader
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
            Scan the current page for downloadable images. Filter by size and download in bulk.
          </p>

          {/* Size filters before scanning */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#78716c] uppercase tracking-wide">
                Min width
              </label>
              <input
                type="number"
                value={minWidth}
                onChange={(e) => setMinWidth(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#78716c] uppercase tracking-wide">
                Min height
              </label>
              <input
                type="number"
                value={minHeight}
                onChange={(e) => setMinHeight(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
              />
            </div>
          </div>

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

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          <p className="text-[12px] text-[#a8a29e]">Scanning page for images...</p>
        </div>
      )}

      {state === 'done' && !loading && (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#78716c] uppercase tracking-wide">
                Min width
              </label>
              <input
                type="number"
                value={minWidth}
                onChange={(e) => setMinWidth(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-[#78716c] uppercase tracking-wide">
                Min height
              </label>
              <input
                type="number"
                value={minHeight}
                onChange={(e) => setMinHeight(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
              />
            </div>
          </div>

          {/* URL filter */}
          <input
            type="text"
            value={urlFilter}
            onChange={(e) => setUrlFilter(e.target.value)}
            placeholder="Filter by URL..."
            className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[12px] text-[#e7e5e4] placeholder:text-[#57534e] focus:outline-none focus:border-amber-500/30 transition-colors"
          />

          {/* Select controls + sort */}
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
            >
              <CheckSquare className="w-3 h-3" />
              All
            </button>
            <button
              onClick={deselectAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
            >
              <Square className="w-3 h-3" />
              None
            </button>
            <button
              onClick={cycleSortMode}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortLabel}
            </button>
            <span className="ml-auto text-[11px] text-[#78716c]">{sortedImages.length} images</span>
          </div>

          {sortedImages.length === 0 ? (
            <p className="text-[12px] text-[#78716c] py-4 text-center">
              No images found matching the filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {sortedImages.map((img) => (
                <div key={img.id} className="relative rounded-lg overflow-hidden border transition-all group"
                  style={{
                    borderColor: img.selected
                      ? 'rgba(245, 158, 11, 0.4)'
                      : 'rgba(255, 255, 255, 0.05)',
                    opacity: img.selected ? 1 : 0.6,
                  }}
                >
                  <button
                    onClick={() => toggleImage(img.id)}
                    className="w-full"
                  >
                    <div className="aspect-[4/3] bg-white/[0.03] flex items-center justify-center overflow-hidden">
                      <img
                        src={img.src}
                        alt={img.alt || ''}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const parent = (e.target as HTMLImageElement).parentElement;
                          if (parent) {
                            const fallback = document.createElement('span');
                            fallback.className = 'text-[10px] text-[#78716c]';
                            fallback.textContent = `${img.width}x${img.height}`;
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </div>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/60 text-[9px] text-[#a8a29e] truncate flex items-center gap-1">
                    <span>
                      {img.width}x{img.height} {img.type !== 'unknown' ? img.type : ''}
                    </span>
                    {img.source === 'background' && (
                      <span className="px-1 py-px rounded bg-white/10 text-[8px] font-medium text-[#78716c]">
                        BG
                      </span>
                    )}
                  </div>
                  {/* Selection checkbox */}
                  <button
                    onClick={() => toggleImage(img.id)}
                    className={cn(
                      'absolute top-1.5 right-1.5 w-4 h-4 rounded flex items-center justify-center text-[10px]',
                      img.selected ? 'bg-amber-500 text-black' : 'bg-black/50 text-white/50',
                    )}
                  >
                    {img.selected ? '\u2713' : ''}
                  </button>
                  {/* Copy URL button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyOne(img.src, img.id);
                    }}
                    className="absolute top-1.5 left-1.5 w-5 h-5 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy image URL"
                  >
                    {copiedIdx === img.id ? (
                      <Check className="w-2.5 h-2.5 text-green-400" />
                    ) : (
                      <Link className="w-2.5 h-2.5 text-white/70" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Download button with progress */}
          <button
            onClick={handleDownload}
            disabled={selectedCount === 0 || downloading}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg relative overflow-hidden',
              'bg-amber-500 text-black text-xs font-semibold',
              'hover:bg-amber-400 transition-colors',
              (selectedCount === 0 || downloading) && 'opacity-40 pointer-events-none',
            )}
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {downloading && (
              <div
                className="absolute inset-0 bg-amber-600/50 transition-all"
                style={{ width: `${downloadProgress}%` }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {downloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Downloading... {downloadProgress}%
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download Selected ({selectedCount})
                  {estimatedMB > 1 && (
                    <span className="text-[10px] opacity-70">~{estimatedMB.toFixed(0)}MB</span>
                  )}
                </>
              )}
            </span>
          </button>

          <button
            onClick={() => {
              setState('idle');
              setImages([]);
              setUrlFilter('');
              setSortMode('default');
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
