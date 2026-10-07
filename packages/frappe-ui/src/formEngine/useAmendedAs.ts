import { eq, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useMemo } from 'react';

import type { FrappeConnection } from './formActions';

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
export function useAmendedAs(
  connection: FrappeConnection | undefined,
  doctype: string,
  name: string | undefined,
): string | undefined {
  const collection = useFrappeCollection<AmendmentRow>(name ? connection : undefined, doctype, {
    fields: ['name', 'amended_from', 'docstatus'],
    filters: name ? { amended_from: name } : undefined,
  });
  const { data } = useLiveQuery(
    (q) => (collection && name ? q.from({ _row: collection }).where(({ _row }) => eq(_row.amended_from, name)) : null),
    [collection, name],
  );
  return useMemo(() => {
    const rows = (Array.isArray(data) ? data : []) as AmendmentRow[];
    return rows.find((row) => Number(row.docstatus ?? 0) < 2)?.name;
  }, [data]);
}
