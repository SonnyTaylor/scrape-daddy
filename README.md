<p align="center">
  <img src="logo.svg" width="120" alt="ScrapeDaddy logo" />
</p>

<h1 align="center">ScrapeDaddy</h1>

<p align="center">
  <strong>Extract anything from any website. One click.</strong><br/>
  A browser extension for grabbing text, images, emails, phone numbers, links, tables, and structured data from any webpage.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/tailwindcss-4-blue?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/wxt-latest-orange" alt="WXT" />
  <img src="https://img.shields.io/badge/chrome-%26%20firefox-green?logo=googlechrome" alt="Chrome & Firefox" />
</p>

---

## What it does

ScrapeDaddy lives in your browser's side panel. Open it on any page, pick a tool, and extract structured data in seconds — no code, no setup.

### 8 Extraction Tools

| Tool | What it does |
|------|-------------|
| **List Extractor** | Hover over any list or grid — auto-detects items, columns, and structure. Opens a full data table for editing and export. |
| **Table Extractor** | Finds every HTML `<table>` on the page. Preview rows, export each table individually. |
| **Link Extractor** | Grabs all URLs, classifies them (internal, external, social, email, phone, file), with type filters and quick actions. |
| **Email Extractor** | Scans for email addresses in text, mailto links, and href attributes. Shows source context and domain breakdown. |
| **Phone Extractor** | Detects phone numbers with strict validation — international formats, area codes, tel: links. Click-to-call built in. |
| **Image Downloader** | Finds all images including CSS background images. Filter by size, sort, preview, and bulk download as ZIP. |
| **Page to Markdown** | Converts the full page to clean markdown with proper headings, lists, tables, links. Export as .md, .txt, or .html. |
| **Structured Data** | Extracts JSON-LD, OpenGraph, Twitter Cards, meta tags, and Schema.org microdata. Export as JSON. |

### Other Features

- **Export everywhere** — CSV, Excel (.xlsx), Google Sheets clipboard, JSON, Markdown, HTML, plain text
- **History with re-export** — every extraction is saved. Search, filter by tool, expand to preview data, and re-export without re-scraping
- **Quick actions** — compose emails, call phone numbers, open links in new tabs — right from the results
- **Auto-scroll** — works on regular pages, modals, and nested scrollers (scrolls items into view one at a time, no container detection needed)
- **Persistent settings** — default export format, scroll delay, max pages — all saved to browser storage

## Scraping engine

The list extractor doesn't rely on rigid heuristics. Three pieces work together:

**1. Picker — list detection.** Walks ancestor levels from the clicked element, ranks candidates at every level, picks the tightest fit (smallest item area). Sibling shape is matched by direct-child tag sequence + 30% bounding-rect width tolerance — class names are ignored entirely so React / Angular / styled-components class noise doesn't break it. Falls back to `data-*` attributes and ARIA roles when explicit list semantics exist.

**2. Walker — column auto-detection.** Recursively walks each item, emitting `{breadcrumb: value}` pairs. Each element gets a label by priority: `data-*` attribute name → id → role → aria-label → tag-specific default → content-based (`numeric_value` / `time_value` / `description` / `text_content`) → first semantic class. Breadcrumb segments build up like `link_container > heading (2) > price`. After the walk, breadcrumbs map to column names by regex on the last segment (`heading` → "Title", `price` → "Price", `time_value` → "Time"). Empty `ng-repeat` stubs are filtered out, and columns with identical value-vectors across items are deduped (kills duplicate hover-overlay fields).

**3. Auto-scroll — scroll-by-rows.** Calls `scrollIntoView({block: 'end'})` on the last visible item each tick. Whatever container holds the items reacts naturally — works for window, modals, nested scrollers, no detection needed. Stale-content detection samples the first/last 10 items' text + bounding rect to catch virtualized DOM changes even when item count stays flat.

## Install

### From source (Chrome)

```bash
git clone https://github.com/SonnyTaylor/scrape-daddy.git
cd scrape-daddy
bun install
bun run build
```

Then load the extension:

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` folder

### From source (Firefox)

```bash
bun run build:firefox
```

Load via `about:debugging` > **This Firefox** > **Load Temporary Add-on** > select any file in `.output/firefox-mv2`.

## Development

```bash
bun run dev          # Chrome with hot reload
bun run dev:firefox  # Firefox with hot reload
bun run compile      # Type check
bun run zip          # Package for distribution
```

## Releasing

CI builds Chrome + Firefox zips and publishes a GitHub Release on tag push.

```bash
# bump package.json version first, commit, then:
git tag v0.2.0
git push origin v0.2.0
```

The workflow verifies the tag matches `package.json` version, runs `wxt zip` for both browsers, and attaches the zips to the release with an auto-generated changelog.

## Architecture

Three-layer browser extension with typed message passing:

```
Side Panel (React)  <-->  Background (Service Worker)  <-->  Content Script (DOM)
```

- **Content Script** — injected into pages. Handles DOM traversal, element picking, selector generation, and all data extraction
- **Background Script** — opens side panel, manages popup windows for the data table
- **Side Panel** — React 19 app with tool selection, results display, export, history, and settings

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com) via `@tailwindcss/vite`
- [WXT](https://wxt.dev) (Web eXtension Toolkit) for cross-browser builds
- [Bun](https://bun.sh) as package manager and runtime
- [SheetJS](https://sheetjs.com) for Excel export
- [JSZip](https://stuk.github.io/jszip/) for image bulk download
- [Lucide](https://lucide.dev) for icons

## License

MIT
