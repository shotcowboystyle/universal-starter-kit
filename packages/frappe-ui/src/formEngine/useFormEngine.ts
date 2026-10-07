/**
 * The desk form state engine.
 *
 * - Edit mode: the doc lives in a name-filtered live collection
 *   (useFrappeCollection + useLiveQuery) so realtime updates flow in; saves
 *   write only dirty fields through the collection's optimistic update path
 *   (live update_doc enforces If-Match OCC — a version conflict surfaces as
 *   a save error and flips `conflict` so the UI can offer a reload).
 * - Create mode: seeds meta defaults (+ optional Duplicate/Amend prefill)
 *   and inserts via direct REST so the server-issued name is returned for
 *   router.replace(formPath(...)).
 * - Dirty tracking against the last server baseline; external updates land
 *   on clean fields in place, dirty fields are preserved.
 * - Submit / Cancel lifecycle for is_submittable doctypes via
 *   frappe.client.submit / frappe.client.cancel (probed) — realtime then
 *   refreshes the live doc; Amend is a create-mode copy with amended_from.
 */

import { eq, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { evaluateDependsOn } from '../dependsOn';

import { takeCreatePrefill } from './createPrefill';
import { computeDirtyFields, isEmptyValue, isSameValue } from './dirtyTracking';
import type { DoctypeMeta } from './doctypeMeta';
import { applyFetchedValues, buildFetchMap } from './fetchFrom';
import type { FrappeConnection } from './formActions';
import { cancelDoc, createHttpClient, getLoggedUser, insertDoc, submitDoc, validateLink } from './formActions';
import { buildCreateDefaults, isPromptNamed } from './formLayout';

type DocRecord = Record<string, unknown> & { name: string; doctype: string };

export interface FormEngine {
  /** Current (locally edited) doc values. */
  doc: Record<string, unknown>;
  /** Last authoritative server snapshot (undefined in create mode). */
  baseline: Record<string, unknown> | undefined;
  isLoading: boolean;
  /** Edit-mode doc missing after load settles (bad name / no permission). */
  notFound: boolean;
  /** The open doc was deleted on the server while open. */
  wasDeleted: boolean;
  isCreate: boolean;
  isDirty: boolean;
  dirtyFields: string[];
  isSaving: boolean;
  /** Per-field + `general` error messages. */
  errors: Record<string, string>;
  /** True after a save failed with a version conflict (OCC 409). */
  conflict: boolean;
  /** Logged-in user (for comments / likes / assignments). */
  currentUser: string;
  docstatus: number;
  setValue: (field: string, value: unknown) => void;
  /**
   * Save. Create mode resolves with the server-issued doc name;
   * edit mode resolves with the current name. Undefined = validation failed.
   */
  save: () => Promise<string | undefined>;
  /** Submit lifecycle (is_submittable): docstatus 0 → 1. */
  submit: () => Promise<boolean>;
  /** Cancel lifecycle: docstatus 1 → 2. */
  cancel: () => Promise<boolean>;
  /** Delete the doc through the live collection. */
  remove: () => Promise<boolean>;
  /** Discard local edits / clear conflict, back to the server baseline. */
  reload: () => void;
  /** Client-side required validation (fires on save too). */
  validate: () => Record<string, string>;
}

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold']);

function isConflictError(err: unknown): boolean {
  const e = err as { status?: number; exc_type?: string; message?: string } | undefined;
  if (!e) {
    return false;
  }
  if (e.status === 409) {
    return true;
  }
  if (e.exc_type === 'TimestampMismatchError') {
    return true;
  }
  return /TimestampMismatch|has been modified/i.test(e.message ?? '');
}

export function extractServerError(err: unknown, fallback: string): string {
  const e = err as { _server_messages?: string; message?: string; exc_type?: string } | undefined;
  if (e?._server_messages) {
    try {
      const messages = JSON.parse(e._server_messages) as string[];
      const parsed = messages
        .map((msg) => {
          try {
            return (JSON.parse(msg) as { message?: string }).message ?? '';
          } catch {
            return msg;
          }
        })
        .filter(Boolean);
      if (parsed.length > 0) {
        return parsed.join('\n');
      }
    } catch {
      // fall through
    }
  }
  return e?.message ?? fallback;
}

export function useFormEngine(
  connection: FrappeConnection | undefined,
  doctype: string,
  /** Document name, or undefined for create mode. */
  name: string | undefined,
  meta: DoctypeMeta | undefined,
  translate: (key: string, options?: Record<string, unknown>) => string,
): FormEngine {
  const isCreate = !name;
  const [localDoc, setLocalDoc] = useState<Record<string, unknown>>({});
  const [baseline, setBaseline] = useState<Record<string, unknown> | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const everLoadedRef = useRef(false);
  const seededRef = useRef(false);
  const localDocRef = useRef(localDoc);
  localDocRef.current = localDoc;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  // ---------------------------------------------------------------------
  // Live doc subscription (edit mode)
  // ---------------------------------------------------------------------
  const docCollection = useFrappeCollection<DocRecord>(name ? connection : undefined, doctype, {
    filters: name ? { name } : undefined,
  });
  const { data: rawDocData, isLoading: isDocLoading } = useLiveQuery(
    (q) => {
      if (!docCollection || !name) {
        return null;
      }
      return q.from({ _doc: docCollection }).where(({ _doc }) => eq(_doc.name, name));
    },
    [docCollection, name],
  );
  const liveDoc = useMemo(() => {
    const arr = Array.isArray(rawDocData) ? rawDocData : rawDocData ? [rawDocData] : [];
    return (arr[0] ?? null) as DocRecord | null;
  }, [rawDocData]);

  // ---------------------------------------------------------------------
  // Session user
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!connection) {
      return;
    }
    let cancelled = false;
    getLoggedUser(createHttpClient(connection))
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        // Anonymous fallback — comment composer degrades gracefully.
      });
    return () => {
      cancelled = true;
    };
  }, [connection?.baseURL]);

  // ---------------------------------------------------------------------
  // Reset per-document
  // ---------------------------------------------------------------------
  useEffect(() => {
    everLoadedRef.current = false;
    seededRef.current = false;
    setWasDeleted(false);
    setConflict(false);
    setErrors({});
    setBaseline(undefined);
    setLocalDoc({});
  }, [doctype, name]);

  // ---------------------------------------------------------------------
  // Create-mode seeding (meta defaults + Duplicate/Amend prefill)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isCreate || !meta || seededRef.current) {
      return;
    }
    seededRef.current = true;
    const defaults = buildCreateDefaults(meta.fields, currentUser || undefined);
    const prefill = takeCreatePrefill(doctype);
    setLocalDoc({ ...defaults, ...prefill, doctype });
    // currentUser intentionally not a dep: seeding happens once per mount;
    // a late-resolving user only matters for brand-new blank forms where
    // the meta usually arrives later anyway.
  }, [isCreate, meta, doctype]);

  // ---------------------------------------------------------------------
  // Field-level in-place sync (edit mode): server updates land on clean
  // fields; dirty fields keep the user's edits.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!name) {
      return;
    }
    if (liveDoc) {
      everLoadedRef.current = true;
      setWasDeleted(false);
      const incoming = liveDoc as Record<string, unknown>;
      const prevBaseline = baselineRef.current;
      if (!prevBaseline) {
        setBaseline(incoming);
        setLocalDoc(incoming);
        return;
      }
      const local = localDocRef.current;
      const merged: Record<string, unknown> = { ...incoming };
      for (const key of Object.keys(local)) {
        // Same predicate as dirty tracking: a normalization-identical local
        // value is not an edit, so the incoming server value wins.
        if (!isSameValue(local[key], prevBaseline[key])) {
          merged[key] = local[key];
        }
      }
      setBaseline(incoming);
      setLocalDoc(merged);
    } else if (everLoadedRef.current && !isDocLoading) {
      setWasDeleted(true);
    }
  }, [liveDoc, isDocLoading, name]);

  // ---------------------------------------------------------------------
  // Dirty tracking
  // ---------------------------------------------------------------------
  const dirtyFields = useMemo(() => computeDirtyFields(localDoc, baseline), [localDoc, baseline]);
  const isDirty = dirtyFields.length > 0;

  // ---------------------------------------------------------------------
  // fetch_from preview: when a Link with dependent fetch_from targets
  // changes, pull the source columns via frappe.client.validate_link and
  // patch the targets (desk validate_link_and_fetch). Server stays
  // authoritative on save.
  // ---------------------------------------------------------------------
  const fetchMap = useMemo(() => (meta ? buildFetchMap(meta.fields) : undefined), [meta]);
  const fetchStateRef = useRef<{
    meta: DoctypeMeta | undefined;
    connection: FrappeConnection | undefined;
  }>({ meta: undefined, connection: undefined });
  fetchStateRef.current = { meta, connection };
  const fetchMapRef = useRef(fetchMap);
  fetchMapRef.current = fetchMap;

  const runFetchFrom = useCallback((field: string, value: unknown) => {
    const rules = fetchMapRef.current?.get(field);
    if (!rules || rules.length === 0) {
      return;
    }
    const { meta: currentMeta, connection: currentConnection } = fetchStateRef.current;
    const linkField = currentMeta?.fields.find((f) => f.fieldname === field);
    const targetDoctype = typeof linkField?.options === 'string' ? linkField.options : '';
    const applyPatch = (fetched: Record<string, unknown>) => {
      setLocalDoc((prev) => {
        // The link changed again while the fetch was in flight — drop it.
        if (prev[field] !== value) {
          return prev;
        }
        const patch = applyFetchedValues(rules, fetched, prev);
        return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev;
      });
    };
    if (value === undefined || value === null || value === '') {
      // Cleared link → desk blanks the dependent targets.
      applyPatch({});
      return;
    }
    if (!currentConnection || !targetDoctype || currentConnection.fixtures) {
      return;
    }
    const sources = [...new Set(rules.map((rule) => rule.source))];
    validateLink(createHttpClient(currentConnection), targetDoctype, String(value), sources)
      .then(applyPatch)
      .catch(() => {
        // Invalid link / no read perm on source — leave targets as-is;
        // the server re-validates on save.
      });
  }, []);

  const setValue = useCallback(
    (field: string, value: unknown) => {
      setLocalDoc((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (!(field in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[field];
        return next;
      });
      runFetchFrom(field, value);
    },
    [runFetchFrom],
  );

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------
  const validate = useCallback((): Record<string, string> => {
    if (!meta) {
      return {};
    }
    // Same evaluation context desk gives depends_on: `__islocal` marks an
    // unsaved doc, `__session_user` backs `frappe.session.user` references.
    const doc: Record<string, unknown> = {
      ...localDocRef.current,
      __islocal: isCreate ? 1 : 0,
      ...(currentUser ? { __session_user: currentUser } : {}),
    };
    const validationErrors: Record<string, string> = {};
    // Prompt-named doctypes need a user-entered name before insert
    // (probed: REST insert without one fails with "Please set the document name").
    if (isCreate && isPromptNamed(meta.autoname, meta.naming_rule) && isEmptyValue(doc.name)) {
      validationErrors.name = translate('nameRequired', {
        defaultValue: 'Name is required',
      });
    }
    for (const field of meta.fields) {
      if (field.hidden || LAYOUT_TYPES.has(field.fieldtype)) {
        continue;
      }
      // Desk parity: a field hidden by depends_on is not enforced client-side.
      if (!evaluateDependsOn(field.depends_on, doc, true)) {
        continue;
      }
      const required =
        !!field.required || (!!field.mandatory_depends_on && evaluateDependsOn(field.mandatory_depends_on, doc, false));
      if (!required) {
        continue;
      }
      if (isEmptyValue(doc[field.fieldname])) {
        validationErrors[field.fieldname] = translate('fieldRequired', {
          defaultValue: '{{label}} is required',
          label: field.label ?? field.fieldname,
        });
      }
    }
    return validationErrors;
  }, [meta, isCreate, currentUser, translate]);

  // ---------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------
  const save = useCallback(async (): Promise<string | undefined> => {
    if (wasDeleted || !connection) {
      return undefined;
    }
    const requiredErrors = validate();
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      return undefined;
    }
    setIsSaving(true);
    setErrors({});
    try {
      if (name) {
        if (!docCollection) {
          return undefined;
        }
        const local = localDocRef.current;
        const base = baselineRef.current ?? {};
        // Same predicate as dirty tracking: normalization-identical values
        // must not be written back to the server as phantom edits.
        const changed = Object.keys(local).filter(
          (key) => key !== 'doctype' && key !== 'name' && !isSameValue(local[key], base[key]),
        );
        if (changed.length > 0) {
          const tx = docCollection.update(name, (draft) => {
            for (const key of changed) {
              (draft as Record<string, unknown>)[key] = local[key];
            }
          });
          await tx.isPersisted.promise;
        }
        setConflict(false);
        return name;
      }
      // Create mode: direct REST insert to obtain the server-issued name.
      // A user-entered `name` is kept for prompt-named doctypes; empty names
      // are stripped so hash/series autonaming applies.
      const { doctype: _dt, name: newName, ...values } = localDocRef.current;
      if (typeof newName === 'string' && newName.trim()) {
        values.name = newName.trim();
      }
      const created = await insertDoc(createHttpClient(connection), doctype, values);
      return String(created.name ?? '');
    } catch (error) {
      if (isConflictError(error)) {
        setConflict(true);
        setErrors({
          general: translate('conflictError', {
            defaultValue:
              'This document was modified on the server after you opened it. Reload to get the latest version — your unsaved edits will be discarded.',
          }),
        });
      } else {
        setErrors({
          general: extractServerError(error, translate('saveFailed', { defaultValue: 'Failed to save' })),
        });
      }
      return undefined;
    } finally {
      setIsSaving(false);
    }
  }, [wasDeleted, connection, validate, name, docCollection, doctype, translate]);

  // ---------------------------------------------------------------------
  // Submit / Cancel lifecycle
  // ---------------------------------------------------------------------
  const submit = useCallback(async (): Promise<boolean> => {
    if (!connection || !name) {
      return false;
    }
    setIsSaving(true);
    setErrors({});
    try {
      // The full current server doc (incl. `modified`) is required for OCC.
      const base = baselineRef.current;
      if (!base) {
        return false;
      }
      await submitDoc(createHttpClient(connection), { ...base, doctype });
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        setConflict(true);
      }
      setErrors({
        general: extractServerError(error, translate('submitFailed', { defaultValue: 'Failed to submit' })),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [connection, name, doctype, translate]);

  const cancel = useCallback(async (): Promise<boolean> => {
    if (!connection || !name) {
      return false;
    }
    setIsSaving(true);
    setErrors({});
    try {
      await cancelDoc(createHttpClient(connection), doctype, name);
      return true;
    } catch (error) {
      setErrors({
        general: extractServerError(error, translate('cancelFailed', { defaultValue: 'Failed to cancel' })),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [connection, name, doctype, translate]);

  const remove = useCallback(async (): Promise<boolean> => {
    if (!docCollection || !name || wasDeleted) {
      return false;
    }
    setIsSaving(true);
    setErrors({});
    try {
      const tx = docCollection.delete(name);
      await tx.isPersisted.promise;
      return true;
    } catch (error) {
      setErrors({
        general: extractServerError(error, translate('deleteFailed', { defaultValue: 'Failed to delete' })),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [docCollection, name, wasDeleted, translate]);

  const reload = useCallback(() => {
    setConflict(false);
    setErrors({});
    if (baselineRef.current) {
      setLocalDoc(baselineRef.current);
    } else if (!name) {
      seededRef.current = false;
      setLocalDoc({ doctype });
    }
  }, [doctype, name]);

  const docstatus = Number((baseline as { docstatus?: unknown } | undefined)?.docstatus ?? 0);

  return {
    doc: localDoc,
    baseline,
    isLoading: !!name && isDocLoading && !everLoadedRef.current,
    notFound: !!name && !isDocLoading && !liveDoc && !everLoadedRef.current,
    wasDeleted,
    isCreate,
    isDirty,
    dirtyFields,
    isSaving,
    errors,
    conflict,
    currentUser,
    docstatus,
    setValue,
    save,
    submit,
    cancel,
    remove,
    reload,
    validate,
  };
}
