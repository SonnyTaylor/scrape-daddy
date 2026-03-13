// ============ MESSAGE TYPES (Discriminated Unions) ============

export interface ExtractionPayload {
  itemSelector: string;
  columns: ColumnDefinition[];
}

export interface ImageFilterPayload {
  minWidth?: number;
  minHeight?: number;
}

export interface AutoScrollPayload {
  delay?: number;
  maxScrolls?: number;
}

export interface AutoDetectColumnsPayload {
  itemSelector: string;
}

// All possible messages between side panel, background, and content scripts
export type Message =
  | { type: 'PING' }
  | { type: 'START_PICKER' }
  | { type: 'CANCEL_PICKER' }
  | { type: 'ELEMENT_SELECTED'; payload: ElementSelection }
  | { type: 'CONFIRM_SELECTION' }
  | { type: 'START_EXTRACTION'; payload: ExtractionPayload }
  | { type: 'EXTRACTION_RESULT'; payload: ExtractionResult }
  | { type: 'EXTRACT_EMAILS' }
  | { type: 'EMAILS_RESULT'; payload: EmailResult }
  | { type: 'EXTRACT_PHONES' }
  | { type: 'PHONES_RESULT'; payload: PhoneResult }
  | { type: 'EXTRACT_IMAGES'; payload?: ImageFilterPayload }
  | { type: 'IMAGES_RESULT'; payload: ImageResult }
  | { type: 'EXTRACT_TEXT' }
  | { type: 'TEXT_RESULT'; payload: TextResult }
  | { type: 'EXTRACT_LINKS' }
  | { type: 'EXTRACT_TABLES' }
  | { type: 'AUTO_DETECT_COLUMNS'; payload: AutoDetectColumnsPayload }
  | { type: 'START_AUTOSCROLL'; payload?: AutoScrollPayload }
  | { type: 'STOP_AUTOSCROLL' }
  | { type: 'AUTOSCROLL_STATUS'; payload: AutoScrollStatus }
  | { type: 'START_PAGINATION' }
  | { type: 'STOP_PAGINATION' }
  | { type: 'PAGINATION_STATUS' }
  | { type: 'EXPORT_DATA' }
  | { type: 'SCRAPE_PAGE_DETAILS' }
  | { type: 'EXTRACT_STRUCTURED_DATA' }
  | { type: 'OPEN_DATATABLE'; payload: DataTablePayload }
  ;

export type MessageType = Message['type'];

export interface AutoScrollStatus {
  scrollCount: number;
  scrolling: boolean;
  height: number;
}

export interface DataTablePayload {
  columns: string[];
  rows: string[][];
  url: string;
}

// ============ DATA TYPES ============

export interface ElementSelection {
  selector: string;
  similarSelector: string;
  count: number;
  preview: string[];
  tagName: string;
  className: string;
}

export interface ColumnDefinition {
  name: string;
  selector: string;
  attribute: string;
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

export interface PhoneEntry {
  number: string;
  source: 'tel-link' | 'page-text';
  context: string;
}

export interface PhoneResult {
  phones: PhoneEntry[];
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
  jsonLd: unknown[];
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
  data?: ExtractionResult | EmailResult | PhoneResult | ImageResult | TextResult | LinkResult | TableResult | StructuredDataResult;
}

export interface ScrapeDaddySettings {
  defaultExportFormat: 'csv' | 'xlsx' | 'sheets';
  autoScrollDelay: number;
  maxPages: number;
}

export const DEFAULT_SETTINGS: ScrapeDaddySettings = {
  defaultExportFormat: 'csv',
  autoScrollDelay: 2000,
  maxPages: 10,
};
