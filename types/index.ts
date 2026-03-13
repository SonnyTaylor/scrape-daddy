// Message types between side panel, background, and content scripts
export type MessageType =
  | 'START_PICKER'
  | 'CANCEL_PICKER'
  | 'ELEMENT_SELECTED'
  | 'CONFIRM_SELECTION'
  | 'START_EXTRACTION'
  | 'EXTRACTION_RESULT'
  | 'EXTRACT_EMAILS'
  | 'EMAILS_RESULT'
  | 'EXTRACT_PHONES'
  | 'PHONES_RESULT'
  | 'EXTRACT_IMAGES'
  | 'IMAGES_RESULT'
  | 'EXTRACT_TEXT'
  | 'TEXT_RESULT'
  | 'EXTRACT_LINKS'
  | 'EXTRACT_TABLES'
  | 'AUTO_DETECT_COLUMNS'
  | 'START_AUTOSCROLL'
  | 'STOP_AUTOSCROLL'
  | 'AUTOSCROLL_STATUS'
  | 'START_PAGINATION'
  | 'STOP_PAGINATION'
  | 'PAGINATION_STATUS'
  | 'EXPORT_DATA'
  | 'SCRAPE_PAGE_DETAILS'
  | 'EXTRACT_STRUCTURED_DATA'
  | 'OPEN_DATATABLE'
  | 'PING';

export interface Message {
  type: MessageType;
  payload?: any;
}

export interface ElementSelection {
  selector: string;           // CSS selector for the clicked element
  similarSelector: string;    // CSS selector matching all similar elements
  count: number;              // Number of similar elements found
  preview: string[];          // First few text contents
  tagName: string;
  className: string;
}

export interface ColumnDefinition {
  name: string;
  selector: string;           // Relative selector within each item
  attribute?: string;         // 'text' | 'href' | 'src' | custom attribute
}

export interface ExtractionResult {
  columns: string[];
  rows: string[][];
  url: string;
  timestamp: number;
}

export interface EmailEntry {
  email: string;
  source: 'mailto' | 'page-text' | 'href';
  context: string;
}

export interface EmailResult {
  emails: EmailEntry[];
  url: string;
  timestamp: number;
}

export interface PhoneResult {
  phones: string[];
  url: string;
  timestamp: number;
}

export interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
  type: string;
  source: 'img-tag' | 'background';
}

export interface ImageResult {
  images: ImageInfo[];
  url: string;
  timestamp: number;
}

export interface TextResult {
  markdown: string;
  title: string;
  url: string;
  timestamp: number;
  wordCount: number;
}

export interface LinkEntry {
  url: string;
  text: string;
  type: 'internal' | 'external' | 'social' | 'email' | 'phone' | 'file' | 'other';
  context: string;
}

export interface LinkResult {
  links: LinkEntry[];
  url: string;
  timestamp: number;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption: string;
  index: number;
}

export interface TableResult {
  tables: TableData[];
  url: string;
  timestamp: number;
}

export interface PageDetailField {
  name: string;
  selector: string;
  attribute: 'text' | 'href' | 'src' | string;
}

export interface StructuredDataResult {
  jsonLd: any[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  meta: Record<string, string>;
  microdata: Array<{ type: string; properties: Record<string, string> }>;
  url: string;
  timestamp: number;
}

export interface ScrapeHistoryEntry {
  id: string;
  tool: string;
  url: string;
  timestamp: number;
  rowCount: number;
  columns?: string[];
  data?: any;
}

export interface ScrapeDaddySettings {
  defaultExportFormat: 'csv' | 'xlsx' | 'sheets';
  autoScrollDelay: number;    // ms between scrolls
  maxPages: number;           // max pagination pages
}

export const DEFAULT_SETTINGS: ScrapeDaddySettings = {
  defaultExportFormat: 'csv',
  autoScrollDelay: 2000,
  maxPages: 10,
};
