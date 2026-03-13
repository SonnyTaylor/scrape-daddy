import { useState, useEffect } from 'react';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import type { View } from './Layout';
import { getSettings, saveSettings } from '@/lib/storage';
import type { ScrapeDaddySettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

interface SettingsPanelProps {
  onNavigate: (view: View) => void;
}

export default function SettingsPanel({ onNavigate }: SettingsPanelProps) {
  const [settings, setSettings] = useState<ScrapeDaddySettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const updateSetting = <K extends keyof ScrapeDaddySettings>(
    key: K,
    value: ScrapeDaddySettings[K],
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings({ [key]: value }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  if (!loaded) return null;

  return (
    <div className="p-4 space-y-5">
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
          Settings
        </h2>
        {saved && (
          <span className="ml-auto text-[10px] text-green-400 animate-pulse">Saved</span>
        )}
      </div>

      {/* Default export format */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#78716c]">
          Default Export Format
        </label>
        <select
          value={settings.defaultExportFormat}
          onChange={(e) =>
            updateSetting(
              'defaultExportFormat',
              e.target.value as ScrapeDaddySettings['defaultExportFormat'],
            )
          }
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
        >
          <option value="csv">CSV</option>
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="sheets">Google Sheets (clipboard)</option>
        </select>
      </div>

      {/* Auto-scroll delay */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#78716c]">
          Auto-scroll Delay
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1000}
            max={5000}
            step={500}
            value={settings.autoScrollDelay}
            onChange={(e) => updateSetting('autoScrollDelay', Number(e.target.value))}
            className="flex-1 accent-amber-500"
          />
          <span className="text-[12px] text-[#a8a29e] w-8 text-right">
            {(settings.autoScrollDelay / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Max pagination pages */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#78716c]">
          Max Pagination Pages
        </label>
        <input
          type="number"
          value={settings.maxPages}
          onChange={(e) => updateSetting('maxPages', Math.max(1, Math.min(100, Number(e.target.value))))}
          min={1}
          max={100}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-[#e7e5e4] focus:outline-none focus:border-amber-500/30 transition-colors"
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05]" />

      {/* About */}
      <div className="space-y-2">
        <p className="text-[12px] text-[#a8a29e]">ScrapeDaddy v1.0.0</p>
        <a
          href="https://github.com/scrape-daddy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-amber-500 hover:text-amber-400 transition-colors"
        >
          GitHub
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
