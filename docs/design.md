# ScrapeDaddy — Design Spec

## Overview
Chrome extension for web scraping with a polished Warm Industrial UI. Free & open-source.
Side panel based (Manifest V3), React + Tailwind + shadcn/ui.

## Architecture
- **Side Panel** (React) — all UI: tool selection, config, results, export, history
- **Content Script** — DOM interaction: element picker, highlighting, extraction, auto-scroll, pagination
- **Service Worker** — message routing, export engine, storage, tab tracking
- **Messaging** — chrome.runtime.sendMessage between all three

## Visual Style: Warm Industrial
- Background: #181614 dark warm
- Accent: amber (#f59e0b / #d97706 / #fbbf24)
- Cards: rgba borders, subtle texture pattern
- Left-edge amber accent on hover
- Fonts: Outfit (headings), DM Sans (body)

## V1 Features
1. **List Extractor** — click repeating elements, auto-detect columns, CSS selector based
2. **Page Details Extractor** — bulk URL scraping with custom field definitions
3. **Email Extractor** — regex + mailto: link scanning
4. **Phone Extractor** — regex pattern matching for phone numbers
5. **Image Downloader** — collect all/filtered images, bulk download as zip
6. **Page Text Extractor** — clean text extraction with metadata
7. **Auto-scroll** — automatic scrolling for lazy-loaded content
8. **Pagination** — auto-detect and follow next page links
9. **Load More** — auto-click "load more" buttons
10. **Export** — CSV, Excel (xlsx), Google Sheets
11. **History** — saved scrape results in Chrome Storage

## Future (Post-V1)
- Cloud scheduling (paid tier)
- Cross-browser support (Firefox)
- AI-assisted extraction for messy pages
- Integrations (n8n, Make.com)
- Social/B2B/Review specialized scrapers

## Tech Stack
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Vite + CRXJS plugin
- Chrome Manifest V3
- Chrome Side Panel API
- Chrome Storage API
- SheetJS (xlsx export)
- JSZip (image download)
