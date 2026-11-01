import { useEffect } from 'react';

import { useFrappeRows } from './use-frappe-rows';
import type { FrappeRowsConnection, UseFrappeRowsOptions } from './use-frappe-rows';

export interface FrappeRowsSnapshot<TDoc> {
  rows: TDoc[];
  isLoading: boolean;
  error: Error | null;
}

export interface FrappeRowsReaderProps<TDoc extends { name: string; doctype: string }> {
  connection: FrappeRowsConnection | undefined;
  doctype: string;
  /** Memoize it: a new identity every render re-reports the same rows. */
  options: UseFrappeRowsOptions<TDoc>;
  onChange: (snapshot: FrappeRowsSnapshot<TDoc>) => void;
}

/**
 * One doctype read as a component. A parent that needs a varying number of
 * reads (one per connection, one per junction filter) mounts one reader per
 * read instead of calling hooks in a loop. Renders nothing.
 */
export const FrappeRowsReader = <TDoc extends { name: string; doctype: string }>({
  connection,
  doctype,
  options,
  onChange,
}: FrappeRowsReaderProps<TDoc>) => {
  const { rows, isLoading, error } = useFrappeRows<TDoc>(connection, doctype, options);
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent, react-doctor/no-prop-callback-in-effect -- this component exists to report one hook's rows to a parent that mounts a variable number of readers
    onChange({ rows, isLoading, error });
  }, [rows, isLoading, error, onChange]);
  return null;
};
