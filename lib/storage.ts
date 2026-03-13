import { ScrapeHistoryEntry, ScrapeDaddySettings, DEFAULT_SETTINGS } from '@/types';

const HISTORY_KEY = 'scrape_history';
const SETTINGS_KEY = 'settings';

export async function getHistory(): Promise<ScrapeHistoryEntry[]> {
  const result = await browser.storage.local.get(HISTORY_KEY);
  return ((result as Record<string, unknown>)[HISTORY_KEY] || []) as ScrapeHistoryEntry[];
}

export async function addHistory(entry: ScrapeHistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  if (history.length > 100) history.length = 100;
  await browser.storage.local.set({ [HISTORY_KEY]: history });
}

export async function deleteHistory(id: string): Promise<void> {
  const history = await getHistory();
  const filtered = history.filter(h => h.id !== id);
  await browser.storage.local.set({ [HISTORY_KEY]: filtered });
}

export async function clearHistory(): Promise<void> {
  await browser.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function getSettings(): Promise<ScrapeDaddySettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((result as Record<string, unknown>)[SETTINGS_KEY] || {}) as Partial<ScrapeDaddySettings> };
}

export async function saveSettings(settings: Partial<ScrapeDaddySettings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
