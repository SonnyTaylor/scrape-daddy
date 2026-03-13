import { cn } from '@/lib/utils';

interface ResultsTableProps {
  columns: string[];
  rows: string[][];
  onExport?: () => void;
}

export default function ResultsTable({ columns, rows }: ResultsTableProps) {
  return (
    <div className="rounded-lg border border-white/[0.05] overflow-hidden">
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-amber-500/15">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-[11px] font-semibold text-amber-500 uppercase tracking-wide whitespace-nowrap"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={cn(
                  'border-t border-white/[0.03] hover:bg-white/[0.03] transition-colors',
                )}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-2 text-[#e7e5e4] max-w-[150px] truncate"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-white/[0.05] text-[11px] text-[#78716c]">
        {rows.length} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
