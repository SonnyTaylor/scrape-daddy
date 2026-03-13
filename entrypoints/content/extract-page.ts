import type {
  EmailEntry, EmailResult,
  PhoneEntry, PhoneResult,
  ImageInfo, ImageResult, ImageFilterPayload,
  TextResult,
  LinkEntry, LinkResult,
  TableData, TableResult,
  StructuredDataResult,
} from '@/types';

// ============ SHARED PAGE TEXT CACHE ============

let cachedPageText: string | null = null;
let cachedPageTextTimestamp = 0;

function getPageText(): string {
  const now = Date.now();
  // Cache for 500ms to cover sequential extraction calls
  if (cachedPageText && now - cachedPageTextTimestamp < 500) {
    return cachedPageText;
  }
  cachedPageText = document.body.innerText || '';
  cachedPageTextTimestamp = now;
  return cachedPageText;
}

function getContext(text: string, matchStart: number, matchEnd: number): string {
  const ctxStart = Math.max(0, matchStart - 40);
  const ctxEnd = Math.min(text.length, matchEnd + 40);
  let snippet = text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
  if (ctxStart > 0) snippet = '...' + snippet;
  if (ctxEnd < text.length) snippet = snippet + '...';
  return snippet;
}

// ============ EMAIL EXTRACTION ============

export function extractEmails(): EmailResult {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const seen = new Set<string>();
  const emails: EmailEntry[] = [];

  // From mailto links
  document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const email = href.replace('mailto:', '').split('?')[0].toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      const linkText = (a as HTMLAnchorElement).innerText?.trim() || '';
      emails.push({ email, source: 'mailto', context: linkText || email });
    }
  });

  // From page text
  const text = getPageText();
  let match: RegExpExecArray | null;
  emailRegex.lastIndex = 0;
  while ((match = emailRegex.exec(text)) !== null) {
    const email = match[0].toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      emails.push({ email, source: 'page-text', context: getContext(text, match.index, match.index + match[0].length) });
    }
  }

  // From href attributes
  document.querySelectorAll('a[href]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const matches = href.match(emailRegex) || [];
    matches.forEach(e => {
      const email = e.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        const linkText = (a as HTMLAnchorElement).innerText?.trim() || '';
        emails.push({ email, source: 'href', context: linkText || href });
      }
    });
  });

  return { emails, url: window.location.href, timestamp: Date.now() };
}

// ============ PHONE EXTRACTION ============

const phonePatterns = [
  /\+\d{1,4}[\s.-]?(?:\(?\d{1,5}\)?[\s.-]?)?\d{1,5}[\s.-]\d{1,5}(?:[\s.-]\d{1,5})?/g,
  /\(\d{2,5}\)[\s.-]?\d{1,5}[\s.-]\d{1,5}(?:[\s.-]\d{1,5})?/g,
  /(?<!\d)\d{1,5}[-.]\d{1,5}[-.]\d{1,5}(?:[-.]\d{1,5})?(?!\d)/g,
];

const yearPattern = /^(19|20)\d{2}$/;

function isValidPhone(candidate: string): boolean {
  const digitsOnly = candidate.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;
  if (yearPattern.test(digitsOnly)) return false;
  const hasSeparators = /[().\-\s]/.test(candidate);
  const hasPlus = candidate.startsWith('+');
  if (!hasSeparators && !hasPlus) return false;
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(candidate)) return false;
  return true;
}

export function extractPhones(): PhoneResult {
  const phones: PhoneEntry[] = [];
  const seen = new Set<string>();

  // From tel: links
  document.querySelectorAll('a[href^="tel:"]').forEach(a => {
    const href = (a as HTMLAnchorElement).href;
    const phone = href.replace('tel:', '').trim();
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (!seen.has(digits)) {
        seen.add(digits);
        phones.push({ number: phone, source: 'tel-link', context: '' });
      }
    }
  });

  // From page text
  const text = getPageText();
  for (const pattern of phonePatterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[0].trim();
      if (!isValidPhone(candidate)) continue;
      const digits = candidate.replace(/\D/g, '');
      if (seen.has(digits)) continue;
      seen.add(digits);
      phones.push({ number: candidate, source: 'page-text', context: getContext(text, match.index, match.index + match[0].length) });
    }
  }

  return { phones, url: window.location.href, timestamp: Date.now() };
}

// ============ IMAGE EXTRACTION ============

function getImageType(src: string): string {
  const ext = src.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) return ext;
  return 'unknown';
}

export function extractImages(payload?: ImageFilterPayload): ImageResult {
  const minW = payload?.minWidth || 0;
  const minH = payload?.minHeight || 0;
  const images: ImageInfo[] = [];
  const seen = new Set<string>();

  // From img tags
  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.dataset.src || img.dataset.lazySrc || img.dataset.original || '';
    if (!src || seen.has(src)) return;
    seen.add(src);

    const srcset = img.getAttribute('srcset') || img.dataset.srcset || '';
    let bestSrc = src;
    if (srcset) {
      const candidates = srcset.split(',').map(s => s.trim().split(/\s+/));
      let bestWidth = 0;
      for (const parts of candidates) {
        const url = parts[0];
        const descriptor = parts[1] || '';
        const w = parseInt(descriptor) || 0;
        if (w > bestWidth && url) {
          bestWidth = w;
          bestSrc = url;
        }
      }
      try { bestSrc = new URL(bestSrc, window.location.href).href; } catch (e) {
        console.warn('[ScrapeDaddy] Failed to resolve srcset URL:', bestSrc, e);
      }
    }

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w >= minW && h >= minH) {
      images.push({ src: bestSrc, alt: img.alt || '', width: w, height: h, type: getImageType(bestSrc), source: 'img-tag' });
    }
  });

  // From background images — only elements with inline style or known bg classes
  document.querySelectorAll('[style*="background"], [style*="url("]').forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1] && !seen.has(match[1])) {
        seen.add(match[1]);
        const htmlEl = el as HTMLElement;
        const w = htmlEl.offsetWidth || 0;
        const h = htmlEl.offsetHeight || 0;
        if (w >= minW && h >= minH) {
          images.push({ src: match[1], alt: '', width: w, height: h, type: getImageType(match[1]), source: 'background' });
        }
      }
    }
  });

  return { images, url: window.location.href, timestamp: Date.now() };
}

// ============ TEXT / MARKDOWN EXTRACTION ============

export function extractMarkdown(): TextResult {
  const title = document.title || '';

  // Walk the real DOM instead of cloning — skip unwanted elements in-place
  const SKIP_TAGS = new Set(['script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe']);
  const SKIP_ROLES = new Set(['navigation', 'banner']);

  function shouldSkip(el: Element): boolean {
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) return true;
    const role = el.getAttribute('role');
    if (role && SKIP_ROLES.has(role)) return true;
    return false;
  }

  function convertNode(node: Node, depth: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.replace(/\s+/g, ' ') || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    if (shouldSkip(el)) return '';
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';

    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1]);
        const text = el.innerText?.trim();
        if (!text) return '';
        return '\n\n' + '#'.repeat(level) + ' ' + text + '\n\n';
      }

      case 'p': {
        const inner = convertChildren(el, depth).trim();
        return inner ? '\n\n' + inner + '\n\n' : '';
      }

      case 'a': {
        const href = el.getAttribute('href') || '';
        const text = convertChildren(el, depth).trim();
        if (!text || href.startsWith('#')) return text;
        try {
          return '[' + text + '](' + new URL(href, window.location.href).href + ')';
        } catch {
          return '[' + text + '](' + href + ')';
        }
      }

      case 'img': {
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src') || '';
        if (!src) return '';
        try {
          return '![' + alt + '](' + new URL(src, window.location.href).href + ')';
        } catch {
          return '![' + alt + '](' + src + ')';
        }
      }

      case 'strong': case 'b': {
        const text = convertChildren(el, depth).trim();
        return text ? '**' + text + '**' : '';
      }

      case 'em': case 'i': {
        const text = convertChildren(el, depth).trim();
        return text ? '*' + text + '*' : '';
      }

      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') return el.innerText || '';
        const text = el.innerText?.trim() || '';
        return text ? '`' + text + '`' : '';
      }

      case 'pre': {
        const code = el.innerText?.trim() || '';
        return code ? '\n\n```\n' + code + '\n```\n\n' : '';
      }

      case 'ul': return convertList(el, '-', depth);
      case 'ol': return convertList(el, 'ol', depth);
      case 'li': return convertChildren(el, depth);

      case 'blockquote': {
        const inner = convertChildren(el, depth).trim();
        if (!inner) return '';
        return '\n\n' + inner.split('\n').map(line => '> ' + line).join('\n') + '\n\n';
      }

      case 'table': return convertTable(el);
      case 'br': return '\n';
      case 'hr': return '\n\n---\n\n';

      default: return convertChildren(el, depth);
    }
  }

  function convertChildren(el: HTMLElement, depth: number = 0): string {
    let result = '';
    for (const child of Array.from(el.childNodes)) {
      result += convertNode(child, depth);
    }
    return result;
  }

  function convertList(el: HTMLElement, marker: string, depth: number): string {
    const indent = '  '.repeat(depth);
    const items: string[] = [];
    let idx = 0;
    Array.from(el.children).forEach(child => {
      if (child.tagName.toLowerCase() === 'li') {
        idx++;
        const prefix = marker === 'ol' ? `${idx}. ` : '- ';
        let textParts = '';
        let nestedLists = '';
        Array.from(child.childNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const childTag = (node as HTMLElement).tagName.toLowerCase();
            if (childTag === 'ul' || childTag === 'ol') {
              nestedLists += convertNode(node, depth + 1);
              return;
            }
          }
          textParts += convertNode(node, depth + 1);
        });
        const text = textParts.trim();
        if (text) items.push(indent + prefix + text);
        if (nestedLists) items.push(nestedLists.replace(/^\n+|\n+$/g, ''));
      }
    });
    if (!items.length) return '';
    return (depth === 0 ? '\n\n' : '\n') + items.join('\n') + (depth === 0 ? '\n\n' : '');
  }

  function convertTable(table: HTMLElement): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    const matrix: string[][] = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      matrix.push(cells.map(c => (c as HTMLElement).innerText?.trim().replace(/\|/g, '\\|') || ''));
    }
    if (!matrix.length) return '';

    const colCount = Math.max(...matrix.map(r => r.length));
    for (const row of matrix) {
      while (row.length < colCount) row.push('');
    }

    let md = '\n\n';
    md += '| ' + matrix[0].join(' | ') + ' |\n';
    md += '| ' + matrix[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < matrix.length; i++) {
      md += '| ' + matrix[i].join(' | ') + ' |\n';
    }
    return md + '\n';
  }

  let markdown = convertChildren(document.body);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  if (title) markdown = '# ' + title + '\n\n' + markdown;

  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;

  return { markdown, title, url: window.location.href, timestamp: Date.now(), wordCount };
}

// ============ LINK EXTRACTION ============

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'github.com',
  'discord.gg', 'discord.com', 'threads.net', 'mastodon.social', 'bsky.app',
];

const FILE_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar',
  'gz', 'tar', 'csv', 'json', 'xml', 'txt', 'mp3', 'mp4', 'avi', 'mov',
]);

export function extractLinks(): LinkResult {
  const pageUrl = window.location.href;
  const pageHost = window.location.hostname;
  const seen = new Set<string>();
  const links: LinkEntry[] = [];

  function classifyLink(href: string): LinkEntry['type'] {
    if (href.startsWith('mailto:')) return 'email';
    if (href.startsWith('tel:')) return 'phone';
    try {
      const url = new URL(href, pageUrl);
      const ext = url.pathname.split('.').pop()?.toLowerCase() || '';
      if (FILE_EXTS.has(ext)) return 'file';
      if (SOCIAL_DOMAINS.some(d => url.hostname.includes(d))) return 'social';
      if (url.hostname === pageHost) return 'internal';
      return 'external';
    } catch {
      return 'other';
    }
  }

  document.querySelectorAll('a[href]').forEach(a => {
    const anchor = a as HTMLAnchorElement;
    let href = anchor.getAttribute('href') || '';
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    try {
      href = new URL(href, pageUrl).href;
    } catch {
      return;
    }

    if (seen.has(href)) return;
    seen.add(href);

    const text = anchor.innerText?.trim().replace(/\s+/g, ' ').slice(0, 120) || '';
    const type = classifyLink(href);

    const parent = anchor.parentElement;
    let context = '';
    if (parent) {
      const parentText = parent.innerText?.trim().replace(/\s+/g, ' ') || '';
      if (parentText.length > text.length) {
        context = parentText.slice(0, 150);
      }
    }

    links.push({ url: href, text, type, context });
  });

  return { links, url: pageUrl, timestamp: Date.now() };
}

// ============ TABLE EXTRACTION ============

export function extractTables(): TableResult {
  const tables: TableData[] = [];

  document.querySelectorAll('table').forEach((table, index) => {
    const caption = table.querySelector('caption')?.innerText?.trim() || '';
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return;

    let headers: string[] = [];

    // Try thead first
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        headers = Array.from(headerRow.querySelectorAll('th, td')).map(
          c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
        );
        const tbody = table.querySelector('tbody');
        const allRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : rows.slice(1);
        const dataRows = allRows.map(row =>
          Array.from(row.querySelectorAll('th, td')).map(
            c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
          )
        );

        if (headers.length > 0 || dataRows.length > 0) {
          const colCount = Math.max(headers.length, ...dataRows.map(r => r.length));
          while (headers.length < colCount) headers.push('');
          for (const row of dataRows) {
            while (row.length < colCount) row.push('');
          }
          tables.push({ headers, rows: dataRows, caption, index });
        }
        return;
      }
    }

    // No thead
    const firstRow = rows[0];
    const firstCells = Array.from(firstRow.querySelectorAll('th, td'));
    const hasThElements = firstCells.some(c => c.tagName.toLowerCase() === 'th');
    let dataStartIdx: number;

    if (hasThElements || rows.length > 1) {
      headers = firstCells.map(c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || '');
      dataStartIdx = 1;
    } else {
      headers = Array.from({ length: firstCells.length }, (_, i) => `Column ${i + 1}`);
      dataStartIdx = 0;
    }

    const dataRows = rows.slice(dataStartIdx).map(row =>
      Array.from(row.querySelectorAll('th, td')).map(
        c => (c as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || ''
      )
    );

    if (dataRows.length === 0 && headers.every(h => !h)) return;

    const colCount = Math.max(headers.length, ...dataRows.map(r => r.length));
    while (headers.length < colCount) headers.push('');
    for (const row of dataRows) {
      while (row.length < colCount) row.push('');
    }

    tables.push({ headers, rows: dataRows, caption, index });
  });

  return { tables, url: window.location.href, timestamp: Date.now() };
}

// ============ STRUCTURED DATA EXTRACTION ============

export function extractStructuredData(): StructuredDataResult {
  // JSON-LD
  const jsonLd: unknown[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const parsed = JSON.parse(script.textContent || '');
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else jsonLd.push(parsed);
    } catch {
      // skip malformed JSON-LD
    }
  });

  // OpenGraph
  const openGraph: Record<string, string> = {};
  document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
    const property = meta.getAttribute('property') || '';
    const content = meta.getAttribute('content') || '';
    if (property) openGraph[property] = content;
  });

  // Twitter Cards
  const twitterCard: Record<string, string> = {};
  document.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]').forEach(meta => {
    const key = meta.getAttribute('name') || meta.getAttribute('property') || '';
    const content = meta.getAttribute('content') || '';
    if (key) twitterCard[key] = content;
  });

  // Standard Meta
  const meta: Record<string, string> = {};
  meta['title'] = document.title || '';

  const metaSelectors: Array<{ key: string; selector: string; attr: string }> = [
    { key: 'description', selector: 'meta[name="description"]', attr: 'content' },
    { key: 'canonical', selector: 'link[rel="canonical"]', attr: 'href' },
    { key: 'author', selector: 'meta[name="author"]', attr: 'content' },
    { key: 'robots', selector: 'meta[name="robots"]', attr: 'content' },
    { key: 'viewport', selector: 'meta[name="viewport"]', attr: 'content' },
    { key: 'theme-color', selector: 'meta[name="theme-color"]', attr: 'content' },
    { key: 'keywords', selector: 'meta[name="keywords"]', attr: 'content' },
    { key: 'generator', selector: 'meta[name="generator"]', attr: 'content' },
    { key: 'favicon', selector: 'link[rel="icon"], link[rel="shortcut icon"]', attr: 'href' },
  ];

  for (const { key, selector, attr } of metaSelectors) {
    const el = document.querySelector(selector);
    if (el) meta[key] = el.getAttribute(attr) || '';
  }

  const charsetEl = document.querySelector('meta[charset]');
  if (charsetEl) meta['charset'] = charsetEl.getAttribute('charset') || '';

  const lang = document.documentElement.getAttribute('lang');
  if (lang) meta['language'] = lang;

  // Microdata
  const microdata: Array<{ type: string; properties: Record<string, string> }> = [];
  document.querySelectorAll('[itemscope][itemtype]').forEach(el => {
    if (el.closest('[itemscope]') !== el && el.parentElement?.closest('[itemscope]')) return;

    const type = el.getAttribute('itemtype') || '';
    const properties: Record<string, string> = {};

    el.querySelectorAll('[itemprop]').forEach(prop => {
      const name = prop.getAttribute('itemprop') || '';
      if (!name) return;
      const value =
        prop.getAttribute('content') ||
        prop.getAttribute('href') ||
        prop.getAttribute('src') ||
        (prop as HTMLElement).innerText?.trim() ||
        '';
      properties[name] = value;
    });

    microdata.push({ type, properties });
  });

  return { jsonLd, openGraph, twitterCard, meta, microdata, url: window.location.href, timestamp: Date.now() };
}
