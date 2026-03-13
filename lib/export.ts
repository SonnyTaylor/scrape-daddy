import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export function exportCSV(columns: string[], rows: string[][], filename: string = 'scrape-data'): void {
  const BOM = '\uFEFF';
  const header = columns.map(escapeCSV).join(',');
  const body = rows.map(row => row.map(escapeCSV).join(',')).join('\n');
  const csv = BOM + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}.csv`);
}

function escapeCSV(value: string): string {
  if (!value) return '""';
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function exportExcel(columns: string[], rows: string[][], filename: string = 'scrape-data'): void {
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  // Auto-width columns
  const colWidths = columns.map((col, i) => {
    const maxLen = rows.reduce((max, r) => Math.max(max, (r[i] || '').length), col.length);
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scraped Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function copyForSheets(columns: string[], rows: string[][]): void {
  const header = columns.join('\t');
  const body = rows.map(row => row.join('\t')).join('\n');
  const tsv = header + '\n' + body;
  navigator.clipboard.writeText(tsv);
}
