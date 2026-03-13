# ScrapeDaddy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Build a Chrome extension web scraper with Warm Industrial UI, side panel interface, and full extraction toolkit.

**Architecture:** WXT framework + React 19 + Tailwind v4 + shadcn/ui. Side panel (React app) communicates with content scripts via chrome.runtime messaging. Service worker coordinates downloads and storage.

**Tech Stack:** WXT, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, SheetJS (xlsx), JSZip, Chrome MV3 APIs (sidePanel, storage, scripting, downloads)

---

## File Structure

```
scrape-daddy/
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── entrypoints/
│   ├── sidepanel/           # Side panel React app
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── background.ts        # Service worker
│   └── content/             # Content script
│       └── index.ts
├── components/
│   ├── ui/                  # shadcn components
│   ├── Layout.tsx           # Shell: header, nav, content area
│   ├── ToolCard.tsx         # Tool menu item
│   ├── ToolsMenu.tsx        # Home screen tool list
│   ├── ResultsTable.tsx     # Data results display
│   ├── ExportMenu.tsx       # Export options dropdown
│   ├── HistoryPanel.tsx     # Scrape history view
│   ├── SettingsPanel.tsx    # Settings view
│   └── tools/
│       ├── ListExtractor.tsx
│       ├── PageDetailsExtractor.tsx
│       ├── EmailExtractor.tsx
│       ├── PhoneExtractor.tsx
│       ├── ImageDownloader.tsx
│       └── TextExtractor.tsx
├── lib/
│   ├── messaging.ts         # Type-safe message passing
│   ├── storage.ts           # Chrome storage helpers
│   ├── export.ts            # CSV/Excel/Sheets export
│   ├── selectors.ts         # CSS selector generation
│   └── extractors.ts        # DOM extraction logic
├── content/
│   ├── picker.ts            # Element picker/highlighter
│   ├── scroller.ts          # Auto-scroll logic
│   ├── paginator.ts         # Pagination detection & following
│   └── extractor.ts         # DOM data extraction
├── types/
│   └── index.ts             # Shared types
└── assets/
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## Chunk 1: Project Scaffold & Shell UI

### Task 1: Initialize WXT project with React + Tailwind

- [ ] Run `npm create wxt@latest scrape-daddy -- --template react`
- [ ] Install dependencies: `tailwindcss @tailwindcss/vite shadcn-ui sheetjs jszip`
- [ ] Configure wxt.config.ts with side panel entrypoint
- [ ] Configure tailwind
- [ ] Verify `npm run dev` opens extension in Chrome

### Task 2: Side Panel shell with Warm Industrial theme

- [ ] Create Layout.tsx with header (logo, settings/history icons), tab nav (Tools/Data/Settings), content area
- [ ] Apply Warm Industrial theme: bg #181614, amber accents, Outfit + DM Sans fonts, subtle cross pattern texture
- [ ] Create ToolCard.tsx component with colored icon, title, description, left-edge amber hover
- [ ] Create ToolsMenu.tsx home screen with all 6 tool cards
- [ ] Wire up tab navigation between Tools/Data/Settings views

### Task 3: Routing & tool views skeleton

- [ ] Create skeleton components for each tool (ListExtractor, EmailExtractor, etc.)
- [ ] Add view state management (which tool is active, back navigation)
- [ ] Create ResultsTable.tsx placeholder
- [ ] Create ExportMenu.tsx placeholder
- [ ] Create HistoryPanel.tsx placeholder
- [ ] Create SettingsPanel.tsx placeholder

## Chunk 2: Content Script & Element Picker

### Task 4: Message passing infrastructure

- [ ] Define message types in types/index.ts (StartPicker, ElementSelected, ExtractData, DataResult, etc.)
- [ ] Create lib/messaging.ts with type-safe send/receive helpers
- [ ] Set up background.ts service worker as message router
- [ ] Set up content script entrypoint with message listener
- [ ] Test message round-trip: side panel → background → content → background → side panel

### Task 5: Element picker & highlighter

- [ ] Create content/picker.ts — mouseover highlighting with overlay div
- [ ] On hover: show element bounds with amber border overlay
- [ ] On click: capture element, generate CSS selector via lib/selectors.ts
- [ ] Walk DOM to find similar sibling elements (same tag + class pattern under same parent)
- [ ] Highlight all similar elements in a different color
- [ ] Send selection back to side panel with element count + preview data
- [ ] ESC to cancel picker mode

### Task 6: CSS selector generation

- [ ] Create lib/selectors.ts
- [ ] Generate unique CSS selector for clicked element (prefer classes > nth-child > full path)
- [ ] Generate "similar elements" selector (find common ancestor, shared class pattern)
- [ ] Handle edge cases: elements with no classes, deeply nested, shadow DOM

## Chunk 3: List Extractor (Core Feature)

### Task 7: List Extractor UI

- [ ] Build ListExtractor.tsx with steps: 1) Pick an item 2) Confirm similar items 3) Pick columns 4) Review & export
- [ ] Step 1: "Click any item in the list" button → activates picker
- [ ] Step 2: Show count of detected items, let user confirm or adjust
- [ ] Step 3: Column picker — click sub-elements within an item to define columns (name, price, etc.)
- [ ] Step 4: Results table with all extracted data + export buttons

### Task 8: List extraction logic

- [ ] Create content/extractor.ts — given a parent selector and column selectors, extract all rows
- [ ] Handle text content, href attributes, src attributes, data attributes
- [ ] Stream results back to side panel via port connection
- [ ] Handle edge cases: missing columns in some rows, nested text

### Task 9: Auto-scroll support

- [ ] Create content/scroller.ts
- [ ] Detect if page has more content to load (scroll height changes after scrolling)
- [ ] Smooth scroll to bottom, wait for new content, repeat
- [ ] Configurable: max scroll count, delay between scrolls
- [ ] UI toggle in ListExtractor for "auto-scroll before scraping"
- [ ] Stop button to cancel scrolling

### Task 10: Pagination support

- [ ] Create content/paginator.ts
- [ ] Auto-detect "Next" / ">" / pagination links via common patterns
- [ ] Click next page, wait for load, extract, repeat
- [ ] Configurable: max pages
- [ ] Detect "Load More" buttons (common button text patterns)
- [ ] UI controls in ListExtractor for pagination settings

## Chunk 4: Other Extractors

### Task 11: Email Extractor

- [ ] Build EmailExtractor.tsx UI — single button "Extract Emails", results list
- [ ] Content script scans: mailto: links, regex pattern on page text, href attributes
- [ ] Deduplicate results
- [ ] Show count + list of found emails
- [ ] Export to CSV

### Task 12: Phone Extractor

- [ ] Build PhoneExtractor.tsx UI — same pattern as email
- [ ] Content script scans: tel: links, regex patterns for phone numbers
- [ ] Support international formats
- [ ] Deduplicate and display

### Task 13: Image Downloader

- [ ] Build ImageDownloader.tsx UI — grid of thumbnails with checkboxes
- [ ] Content script collects all img src, background-image URLs, srcset
- [ ] Filter by min size, file type
- [ ] Select all / deselect / individual selection
- [ ] Download selected as zip via JSZip
- [ ] Download individual images

### Task 14: Page Text Extractor

- [ ] Build TextExtractor.tsx UI — extracted text display with copy button
- [ ] Content script extracts: page title, meta description, headings hierarchy, body text (cleaned)
- [ ] Option: include/exclude specific sections
- [ ] Copy to clipboard or export as text/CSV

### Task 15: Page Details Extractor

- [ ] Build PageDetailsExtractor.tsx UI — URL list input, field definitions, bulk results
- [ ] User pastes URLs (one per line) or imports from CSV
- [ ] Define fields to extract per page (CSS selector + field name)
- [ ] Background processes URLs sequentially: open tab, inject content script, extract, close tab
- [ ] Stream results back to side panel
- [ ] Progress bar showing completion

## Chunk 5: Export & History

### Task 16: Export engine

- [ ] Create lib/export.ts
- [ ] CSV export: proper escaping, BOM for Excel compatibility
- [ ] Excel export via SheetJS: styled header row, auto-width columns
- [ ] Google Sheets: copy to clipboard in TSV format (paste-ready)
- [ ] Trigger downloads via chrome.downloads API from background script

### Task 17: History & storage

- [ ] Create lib/storage.ts — CRUD helpers for chrome.storage.local
- [ ] Save each scrape: timestamp, tool used, URL, row count, data preview
- [ ] Build HistoryPanel.tsx — list of past scrapes with re-export option
- [ ] Delete individual / clear all history
- [ ] Storage quota indicator

### Task 18: Settings

- [ ] Build SettingsPanel.tsx
- [ ] Settings: default export format, auto-scroll delay, max pages, theme (future)
- [ ] Persist to chrome.storage.local
- [ ] About section with version, GitHub link

## Chunk 6: Polish & Package

### Task 19: Extension icons & branding

- [ ] Create icon set (16, 32, 48, 128px) with ScrapeDaddy amber branding
- [ ] Configure manifest metadata: name, description, version
- [ ] Add keyboard shortcut to toggle side panel

### Task 20: Build & test

- [ ] Run `wxt build` for production
- [ ] Test on various sites: e-commerce, news, directories, SPAs
- [ ] Test all extractors end-to-end
- [ ] Test export formats
- [ ] Fix edge cases

### Task 21: Repository setup

- [ ] Initialize git repo
- [ ] Add .gitignore
- [ ] Write README.md with screenshots, features, install instructions
- [ ] Add LICENSE (MIT)
