import type { FrappeApp } from '@repo/frappe';
import { FileSaveError, saveFile } from '@repo/platform/file';
// Client-side CSV export for the selected rows (desk "Export" parity, scoped
// to the selection): fetch the selected docs' list-view fields via
// app.db().getDocList, build the CSV locally, save it through the platform
// file API (a download on web, the system save picker on native).
// KNOWN GAP: GTK has no save path — callers get `downloaded: false` plus the
// CSV text and should surface the gap honestly.
import React from 'react';

import type { DoctypeMeta } from '../shared/useDoctypeMeta';

import { BULK_EDIT_EXCLUDED_FIELDTYPES } from './bulk-edit-dialog';

function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Build a CSV string (CRLF rows, header first) from column keys + row objects. */
export function buildCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(formatCsvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => formatCsvCell(row[column])).join(','));
  }
  return lines.join('\r\n');
}

/** Value-bearing list-view fieldnames from meta (always includes "name"). */
export function exportFieldnames(meta?: DoctypeMeta): string[] {
  const fieldnames = ['name'];
  for (const field of meta?.fields ?? []) {
    if (!field.fieldname || field.fieldname === 'name') {
      continue;
    }
    if (!field.in_list_view) {
      continue;
    }
    if (BULK_EDIT_EXCLUDED_FIELDTYPES.has(field.fieldtype)) {
      continue;
    }
    fieldnames.push(field.fieldname);
  }
  return fieldnames;
}

/** Trigger a browser download. Returns false where the DOM APIs are absent. */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv'): boolean {
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export interface BulkExportResult {
  /** CSV text (also returned when the platform cannot download). */
  csv: string;
  /** Rows actually fetched — may be fewer than requested (permissions). */
  rowCount: number;
  /** A file was written (native) or a download requested (web). False on GTK. */
  downloaded: boolean;
  /** The native save picker was cancelled or refused; nothing was written. */
  cancelled: boolean;
}

/** Save CSV text through the platform file API. Throws on picker/write failure. */
export async function saveCsvFile(
  filename: string,
  csv: string,
): Promise<Pick<BulkExportResult, 'downloaded' | 'cancelled'>> {
  try {
    const result = await saveFile({
      bytes: new TextEncoder().encode(csv),
      filename,
      mimeType: 'text/csv;charset=utf-8',
    });
    return result.status === 'not-saved'
      ? { downloaded: false, cancelled: true }
      : { downloaded: true, cancelled: false };
  } catch (error) {
    if (error instanceof FileSaveError && error.code === 'unavailable') {
      return { downloaded: false, cancelled: false };
    }
    throw error;
  }
}

/** Fetch the selected docs and export them as CSV (selection-scoped export). */
export async function bulkExportCsv(
  app: FrappeApp,
  doctype: string,
  names: string[],
  meta?: DoctypeMeta,
): Promise<BulkExportResult> {
  const fields = exportFieldnames(meta);
  const rows = await app.db().getDocList(doctype, {
    fields,
    filters: [['name', 'in', names]],
    limit: 0,
  });
  const order = new Map(names.map((name, index) => [name, index]));
  const sorted = [...rows].sort(
    (a, b) =>
      (order.get(String(a.name)) ?? Number.MAX_SAFE_INTEGER) - (order.get(String(b.name)) ?? Number.MAX_SAFE_INTEGER),
  );
  const csv = buildCsv(fields, sorted as Record<string, unknown>[]);
  const filename = `${doctype.toLowerCase().replaceAll(/\s+/g, '-')}.csv`;
  return { csv, rowCount: sorted.length, ...(await saveCsvFile(filename, csv)) };
}
