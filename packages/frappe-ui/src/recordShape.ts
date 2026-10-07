/**
 * A doctype as far as one of its records shows it.
 *
 * DocType meta is permission-gated (Guest gets 403 on getdoctype) while the
 * records themselves are often readable. A data-aware view that cannot read
 * meta still owes the reader the weakest honest rendering of what they may
 * read (LC-96): the record's own fields, labelled from their keys, typed from
 * their values and read-only. These helpers are that shape, shared by every
 * view that falls back to it.
 */
import { HttpClient } from '@repo/frappe';
import type { AuthConfig, DocTypeField } from '@repo/frappe';
import { useEffect, useMemo, useState } from 'react';

/** Keys every Frappe record carries that are bookkeeping, not fields of its doctype. */
export const recordBookkeepingKeys: ReadonlySet<string> = new Set([
  'name',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
  'idx',
  'doctype',
  '_user_tags',
  '_comments',
  '_assign',
  '_liked_by',
  '_seen',
]);

function isFieldValue(value: unknown): value is string | number | null {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

/**
 * A record's own field keys in the order the server sent them. Bookkeeping
 * keys, the live collection's `$` props ($origin, $key, $collectionId) and
 * non-scalar values (child rows, objects) are dropped.
 */
export function recordFieldKeys(record: Record<string, unknown>): string[] {
  return Object.entries(record)
    .filter(([key, value]) => !key.startsWith('$') && !recordBookkeepingKeys.has(key) && isFieldValue(value))
    .map(([key]) => key);
}

/** "base_experience" → "Base Experience", for a key no meta names. */
export function recordKeyLabel(key: string): string {
  return key.replaceAll('_', ' ').replaceAll(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/**
 * The record's own fields as read-only doctype fields: Int or Float for a
 * number, Data for anything else.
 */
export function fieldsFromRecord(record: Record<string, unknown>): DocTypeField[] {
  return recordFieldKeys(record).map((key) => {
    const value = record[key];
    return {
      fieldname: key,
      label: recordKeyLabel(key),
      fieldtype: typeof value === 'number' ? (Number.isInteger(value) ? 'Int' : 'Float') : 'Data',
      read_only: 1,
    };
  });
}

export interface RecordShapeConnection {
  baseURL?: string;
  auth?: unknown;
}

export interface RecordShape {
  /** The sampled record's fields, once it has been read. */
  fields: DocTypeField[] | undefined;
  /**
   * `idle` when not asked, `pending` while the record is read, `ready` with
   * fields, `unreadable` when the doctype has no record the reader may see.
   */
  status: 'idle' | 'pending' | 'ready' | 'unreadable';
}

/**
 * Reads one record of `doctype` (`fields: ["*"]`, one row) and returns its
 * fields. Only reads while `enabled`; a view turns it on when meta is refused.
 */
export function useRecordShape(
  connection: RecordShapeConnection | undefined,
  doctype: string,
  enabled: boolean,
): RecordShape {
  const baseURL = connection?.baseURL;
  const auth = connection?.auth;
  const [sampled, setSampled] = useState<{
    key: string;
    fields: DocTypeField[] | undefined;
  }>();
  const key = `${baseURL ?? ''}\u0000${doctype}`;
  const reads = enabled && Boolean(baseURL);

  useEffect(() => {
    if (!reads || !baseURL) {
      return;
    }
    let cancelled = false;
    const http = new HttpClient(baseURL, auth as AuthConfig | undefined);
    void (async () => {
      let fields: DocTypeField[] | undefined;
      try {
        const response = await http.get<{ data?: Record<string, unknown>[] }>(
          `/api/resource/${encodeURIComponent(doctype)}`,
          { fields: ['*'], limit_page_length: 1 },
        );
        const sample = response.payload?.data?.[0];
        fields = sample ? fieldsFromRecord(sample) : undefined;
      } catch {
        fields = undefined;
      }
      if (!cancelled) {
        setSampled({ key, fields });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reads, baseURL, auth, doctype, key]);

  return useMemo((): RecordShape => {
    if (!reads) {
      return { fields: undefined, status: 'idle' };
    }
    if (sampled?.key !== key) {
      return { fields: undefined, status: 'pending' };
    }
    return sampled.fields && sampled.fields.length > 0
      ? { fields: sampled.fields, status: 'ready' }
      : { fields: undefined, status: 'unreadable' };
  }, [reads, sampled, key]);
}
