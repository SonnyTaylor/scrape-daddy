// Debug logger for ScrapeDaddy content script.
// All logs go to DevTools console AND into an in-page buffer so the user
// can dump the full transcript to clipboard via __scrapeDaddyDumpLogs().

const PREFIX = '[ScrapeDaddy]';
const MAX_BUFFER = 2000;
const buffer: string[] = [];

function stamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function fmt(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

function record(level: string, args: unknown[]): void {
  const line = `${stamp()} ${level} ${fmt(args)}`;
  buffer.push(line);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

export const log = {
  info: (...args: unknown[]) => { record('INFO', args); console.log(PREFIX, ...args); },
  warn: (...args: unknown[]) => { record('WARN', args); console.warn(PREFIX, ...args); },
  error: (...args: unknown[]) => { record('ERR ', args); console.error(PREFIX, ...args); },
  group: (label: string) => { record('GRP ', [label]); console.group(`${PREFIX} ${label}`); },
  groupEnd: () => { console.groupEnd(); },
  table: (data: unknown) => { record('TBL ', [data]); console.table(data); },
  clear: () => { buffer.length = 0; },
  dump: (): string => buffer.join('\n'),
};

// Install clipboard dumper on window for easy access from DevTools
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__scrapeDaddyDumpLogs = async () => {
    const text = log.dump();
    try {
      await navigator.clipboard.writeText(text);
      console.log(`%c${PREFIX} copied ${buffer.length} log lines to clipboard`, 'color:#f59e0b;font-weight:bold');
    } catch (e) {
      console.log(`${PREFIX} clipboard blocked, here's the transcript:\n\n${text}`);
    }
    return text;
  };
  (window as unknown as Record<string, unknown>).__scrapeDaddyClearLogs = () => {
    log.clear();
    console.log(`${PREFIX} log buffer cleared`);
  };
}
