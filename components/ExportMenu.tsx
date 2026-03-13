import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, ClipboardCopy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportMenuProps {
  onExport: (format: 'csv' | 'xlsx' | 'sheets') => void;
}

const options: { id: 'csv' | 'xlsx' | 'sheets'; label: string; icon: React.ReactNode }[] = [
  { id: 'csv', label: 'CSV', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'xlsx', label: 'Excel (.xlsx)', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
  { id: 'sheets', label: 'Copy for Google Sheets', icon: <ClipboardCopy className="w-3.5 h-3.5" /> },
];

export default function ExportMenu({ onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
          'bg-amber-500/15 text-amber-500 border border-amber-500/20',
          'hover:bg-amber-500/25 transition-colors'
        )}
      >
        <Download className="w-3.5 h-3.5" />
        Export
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-48 rounded-lg bg-[#1e1c19] border border-white/[0.08] shadow-xl z-50 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onExport(opt.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#e7e5e4] hover:bg-white/[0.05] transition-colors"
            >
              <span className="text-[#a8a29e]">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
