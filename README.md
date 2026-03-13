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
- **Smart selectors** — 4-strategy fallback for CSS selector generation, filters Tailwind utility classes for stability
- **Auto-scroll** — scroll to load lazy content before picking lists
- **Persistent settings** — default export format, scroll delay, max pages — all saved to browser storage

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
