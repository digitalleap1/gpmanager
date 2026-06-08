"use client";

import {
  Download,
  FileDown,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type FileFormat = "csv" | "xlsx";

interface BulkBarProps {
  /** Bulk-import the chosen `.csv`/`.xlsx` file. */
  onImport: (file: File) => Promise<void>;
  /** Export the current list in the chosen format. */
  onExport: (format: FileFormat) => Promise<void>;
  /** Download a blank import template in the chosen format. */
  onTemplate: (format: FileFormat) => Promise<void>;
  /** Disables every control while an import/export is in flight. */
  busy?: boolean;
}

const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50";

/**
 * Reusable import/export toolbar shared by the Websites, Payments, and Projects
 * lists. Renders a Template menu (CSV / Excel), an Export menu (CSV / Excel),
 * and an Import button backed by a hidden file input. The parent owns the
 * result panel and refresh-after-import behaviour.
 */
export function BulkBar({ onImport, onExport, onTemplate, busy }: BulkBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later.
    e.target.value = "";
    if (file) void onImport(file);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormatMenu
        label="Template"
        ariaLabel="Download import template"
        icon={<FileDown className="h-4 w-4" />}
        busy={busy}
        onSelect={onTemplate}
      />
      <FormatMenu
        label="Export"
        ariaLabel="Export data"
        icon={<Download className="h-4 w-4" />}
        busy={busy}
        onSelect={onExport}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        aria-label="Import from CSV or Excel file"
        className={buttonClass}
      >
        <Upload className="h-4 w-4" />
        {busy ? "Working…" : "Import"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface FormatMenuProps {
  label: string;
  ariaLabel: string;
  icon: React.ReactNode;
  busy?: boolean;
  onSelect: (format: FileFormat) => Promise<void>;
}

/**
 * A small button that opens a CSV / Excel choice. Closes on outside click or
 * Escape, mirroring the notification-bell dropdown pattern.
 */
function FormatMenu({ label, ariaLabel, icon, busy, onSelect }: FormatMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(format: FileFormat) {
    setOpen(false);
    void onSelect(format);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClass}
      >
        {icon}
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-36 overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose("csv")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <FileDown className="h-4 w-4 text-muted-foreground" />
            CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose("xlsx")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            Excel
          </button>
        </div>
      )}
    </div>
  );
}

export default BulkBar;
