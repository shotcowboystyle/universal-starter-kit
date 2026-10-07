import { useEffect } from 'react';

import { useFrappeRows } from './useFrappeRows';
import type { FrappeRowsConnection, UseFrappeRowsOptions } from './useFrappeRows';

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
export function FrappeRowsReader<TDoc extends { name: string; doctype: string }>({
  connection,
  doctype,
  options,
  onChange,
}: FrappeRowsReaderProps<TDoc>) {
  const { rows, isLoading, error } = useFrappeRows<TDoc>(connection, doctype, options);
  useEffect(() => {
    onChange({ rows, isLoading, error });
  }, [rows, isLoading, error, onChange]);
  return null;
}
