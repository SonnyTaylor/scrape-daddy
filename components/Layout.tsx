import { History, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type View =
  | 'tools'
  | 'cloud'
  | 'data'
  | 'settings'
  | 'history'
  | 'history-detail'
  | 'list-extractor'
  | 'page-details-extractor'
  | 'email-extractor'
  | 'phone-extractor'
  | 'image-downloader'
  | 'text-extractor'
  | 'link-extractor'
  | 'table-extractor';

type Tab = 'tools' | 'cloud' | 'data';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: React.ReactNode;
}

const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'cloud', label: 'Cloud', disabled: true },
  { id: 'data', label: 'Data' },
];

function getActiveTab(view: View): Tab {
  if (
    view === 'tools' ||
    view === 'list-extractor' ||
    view === 'page-details-extractor' ||
    view === 'email-extractor' ||
    view === 'phone-extractor' ||
    view === 'image-downloader' ||
    view === 'text-extractor' ||
    view === 'link-extractor' ||
    view === 'table-extractor'
  ) {
    return 'tools';
  }
  if (view === 'data' || view === 'history' || view === 'history-detail') return 'data';
  return 'tools';
}

export default function Layout({ currentView, onNavigate, children }: LayoutProps) {
  const activeTab = getActiveTab(currentView);

  return (
    <div
      className="flex flex-col h-screen w-full overflow-hidden"
      style={{
        backgroundColor: '#181614',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0L40 40M40 0L0 40' stroke='%23ffffff' stroke-opacity='0.015' stroke-width='1'/%3E%3C/svg%3E")`,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20">
            <Zap className="w-4 h-4 text-amber-500" fill="currentColor" />
          </div>
          <div>
            <h1
              className="text-sm font-semibold text-[#e7e5e4] leading-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              ScrapeDaddy
            </h1>
            <p className="text-[10px] text-[#78716c] leading-tight">Data extraction toolkit</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('history')}
            className="p-1.5 rounded-md text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className="p-1.5 rounded-md text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-4 py-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            disabled={tab.disabled}
            onClick={() => {
              if (!tab.disabled) {
                if (tab.id === 'data') onNavigate('history');
                else onNavigate(tab.id);
              }
            }}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-amber-500/15 text-amber-500'
                : tab.disabled
                  ? 'text-[#78716c]/50 cursor-not-allowed'
                  : 'text-[#a8a29e] hover:text-[#e7e5e4] hover:bg-white/5'
            )}
          >
            {tab.label}
            {tab.disabled && (
              <span className="ml-1 text-[9px] opacity-60">soon</span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/5 mx-4" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
