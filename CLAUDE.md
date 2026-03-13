# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ScrapeDaddy is a Chrome/Firefox browser extension for extracting data from websites. Users can grab text, images, emails, phone numbers, and structured lists from any webpage via a side panel UI. Built with React 19, TypeScript, Tailwind CSS 4, and WXT (Web eXtension Builder).

## Commands

- **Install:** `bun install`
- **Dev (Chrome):** `bun run dev`
- **Dev (Firefox):** `bun run dev:firefox`
- **Build (Chrome):** `bun run build`
- **Build (Firefox):** `bun run build:firefox`
- **Type check:** `bun run compile` (runs `tsc --noEmit`)
- **Zip for distribution:** `bun run zip` / `bun run zip:firefox`

No test framework is configured. No linter beyond TypeScript type checking.

## Architecture

Three-tier browser extension with message-passing:

1. **Content Script** (`entrypoints/content.ts`) — Injected into webpages. Handles DOM manipulation, element picking with visual feedback, and all data extraction logic. Implements four fallback strategies for selector generation (class-based, list container, data attributes, ARIA roles). Filters out Tailwind utility class prefixes to keep selectors stable.

2. **Background Script** (`entrypoints/background.ts`) — Minimal service worker. Opens the side panel on extension icon click.

3. **Side Panel** (`entrypoints/sidepanel/`) — React app serving as the main UI. Contains tool selection, results display, export, history, and settings.

**Data flow:** Side panel sends typed messages via `useContentScript()` hook → content script extracts data from DOM → returns results → side panel displays in `ResultsTable` → user exports via `ExportMenu`.

## Key Patterns

- **Message types** are defined in `types/index.ts` (`Message` interface). All inter-script communication uses `browser.runtime.sendMessage()` and `browser.tabs.sendMessage()`.
- **`useContentScript()` hook** (`lib/useContentScript.ts`) wraps message sending with loading/error states.
- **Browser storage** (`lib/storage.ts`) uses `browser.storage.local` with keys `scrape_history` (max 100 entries) and `settings`.
- **Export utilities** (`lib/export.ts`) support CSV, Excel (xlsx), and Google Sheets clipboard copy.
- **Six extraction tools** live in `components/tools/` — ListExtractor (multi-step picker flow), EmailExtractor, PhoneExtractor, ImageDownloader, TextExtractor, PageDetailsExtractor.

## Styling

Dark theme with amber accent (#f59e0b). Fonts: Outfit (headings), DM Sans (body). Uses `@tailwindcss/vite` plugin configured in `wxt.config.ts`.
