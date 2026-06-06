import type { ReportColumn } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReportTableProps {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null> | null;
}

/** Render a cell value: numbers as-is, `null`/`undefined` as an em dash. */
function renderCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Whether a value should be right-aligned (numeric column). */
function isNumeric(value: string | number | null | undefined): boolean {
  return typeof value === "number";
}

/**
 * Generic report renderer. Builds headers from `columns`, a row per `rows`
 * item (cells looked up by `column.key`), and an optional bold totals row whose
 * cells align under their columns by key. Numbers are right-aligned. Empty
 * results show a friendly message instead of an empty grid.
 */
export function ReportTable({ columns, rows, totals }: ReportTableProps) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No data for these filters.
      </p>
    );
  }

  // A column is treated as numeric when any data cell under it is a number.
  const numericKeys = new Set(
    columns
      .filter((col) => rows.some((row) => isNumeric(row[col.key])))
      .map((col) => col.key),
  );

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          {columns.map((col) => (
            <th
              key={col.key}
              className={cn(
                "px-4 py-3 font-medium",
                numericKeys.has(col.key) && "text-right",
              )}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr
            key={idx}
            className="border-b border-border last:border-0 hover:bg-accent/40"
          >
            {columns.map((col) => (
              <td
                key={col.key}
                className={cn(
                  "px-4 py-3 text-muted-foreground",
                  numericKeys.has(col.key) && "text-right",
                )}
              >
                {renderCell(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totals && (
        <tfoot>
          <tr className="border-t-2 border-border font-semibold text-foreground">
            {columns.map((col) => (
              <td
                key={col.key}
                className={cn(
                  "px-4 py-3",
                  numericKeys.has(col.key) && "text-right",
                )}
              >
                {col.key in totals ? renderCell(totals[col.key]) : ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export default ReportTable;
