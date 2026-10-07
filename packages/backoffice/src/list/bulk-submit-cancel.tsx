import type { FrappeApp } from '@repo/frappe';
// Bulk submit / cancel for submittable doctypes (desk parity) via
// frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs
// {doctype, docnames: JSON names[], action}. Probed against the bench:
// <20 docs runs sync and returns the failed docnames; 20–500 docs the server
// backgrounds the job (message is null → `queued`); >500 the server throws.
import React from 'react';

export type BulkDocstatusAction = 'submit' | 'cancel';

export interface BulkSubmitCancelResult {
  /** Docnames the server reported as failed (sync path only). */
  failed: string[];
  /** True when the server backgrounded the job (≥20 docs) — no per-doc report. */
  queued: boolean;
  attempted: number;
}

export async function bulkSubmitCancel(
  app: FrappeApp,
  doctype: string,
  names: string[],
  action: BulkDocstatusAction,
): Promise<BulkSubmitCancelResult> {
  const res = await app.call().post<{
    message?: string[] | null;
  }>('frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs', {
    doctype,
    docnames: JSON.stringify(names),
    action,
  });
  const failed = res.payload?.message;
  return {
    failed: Array.isArray(failed) ? failed : [],
    queued: !Array.isArray(failed),
    attempted: names.length,
  };
}
