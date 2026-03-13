import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
}

export default function ToolCard({ icon: Icon, title, description, color, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full flex items-center gap-3 p-3 rounded-[10px]',
        'bg-white/[0.02] border border-white/[0.05]',
        'hover:bg-amber-500/[0.04] transition-all duration-200',
        'text-left cursor-pointer'
      )}
    >
      {/* Animated left amber edge */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0 group-hover:w-[3px] rounded-full bg-amber-500 transition-all duration-200"
      />

      {/* Icon */}
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg text-base shrink-0"
        style={{
          backgroundColor: `${color}15`,
          border: `1px solid ${color}30`,
        }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>

      {/* Text */}
      <div className="min-w-0">
        <h3
          className="text-[13px] font-medium text-[#e7e5e4] leading-tight"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          {title}
        </h3>
        <p className="text-[11px] text-[#78716c] leading-snug mt-0.5 line-clamp-2">
          {description}
        </p>
      </div>
    </button>
  );
}
