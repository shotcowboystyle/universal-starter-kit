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

const isFieldValue = (value: unknown): value is string | number | null =>
  value === null || typeof value === 'string' || typeof value === 'number';

/**
 * A record's own field keys in the order the server sent them. Bookkeeping
 * keys, the live collection's `$` props ($origin, $key, $collectionId) and
 * non-scalar values (child rows, objects) are dropped.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a record whose doctype meta is unreadable; its values are the server's unparsed JSON
export const recordFieldKeys = (record: Record<string, unknown>): string[] => {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!key.startsWith('$') && !recordBookkeepingKeys.has(key) && isFieldValue(value)) {
      keys.push(key);
    }
  }
  return keys;
};

/** "base_experience" → "Base Experience", for a key no meta names. */
export const recordKeyLabel = (key: string): string =>
  key.replaceAll('_', ' ').replaceAll(/(?<start>^|\s)\S/gu, (c) => c.toUpperCase());

const numberFieldtype = (value: number): 'Int' | 'Float' => (Number.isInteger(value) ? 'Int' : 'Float');

/**
 * The record's own fields as read-only doctype fields: Int or Float for a
 * number, Data for anything else.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a record whose doctype meta is unreadable; its values are the server's unparsed JSON
export const fieldsFromRecord = (record: Record<string, unknown>): DocTypeField[] =>
  recordFieldKeys(record).map((key) => {
    const value = record[key];
    return {
      fieldname: key,
      label: recordKeyLabel(key),
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the value is unparsed server JSON; its scalar kind is the only type signal without meta
      fieldtype: typeof value === 'number' ? numberFieldtype(value) : 'Data',
      read_only: 1,
    };
  });

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported name consumed by other views; renaming breaks the public API
export interface RecordShapeConnection {
  baseURL?: string;
  auth?: unknown;
}

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported name consumed by other views; renaming breaks the public API
export interface RecordShape {
  /** The sampled record's fields, once it has been read. */
  fields: DocTypeField[] | undefined;
  /**
   * `idle` when not asked, `pending` while the record is read, `ready` with
   * fields, `unreadable` when the doctype has no record the reader may see.
   */
  // oxlint-disable-next-line sonarjs/max-union-size -- four distinct read states callers switch on
  status: 'idle' | 'pending' | 'ready' | 'unreadable';
}

/**
 * Reads one record of `doctype` (`fields: ["*"]`, one row) and returns its
 * fields. Only reads while `enabled`; a view turns it on when meta is refused.
 */
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported hook consumed by other views; renaming breaks the public API
export const useRecordShape = (
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported type name; see RecordShapeConnection
  connection: RecordShapeConnection | undefined,
  doctype: string,
  enabled: boolean,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported type name; see RecordShape
): RecordShape => {
  const baseURL = connection?.baseURL;
  const auth = connection?.auth;
  const [sampled, setSampled] = useState<{
    key: string;
    fields: DocTypeField[] | undefined;
  }>();
  const key = `${baseURL ?? ''}\u0000${doctype}`;
  const reads = enabled && Boolean(baseURL);

  useEffect(() => {
    if (!reads || baseURL === undefined || baseURL === '') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    // SAFETY: connection.auth is the caller's FrappeProvider auth config, passed through untouched
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const http = new HttpClient(baseURL, auth as AuthConfig | undefined);
    void (async () => {
      let fields: DocTypeField[] | undefined;
      try {
        // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the doctype's meta is unreadable, so the row is untyped server JSON
        const response = await http.get<{ data?: Record<string, unknown>[] }>(
          `/api/resource/${encodeURIComponent(doctype)}`,
          { fields: ['*'], limit_page_length: 1 },
        );
        const sample = response.payload?.data?.[0];
        if (sample) {
          fields = fieldsFromRecord(sample);
        }
      } catch {
        // Safe to continue: a refused or failed read leaves `fields` unset, which renders as `unreadable`
      }
      if (!cancelled) {
        setSampled({ key, fields });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reads, baseURL, auth, doctype, key]);

  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- exported type name; see RecordShape
  return useMemo((): RecordShape => {
    if (!reads) {
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- `fields` is a required key whose absent value is `undefined` by the RecordShape contract
      return { fields: undefined, status: 'idle' };
    }
    if (sampled?.key !== key) {
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- `fields` is a required key whose absent value is `undefined` by the RecordShape contract
      return { fields: undefined, status: 'pending' };
    }
    if (sampled.fields && sampled.fields.length > 0) {
      return { fields: sampled.fields, status: 'ready' };
    }
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- `fields` is a required key whose absent value is `undefined` by the RecordShape contract
    return { fields: undefined, status: 'unreadable' };
  }, [reads, sampled, key]);
};
