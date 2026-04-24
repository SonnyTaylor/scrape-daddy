// Debug logger for ScrapeDaddy content script
// All logs are prefixed with [ScrapeDaddy] for easy filtering in DevTools

const PREFIX = '[ScrapeDaddy]';

export const log = {
  info: (...args: unknown[]) => console.log(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
  group: (label: string) => console.group(`${PREFIX} ${label}`),
  groupEnd: () => console.groupEnd(),
  table: (data: unknown) => console.table(data),
};
