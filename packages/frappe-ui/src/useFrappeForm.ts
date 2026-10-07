import {
  getFrappeSyncModule,
  useDocTypeMeta,
  useFrappeCollection,
  useFrappeDoctypeEvents,
  useLiveQuery,
} from '@repo/frappe';
import type { DocTypeField, DocTypeMeta, FormSection } from '@repo/frappe';
import { eq } from '@tanstack/db';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { setCreatePrefill, takeCreatePrefill } from './formEngine/createPrefill';
import { computeDirtyFields, isEmptyValue, isSameValue } from './formEngine/dirtyTracking';
import { buildAmendValues } from './formEngine/docLifecycle';
import type { DocRights, DocShareGrant } from './formEngine/docPermissions';
import { applyFetchedValues, buildFetchMap } from './formEngine/fetchFrom';
import { buildPermLevelMatrix } from './formEngine/fieldPermissions';
import { createHttpClient, validateLink } from './formEngine/formActions';
import type { FrappeConnection } from './formEngine/formActions';
import { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from './formEngine/formLayout';
import type { FormTab } from './formEngine/formLayout';
import { useAmendedAs } from './formEngine/useAmendedAs';
import { useDocRights } from './formEngine/useDocRights';
import { extractServerError } from './formEngine/useFormEngine';
import { useFrappeConfig } from './FrappeProvider';

/** Where a form's DocType meta comes from when the host already loaded it. */
export interface FrappeFormMetaSource {
  meta?: DocTypeMeta;
  isLoading: boolean;
  error?: Error | null;
}

export interface UseFrappeFormOptions<TDoc extends { name: string; doctype: string }> {
  doctype: string;
  /** The record; omitted, the form creates one. */
  name?: string;
  baseURL?: string;
  auth?: FrappeConnection['auth'];
  syncOptions?: Record<string, unknown>;
  /** Columns the live read asks for; every field when omitted. */
  fields?: readonly (keyof TDoc & string)[];
  /** Replaces the meta layout; laid out by the same engine. */
  sections?: FormSection[];
  hideFields?: readonly string[];
  /** Section or Tab Breaks to drop, by fieldname or label. */
  hideSections?: readonly string[];
  /** Roles to resolve rights and permlevels against instead of the session's. */
  roles?: string[];
  /** Rights the host already resolved (a desk page's docinfo); they win over the session's. */
  rights?: DocRights;
  /** DocShare rows the host already holds; otherwise read live when `readShares`. */
  shares?: readonly DocShareGrant[];
  /** Read the record's DocShare rows live (the sidebar's Shared With, share rights). */
  readShares?: boolean;
  /** Locks every field and action. */
  disabled?: boolean;
  /** A server-rendered copy of the record, shown until the live read lands. */
  initialDoc?: Partial<TDoc>;
  /** The host's own meta load; the form then loads none. */
  meta?: FrappeFormMetaSource;
}

/** Where the record stands: still reading, missing, unreadable, or on screen. */
export type FrappeFormStatus = 'loading' | 'ready' | 'notFound' | 'error';

/** A laid-out field, for a jump-to-field list. */
export interface FrappeFormFieldTarget {
  name: string;
  label: string;
  tabKey: string;
  tabLabel: string;
}

/**
 * A FrappeForm's state and actions, owned by whoever called `useFrappeForm`.
 * FrappeForm renders the fields from it; a host page builds its own chrome
 * (toolbar, confirms, banners) on the same object.
 */
export interface FrappeFormController<TDoc extends { name: string; doctype: string }> {
  doctype: string;
  name?: string;
  isCreate: boolean;
  /** The connection the form reads and writes through; undefined when no bench is configured. */
  connection?: FrappeFormConnectionConfig;
  meta?: DocTypeMeta;
  metaLoading: boolean;
  metaError?: Error | null;
  doc: Partial<TDoc>;
  /** The last server copy the edits are measured against. */
  baseline?: Partial<TDoc>;
  setValue: (field: keyof TDoc | string, value: unknown) => void;
  errors: Record<string, string>;
  setErrors: (errors: Record<string, string>) => void;
  dirtyFields: string[];
  isDirty: boolean;
  isSubmitting: boolean;
  docstatus: number;
  isSubmittable: boolean;
  rights: DocRights;
  /** The session's roles are still loading, so `rights` withholds what they may grant. */
  rightsPending: boolean;
  roles?: string[];
  /** The session user, once known. */
  user?: string;
  /** The record's DocShare rows: the host's, the live read, or undefined when neither. */
  shareRows?: readonly DocShareGrant[];
  /** Create on a new record, write on a saved one. */
  canWrite: boolean;
  /** Nothing on the record can change: disabled, deleted, a read-only doctype, or no write. */
  readOnly: boolean;
  wasDeleted: boolean;
  /** Fields the user edited that also changed on the server. */
  conflictFields: string[];
  /** A save lost to a newer server copy, or fields changed on both sides. */
  conflict: boolean;
  status: FrappeFormStatus;
  docError: Error | null;
  /** A server-rendered copy stands in while the live read is out. */
  showsSeed: boolean;
  /** The laid-out tabs; undefined until meta is known. */
  tabs?: FormTab[];
  /** The doctype names records by prompt, so a new one asks for a name. */
  promptNamed: boolean;
  fieldTargets: FrappeFormFieldTarget[];
  activeTab?: string;
  setActiveTab: (tab: string | undefined) => void;
  /** Opens the tab a field sits on; false when no tab shows it. */
  revealField: (name: string) => boolean;
  /** The live amendment of a cancelled record, if one exists. */
  amendedAs?: string;
  /** Required fields that are empty, keyed by field. */
  validate: () => Record<string, string>;
  /** Saves; resolves with the record's name, undefined when nothing was written. */
  save: () => Promise<string | undefined>;
  /** Draft to submitted, through the record's live collection. No confirm. */
  submitDocument: () => Promise<boolean>;
  /** Submitted to cancelled, through the record's live collection. No confirm. */
  cancelDocument: () => Promise<boolean>;
  /** Deletes the record. No confirm. */
  remove: () => Promise<boolean>;
  /** Drops the edits, conflicts and errors: back to the server copy. */
  reset: () => void;
  /** Stashes and returns the amended draft of a cancelled record (desk copy_doc from_amend). */
  amend: () => Partial<TDoc> | undefined;
  /** Stashes and returns the copyable values for a duplicate (desk copy_doc). */
  duplicate: () => Record<string, unknown> | undefined;
}

/** The connection a form reads and writes through. */
export type FrappeFormConnectionConfig = FrappeConnection;

/** A `sections` override as the flat break-delimited list the engine lays out. */
function sectionsToLayoutFields(sections: FormSection[]): DocTypeField[] {
  const fields: DocTypeField[] = [];
  sections.forEach((section, sectionIndex) => {
    fields.push({
      fieldname: `__section_${sectionIndex}`,
      fieldtype: section.tab ? 'Tab Break' : 'Section Break',
      label: section.label,
      collapsible: section.collapsible ? 1 : 0,
    });
    section.columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) {
        fields.push({
          fieldname: `__column_${sectionIndex}_${columnIndex}`,
          fieldtype: 'Column Break',
        });
      }
      fields.push(...column.fields);
    });
  });
  return fields;
}

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

/**
 * The state behind a FrappeForm: meta, the live record, edits measured
 * against the server copy, rights, the desk layout (`buildFormTabs`), and
 * save, submit, cancel, amend and delete. `<FrappeForm form={controller} />`
 * renders the fields from it, so a page that wants its own chrome keeps one
 * engine with FrappeForm.
 */
export function useFrappeForm<TDoc extends { name: string; doctype: string }>(
  options: UseFrappeFormOptions<TDoc>,
): FrappeFormController<TDoc> {
  const {
    doctype,
    name,
    baseURL,
    auth,
    syncOptions,
    fields,
    sections,
    hideFields,
    hideSections,
    roles,
    rights: rightsOverride,
    shares: sharesOverride,
    readShares = true,
    disabled = false,
    initialDoc,
    meta: metaSource,
  } = options;
  const config = useFrappeConfig();
  const { t } = useTranslation();
  const isCreate = !name;
  const seedDoc = name && initialDoc && (initialDoc as { name?: string }).name === name ? initialDoc : undefined;
  const seedRef = useRef(seedDoc);
  seedRef.current = seedDoc;
  const [localDoc, setLocalDoc] = useState<Partial<TDoc>>(() => seedDoc ?? {});
  const [baselineDoc, setBaselineDoc] = useState<Partial<TDoc> | undefined>(() => seedDoc);
  const [docError, setDocError] = useState<Error | null>(null);
  const [conflictFields, setConflictFields] = useState<string[]>([]);
  const [saveConflict, setSaveConflict] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const everLoadedRef = useRef(false);
  const localDocRef = useRef(localDoc);
  localDocRef.current = localDoc;
  const baselineRef = useRef(baselineDoc);
  baselineRef.current = baselineDoc;
  // Taken once per create session: effects re-run (StrictMode) must not
  // lose a draft the one-shot stash already handed over.
  const createDraftRef = useRef<{ doctype: string; values?: Record<string, unknown> }>();
  const createSeededRef = useRef<string | undefined>();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  const frappeConfig = useMemo<FrappeFormConnectionConfig | undefined>(
    () =>
      finalBaseURL
        ? {
            baseURL: finalBaseURL,
            socketPort: config?.socketPort,
            siteName: config?.siteName,
            socketBaseURL: config?.socketBaseURL,
            auth: finalAuth,
            syncOptions: finalSyncOptions,
            realtime: config?.realtime,
            fixtures: config?.fixtures,
          }
        : undefined,
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.fixtures,
    ],
  );

  const ownMeta = useDocTypeMeta(metaSource ? undefined : frappeConfig, doctype);
  const meta = metaSource ? metaSource.meta : ownMeta.meta;
  const isMetaLoading = metaSource ? metaSource.isLoading : ownMeta.isLoading;
  const metaError = metaSource ? metaSource.error : ownMeta.error;

  const isSubmittable = !!meta?.is_submittable;
  const docstatus = Number((baselineDoc as Record<string, unknown> | undefined)?.docstatus ?? 0);
  const layoutFields = useMemo(() => {
    if (!meta) {
      return;
    }
    return sections ? sectionsToLayoutFields(sections) : meta.fields;
  }, [meta, sections]);
  const amendedAs = useAmendedAs(isSubmittable && docstatus === 2 ? frappeConfig : undefined, doctype, name);
  const promptNamed = isCreate && !!meta && isPromptNamed(meta.autoname, meta.naming_rule);
  const fetchMap = useMemo(() => (meta ? buildFetchMap(meta.fields) : undefined), [meta]);

  const handleDocSyncError = useCallback((err: unknown) => {
    setDocError(err instanceof Error ? err : new Error(String(err)));
  }, []);
  const docCollection = useFrappeCollection<TDoc>(name ? frappeConfig : undefined, doctype, {
    fields,
    filters: name ? { name } : undefined,
    onSyncError: handleDocSyncError,
  });
  const { data: rawDocData, isLoading: isDocLoading } = useLiveQuery(
    (q) => {
      if (!docCollection || !name) {
        return null;
      }
      return q.from({ _doc: docCollection }).where(({ _doc }) => {
        if (!_doc) {
          return eq(name, name);
        }
        return eq(_doc.name, name);
      });
    },
    [docCollection, name],
  );
  const liveDoc = useMemo(() => {
    const arr = Array.isArray(rawDocData) ? rawDocData : rawDocData ? [rawDocData] : [];
    const doc = (arr[0] ?? null) as TDoc | null;
    return doc ? { data: doc, isLoading: isDocLoading } : name ? { data: null, isLoading: isDocLoading } : null;
  }, [rawDocData, isDocLoading, name]);

  // Create-mode collection (insert path). Edit-mode saves/deletes go through
  // docCollection above, the name-filtered subscription that owns the doc.
  const collection = useFrappeCollection<TDoc>(name ? undefined : frappeConfig, doctype, {
    fields,
  });

  const shareCollection = useFrappeCollection<DocShareGrant & { name: string; doctype: string }>(
    readShares && !sharesOverride && name ? frappeConfig : undefined,
    'DocShare',
    {
      fields: ['name', 'user', 'everyone', 'read', 'write', 'share'],
      filters: { share_doctype: doctype, share_name: name },
    },
  );
  const { data: rawShareRows } = useLiveQuery(
    (q) => (shareCollection ? q.from({ _share: shareCollection }) : null),
    [shareCollection],
  );
  const shareRows = useMemo(
    () => sharesOverride ?? (shareCollection ? ((rawShareRows as DocShareGrant[] | undefined) ?? []) : undefined),
    [sharesOverride, shareCollection, rawShareRows],
  );

  const owner = (baselineDoc as Record<string, unknown> | undefined)?.owner;
  const {
    rights: sessionRights,
    pending: sessionPending,
    roles: effectiveRoles,
    user,
  } = useDocRights(frappeConfig, meta, {
    roles,
    owner: typeof owner === 'string' ? owner : undefined,
    shares: shareRows,
  });
  const rights = rightsOverride ?? sessionRights;
  const rightsPending = rightsOverride ? false : sessionPending;
  const permLevels = useMemo(
    () => buildPermLevelMatrix(meta?.permissions, effectiveRoles),
    [meta?.permissions, effectiveRoles],
  );
  const tabs = useMemo(() => {
    if (!layoutFields) {
      return;
    }
    return buildFormTabs({
      fields: layoutFields,
      doc: {
        ...(localDoc as Record<string, unknown>),
        __islocal: isCreate ? 1 : 0,
        ...(user ? { __session_user: user } : {}),
      },
      docstatus,
      formReadOnly: !!meta?.read_only,
      isCreate,
      detailsLabel: t('Details'),
      permLevels,
      hiddenFields: hideFields,
      hiddenSections: hideSections,
    });
  }, [layoutFields, localDoc, isCreate, user, docstatus, meta?.read_only, permLevels, hideFields, hideSections, t]);

  // Reset per-document state when the target document changes.
  useEffect(() => {
    everLoadedRef.current = false;
    if (name) {
      createDraftRef.current = undefined;
    }
    createSeededRef.current = undefined;
    setWasDeleted(false);
    setConflictFields([]);
    setSaveConflict(false);
    setDocError(null);
    const seed = seedRef.current;
    setBaselineDoc(seed);
    if (seed) {
      setLocalDoc(seed);
    }
  }, [doctype, name]);

  // Immediate honest deleted state: the live app emits doc_deleted for the
  // open doc's doctype room; the eviction branch below is the durable fallback.
  useFrappeDoctypeEvents(
    name ? frappeConfig : undefined,
    doctype,
    (event) => {
      if (event.type !== 'doc_deleted') {
        return;
      }
      const payload = event.payload as { name?: string } | undefined;
      if (payload?.name === name) {
        setWasDeleted(true);
      }
    },
    Boolean(name),
  );

  // Field-level in-place sync: external updates land on clean fields, the
  // user's dirty edits are kept, and a field both sides changed is flagged.
  useEffect(() => {
    const incoming = liveDoc?.data as Record<string, unknown> | undefined;
    if (incoming) {
      everLoadedRef.current = true;
      setWasDeleted(false);
      const baseline = baselineRef.current as Record<string, unknown> | undefined;
      if (!baseline) {
        setBaselineDoc(incoming as Partial<TDoc>);
        setLocalDoc(incoming as Partial<TDoc>);
        return;
      }
      const local = localDocRef.current as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...incoming };
      const newConflicts: string[] = [];
      for (const key of Object.keys(local)) {
        const localValue = local[key];
        if (isSameValue(localValue, baseline[key])) {
          continue;
        }
        merged[key] = localValue;
        const remote = incoming[key];
        if (!isSameValue(remote, baseline[key]) && !isSameValue(remote, localValue)) {
          newConflicts.push(key);
        }
      }
      setBaselineDoc(incoming as Partial<TDoc>);
      setLocalDoc(merged as Partial<TDoc>);
      if (newConflicts.length > 0) {
        setConflictFields((prev) => [...new Set([...prev, ...newConflicts])]);
      }
    } else if (name && everLoadedRef.current && !liveDoc?.isLoading) {
      // The doc was live and is now gone from the subscription: deleted on
      // the server (doc_deleted event, CDC tombstone, or 404 eviction).
      setWasDeleted(true);
    }
  }, [liveDoc?.data, liveDoc?.isLoading, doctype, name]);

  // A new record starts from the doctype's defaults (desk create_new), the
  // stashed draft (?d=, Duplicate, Amend) over them. Meta or the session user
  // arriving later fills in what they add without touching typed values.
  useEffect(() => {
    if (name) {
      return;
    }
    if (createDraftRef.current?.doctype !== doctype) {
      createDraftRef.current = { doctype, values: takeCreatePrefill(doctype) };
    }
    const draft = createDraftRef.current.values;
    const defaults = meta ? buildCreateDefaults(meta.fields, user) : {};
    const fresh = createSeededRef.current !== doctype;
    createSeededRef.current = doctype;
    setLocalDoc((prev) => ({ ...defaults, ...draft, ...(fresh ? {} : prev), doctype }) as Partial<TDoc>);
  }, [name, doctype, meta, user]);

  const dirtyFields = useMemo(
    () => computeDirtyFields(localDoc as Record<string, unknown>, baselineDoc as Record<string, unknown> | undefined),
    [localDoc, baselineDoc],
  );
  const isDirty = dirtyFields.length > 0;

  // fetch_from preview: a changed Link pulls its dependent columns off the
  // linked doc (validate_link on a bench, the fixture corpus otherwise) and
  // patches the targets; clearing the link blanks them.
  const runFetchFrom = (field: string, value: unknown) => {
    const rules = fetchMap?.get(field);
    if (!rules || rules.length === 0 || !frappeConfig) {
      return;
    }
    const applyPatch = (fetched: Record<string, unknown>) => {
      setLocalDoc((prev) => {
        const current = prev as Record<string, unknown>;
        if (current[field] !== value) {
          return prev;
        }
        const patch = applyFetchedValues(rules, fetched, current);
        return Object.keys(patch).length > 0 ? ({ ...current, ...patch } as Partial<TDoc>) : prev;
      });
    };
    if (isEmptyValue(value)) {
      applyPatch({});
      return;
    }
    const linkField = meta?.fields.find((metaField) => metaField.fieldname === field);
    const targetDoctype = typeof linkField?.options === 'string' ? linkField.options : '';
    if (!targetDoctype) {
      return;
    }
    const sources = [...new Set(rules.map((rule) => rule.source))];
    const { fixtures } = frappeConfig;
    const fetched = fixtures
      ? fixtures.getDoc(targetDoctype, String(value), sources).then((doc) => (doc ?? {}) as Record<string, unknown>)
      : validateLink(createHttpClient(frappeConfig), targetDoctype, String(value), sources);
    // An unknown link leaves the targets as they are; the server re-validates on save.
    fetched.then(applyPatch).catch(() => {});
  };

  const setValue = (field: keyof TDoc | string, value: unknown) => {
    setLocalDoc((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErrors((prev) => {
      if (!(String(field) in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[String(field)];
      return next;
    });
    runFetchFrom(String(field), value);
  };

  // Required = what the engine resolved: required or a truthy
  // mandatory_depends_on, on fields that are actually laid out (depends_on,
  // permlevel and host-hidden fields never reach the tabs).
  const validate = (): Record<string, string> => {
    if (!tabs) {
      return {};
    }
    const validationErrors: Record<string, string> = {};
    const doc = localDoc as Record<string, unknown>;
    if (promptNamed && isEmptyValue(doc.name)) {
      validationErrors.name = t('Name is required');
    }
    for (const tab of tabs) {
      for (const field of tab.schema.fields) {
        if (!field.required) {
          continue;
        }
        if (isEmptyValue(doc[field.name])) {
          validationErrors[field.name] = t('{{label}} is required', {
            label: field.label ?? field.name,
          });
        }
      }
    }
    return validationErrors;
  };

  const canWrite = isCreate ? rights.create : rights.write;

  const save = async (): Promise<string | undefined> => {
    if (wasDeleted || !canWrite || disabled) {
      return undefined;
    }

    const requiredErrors = validate();
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      return undefined;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      if (name) {
        if (!docCollection) {
          return undefined;
        }
        // Write only the dirty fields through the optimistic mutation path;
        // clean fields stay untouched so concurrent server edits survive.
        if (dirtyFields.length > 0) {
          const local = localDoc as Record<string, unknown>;
          const tx = docCollection.update(name, (draft) => {
            for (const key of dirtyFields) {
              (draft as Record<string, unknown>)[key] = local[key];
            }
          });
          await tx.isPersisted.promise;
        }
        setConflictFields([]);
        setSaveConflict(false);
        return name;
      }
      if (!collection || !frappeConfig) {
        return undefined;
      }
      const temporaryName = ((localDoc as Record<string, unknown>).name as string | undefined) ?? `new-${Date.now()}`;
      const docToInsert = { ...localDoc, doctype, name: temporaryName } as TDoc;
      const tx = collection.insert(docToInsert);
      await tx.isPersisted.promise;
      return getFrappeSyncModule(frappeConfig)?.createdName(temporaryName) ?? temporaryName;
    } catch (error: unknown) {
      const e = error as { exc_type?: string; _server_messages?: string; message?: string };
      if (isConflictError(error)) {
        setSaveConflict(true);
      }
      if (e?.exc_type === 'ValidationError') {
        const validationErrors: Record<string, string> = {};
        if (e._server_messages) {
          try {
            const messages = JSON.parse(e._server_messages) as string[];
            for (const msg of messages) {
              const parsed = typeof msg === 'string' ? (JSON.parse(msg) as { message?: string }) : msg;
              if (parsed.message) {
                validationErrors.general = parsed.message;
              }
            }
          } catch {
            validationErrors.general = t('Validation error occurred');
          }
        }
        setErrors(validationErrors);
      } else {
        setErrors({ general: e?.message ?? t('Failed to save document') });
      }
      return undefined;
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    if (baselineDoc) {
      setLocalDoc(baselineDoc);
    } else if (liveDoc?.data) {
      setLocalDoc(liveDoc.data as Partial<TDoc>);
    } else {
      setLocalDoc({ doctype } as Partial<TDoc>);
    }
    setConflictFields([]);
    setSaveConflict(false);
    setErrors({});
  };

  const remove = async (): Promise<boolean> => {
    if (!docCollection || !name || wasDeleted || !rights.delete) {
      return false;
    }
    setIsSubmitting(true);
    setErrors({});
    try {
      const tx = docCollection.delete(name);
      await tx.isPersisted.promise;
      return true;
    } catch (error) {
      setErrors({ general: (error as Error)?.message || t('Failed to delete') });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit and Cancel write docstatus through the collection that owns the
  // doc: the server's save runs the transition (0 → 1 submits, 1 → 2
  // cancels) under the same OCC as any other edit.
  const transitionDocstatus = async (to: 1 | 2, failure: string): Promise<boolean> => {
    if (!docCollection || !name || wasDeleted || !rights[to === 1 ? 'submit' : 'cancel']) {
      return false;
    }
    if (to === 1) {
      const requiredErrors = validate();
      if (Object.keys(requiredErrors).length > 0) {
        setErrors(requiredErrors);
        return false;
      }
    }
    setIsSubmitting(true);
    setErrors({});
    try {
      const tx = docCollection.update(name, (draft) => {
        (draft as Record<string, unknown>).docstatus = to;
      });
      await tx.isPersisted.promise;
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        setSaveConflict(true);
      }
      setErrors({ general: extractServerError(error, failure) });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDocument = async () => await transitionDocstatus(1, t('Failed to submit'));
  const cancelDocument = async () => await transitionDocstatus(2, t('Failed to cancel'));

  const amend = (): Partial<TDoc> | undefined => {
    if (!meta || !name || !rights.amend) {
      return undefined;
    }
    const draft = buildAmendValues(meta.fields, localDoc as Record<string, unknown>, name);
    setCreatePrefill(doctype, draft);
    return draft as Partial<TDoc>;
  };

  const duplicate = (): Record<string, unknown> | undefined => {
    if (!meta) {
      return undefined;
    }
    const values = buildCopyValues(meta.fields, localDoc as Record<string, unknown>);
    setCreatePrefill(doctype, values);
    return values;
  };

  const fieldTargets = useMemo<FrappeFormFieldTarget[]>(
    () =>
      (tabs ?? []).flatMap((tab) =>
        tab.schema.fields.map((field) => ({
          name: field.name,
          label: field.label ?? field.name,
          tabKey: tab.key,
          tabLabel: tab.label,
        })),
      ),
    [tabs],
  );
  const revealField = (fieldName: string): boolean => {
    const target = fieldTargets.find((field) => field.name === fieldName);
    if (!target) {
      return false;
    }
    setActiveTab(target.tabKey);
    return true;
  };

  // No collection yet (server render, hydration pass) reads as loading: the
  // document is not known to be missing until the live read answers.
  const isDocReading = Boolean(name) && (!docCollection || Boolean(liveDoc?.isLoading));
  const showsSeed = Boolean(seedDoc) && isDocReading;
  const status: FrappeFormStatus = name
    ? docError && !liveDoc?.data && !wasDeleted
      ? 'error'
      : isDocReading && !showsSeed && !wasDeleted
        ? 'loading'
        : !isDocReading && !liveDoc?.data && !wasDeleted
          ? 'notFound'
          : 'ready'
    : 'ready';

  return {
    doctype,
    name,
    isCreate,
    connection: frappeConfig,
    meta,
    metaLoading: isMetaLoading,
    metaError,
    doc: localDoc,
    baseline: baselineDoc,
    setValue,
    errors,
    setErrors,
    dirtyFields,
    isDirty,
    isSubmitting,
    docstatus,
    isSubmittable,
    rights,
    rightsPending,
    roles: effectiveRoles,
    user,
    shareRows,
    canWrite,
    readOnly: disabled || wasDeleted || !!meta?.read_only || !canWrite,
    wasDeleted,
    conflictFields,
    conflict: saveConflict || conflictFields.length > 0,
    status,
    docError,
    showsSeed,
    tabs,
    promptNamed,
    fieldTargets,
    activeTab,
    setActiveTab,
    revealField,
    amendedAs,
    validate,
    save,
    submitDocument,
    cancelDocument,
    remove,
    reset,
    amend,
    duplicate,
  };
}
