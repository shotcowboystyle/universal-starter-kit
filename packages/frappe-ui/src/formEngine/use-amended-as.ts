import { eq, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useMemo } from 'react';

import type { FrappeConnection } from './form-actions';

interface AmendmentRow {
  name: string;
  doctype: string;
  amended_from?: string;
  docstatus?: number;
}

/**
 * The live amendment of a cancelled document: a document amended from
 * `name` that is not itself cancelled (desk
 * `frappe.client.is_document_amended`). Desk disables Amend while one
 * exists. Pass no connection to skip the read.
 */
export const useAmendedAs = (
  connection: FrappeConnection | undefined,
  doctype: string,
  name: string | undefined,
): string | undefined => {
  const hasName = name !== undefined && name !== '';
  const collection = useFrappeCollection<AmendmentRow>(hasName ? connection : undefined, doctype, {
    fields: ['name', 'amended_from', 'docstatus'],
    filters: hasName ? { amended_from: name } : undefined,
  });
  const { data } = useLiveQuery(
    (q) =>
      collection && name !== undefined && name !== ''
        ? q.from({ _row: collection }).where(({ _row }) => eq(_row.amended_from, name))
        : null,
    [collection, name],
  );
  return useMemo(() => {
    const rows: AmendmentRow[] = Array.isArray(data) ? data : [];
    return rows.find((row) => (row.docstatus ?? 0) < 2)?.name;
  }, [data]);
};
