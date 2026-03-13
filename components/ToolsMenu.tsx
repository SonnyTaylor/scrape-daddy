import { RotateCw, List, Code, Mail, Phone, ImageIcon, FileText, Link2, Table } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import ToolCard from './ToolCard';
import type { View } from './Layout';

interface ToolsMenuProps {
  onNavigate: (view: View) => void;
}

const tools: {
  id: View;
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'list-extractor',
    icon: List,
    title: 'List Extractor',
    description: 'Extract data from lists, tables, and paginated content',
    color: '#3b82f6',
  },
  {
    id: 'page-details-extractor',
    icon: Code,
    title: 'Structured Data',
    description: 'Extract JSON-LD, OpenGraph, meta tags, and microdata',
    color: '#22c55e',
  },
  {
    id: 'email-extractor',
    icon: Mail,
    title: 'Email Extractor',
    description: 'Find and collect email addresses at scale',
    color: '#f59e0b',
  },
  {
    id: 'phone-extractor',
    icon: Phone,
    title: 'Phone Extractor',
    description: 'Extract phone numbers from pages',
    color: '#14b8a6',
  },
  {
    id: 'image-downloader',
    icon: ImageIcon,
    title: 'Image Downloader',
    description: 'Bulk download images from current page',
    color: '#ef4444',
  },
  {
    id: 'link-extractor',
    icon: Link2,
    title: 'Link Extractor',
    description: 'Extract and classify all URLs from the page',
    color: '#06b6d4',
  },
  {
    id: 'table-extractor',
    icon: Table,
    title: 'Table Extractor',
    description: 'Detect and extract HTML tables with headers',
    color: '#ec4899',
  },
  {
    id: 'text-extractor',
    icon: FileText,
    title: 'Page to Markdown',
    description: 'Convert page content to clean, structured markdown',
    color: '#a855f7',
  },
];

export default function ToolsMenu({ onNavigate }: ToolsMenuProps) {
  return (
    <div className="p-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-[11px] font-semibold uppercase tracking-widest text-[#78716c]"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          Extractors
        </h2>
        <button
          onClick={() => onNavigate('history')}
          className="flex items-center gap-1 text-[11px] text-[#a8a29e] hover:text-amber-500 transition-colors"
        >
          <RotateCw className="w-3 h-3" />
          History
        </button>
      </div>

      {/* Tool cards */}
      <div className="space-y-2">
        {tools.map((tool) => (
          <ToolCard
            key={tool.id}
            icon={tool.icon}
            title={tool.title}
            description={tool.description}
            color={tool.color}
            onClick={() => onNavigate(tool.id)}
          />
        ))}
      </div>
    </div>
  );
}
