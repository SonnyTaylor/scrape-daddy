// Z-index constants
export const Z_TOP = '2147483647';
export const Z_HIGHLIGHT = '2147483646';
export const Z_CONTAINER = '2147483645';

// Accent colors
export const ACCENT = '#f59e0b';
export const ACCENT_DARK = '#d97706';

let injected = false;

export function injectStyles() {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.id = 'scrape-daddy-styles';
  style.textContent = `
    #scrape-daddy-highlight {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_TOP};
      border: 2px solid ${ACCENT};
      background-color: rgba(245, 158, 11, 0.1);
      border-radius: 4px;
      transition: all 0.1s ease;
      display: none;
    }
    #scrape-daddy-container {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_CONTAINER};
      border: 3px dashed ${ACCENT};
      background-color: rgba(245, 158, 11, 0.06);
      border-radius: 6px;
      transition: all 0.15s ease;
      display: none;
    }
    #scrape-daddy-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_TOP};
      background-color: ${ACCENT};
      color: #000;
      font-size: 13px;
      font-family: 'Outfit', system-ui, sans-serif;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 6px;
      white-space: nowrap;
      display: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      line-height: 1.4;
    }
    .scrape-daddy-similar {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_HIGHLIGHT};
      border: 2px dashed ${ACCENT_DARK};
      background-color: rgba(217, 119, 6, 0.08);
      border-radius: 4px;
    }
    .scrape-daddy-hover-item {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_HIGHLIGHT};
      border: 2px dashed ${ACCENT_DARK};
      background-color: rgba(217, 119, 6, 0.08);
      border-radius: 4px;
    }
    .scrape-daddy-badge {
      position: fixed;
      pointer-events: none;
      z-index: ${Z_TOP};
      background-color: ${ACCENT_DARK};
      color: #fff;
      font-size: 10px;
      font-family: monospace;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 3px;
      line-height: 14px;
    }
  `;
  document.head.appendChild(style);
}
