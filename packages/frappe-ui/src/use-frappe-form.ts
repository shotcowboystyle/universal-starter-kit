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

import { setCreatePrefill, takeCreatePrefill } from './formEngine/create-prefill';
import { computeDirtyFields, isEmptyValue, isSameValue } from './formEngine/dirty-tracking';
import { buildAmendValues } from './formEngine/doc-lifecycle';
import type { DocRights, DocShareGrant } from './formEngine/doc-permissions';
import { applyFetchedValues, buildFetchMap } from './formEngine/fetch-from';
import { buildPermLevelMatrix } from './formEngine/field-permissions';
import { createHttpClient, validateLink } from './formEngine/form-actions';
import type { FrappeConnection } from './formEngine/form-actions';
import { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from './formEngine/form-layout';
import type { FormTab } from './formEngine/form-layout';
import { useAmendedAs } from './formEngine/use-amended-as';
import { useDocRights } from './formEngine/use-doc-rights';
import { extractServerError } from './formEngine/use-form-engine';
import { useFrappeConfig } from './FrappeProvider';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a doc's fields are defined by its DocType meta at runtime, so values are untyped here
type DocValues = Record<string, unknown>;

/** Messages keyed by field (`general` for the record as a whole). */
type FieldErrors = Record<string, string>;

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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- public API: passed through untouched to the sync engine's own options
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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a field's value type depends on the doctype's meta, known only at runtime
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
  duplicate: () => DocValues | undefined;
}

/** The connection a form reads and writes through. */
export type FrappeFormConnectionConfig = FrappeConnection;

/** A `sections` override as the flat break-delimited list the engine lays out. */
const sectionsToLayoutFields = (sections: FormSection[]): DocTypeField[] => {
  const fields: DocTypeField[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    fields.push({
      fieldname: `__section_${sectionIndex}`,
      fieldtype: section.tab ? 'Tab Break' : 'Section Break',
      label: section.label,
      collapsible: section.collapsible ? 1 : 0,
    });
    for (const [columnIndex, column] of section.columns.entries()) {
      if (columnIndex > 0) {
        fields.push({
          fieldname: `__column_${sectionIndex}_${columnIndex}`,
          fieldtype: 'Column Break',
        });
      }
      fields.push(...column.fields);
    }
  }
  return fields;
};

// SAFETY: a doc (or its draft proxy) is a plain field -> value object; reading it as a dictionary only widens the view
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-object-parameters -- see SAFETY above; any doc-shaped object (row, partial, draft proxy) is accepted
const asDocValues = (doc: object): DocValues => doc as DocValues;

// SAFETY: field -> value maps built from the doctype's own fields (server rows, defaults, drafts) are that doctype's partial docs
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const asPartialDoc = <TDoc>(values: DocValues): Partial<TDoc> => values as Partial<TDoc>;

const CONFLICT_MESSAGE_RE = /TimestampMismatch|has been modified/iu;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- inspects whatever a save/transition threw
const isConflictError = (err: unknown): boolean => {
  // SAFETY: optional reads of the fields Frappe's HTTP errors carry; a missing field is undefined and fails each check
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
  return CONFLICT_MESSAGE_RE.test(e.message ?? '');
};

/** The `general` message of a Frappe ValidationError's `_server_messages` (each entry JSON or decoded). */
const serverValidationErrors = (serverMessages: string, fallback: string) => {
  const validationErrors: FieldErrors = {};
  try {
    // SAFETY: Frappe sends `_server_messages` as a JSON array of JSON-encoded `{ message }` entries
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const messages = JSON.parse(serverMessages) as (string | { message?: string })[];
    for (const msg of messages) {
      const parsed =
        // SAFETY: a string entry is itself a JSON-encoded `{ message }` object
        // oxlint-disable-next-line anti-slop/no-runtime-typeof, typescript/no-unsafe-type-assertion -- entries arrive encoded or already decoded; see SAFETY above
        typeof msg === 'string' ? (JSON.parse(msg) as { message?: string }) : msg;
      if (parsed.message !== undefined && parsed.message !== '') {
        validationErrors.general = parsed.message;
      }
    }
  } catch {
    // Safe to continue: unparseable server messages still surface as a generic validation error
    validationErrors.general = fallback;
  }
  return validationErrors;
};

/** Field errors for a failed save: Frappe validation messages, else the error's own message. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- inspects whatever the save threw
const saveErrorsFor = (error: unknown, fallbacks: { validation: string; failed: string }) => {
  // SAFETY: optional reads of the fields Frappe's HTTP errors carry; missing fields fall back below
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const e = error as { exc_type?: string; _server_messages?: string; message?: string } | undefined;
  if (e?.exc_type !== 'ValidationError') {
    return { general: e?.message ?? fallbacks.failed };
  }
  const serverMessages = e._server_messages;
  if (serverMessages === undefined || serverMessages === '') {
    return {};
  }
  return serverValidationErrors(serverMessages, fallbacks.validation);
};

interface FormStatusInput {
  hasName: boolean;
  wasDeleted: boolean;
  hasError: boolean;
  hasData: boolean;
  isDocReading: boolean;
  showsSeed: boolean;
}

const formStatus = ({
  hasName,
  wasDeleted,
  hasError,
  hasData,
  isDocReading,
  showsSeed,
}: FormStatusInput): FrappeFormStatus => {
  if (!hasName || wasDeleted) {
    return 'ready';
  }
  if (hasError && !hasData) {
    return 'error';
  }
  if (isDocReading && !showsSeed) {
    return 'loading';
  }
  if (!isDocReading && !hasData) {
    return 'notFound';
  }
  return 'ready';
};

/**
 * The state behind a FrappeForm: meta, the live record, edits measured
 * against the server copy, rights, the desk layout (`buildFormTabs`), and
 * save, submit, cancel, amend and delete. `<FrappeForm form={controller} />`
 * renders the fields from it, so a page that wants its own chrome keeps one
 * engine with FrappeForm.
 */
// oxlint-disable-next-line eslint/complexity -- one hook owns the whole form state machine; its branches are flat option/state checks
export const useFrappeForm = <TDoc extends { name: string; doctype: string }>(
  options: UseFrappeFormOptions<TDoc>,
): FrappeFormController<TDoc> => {
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
  const isCreate = name === undefined || name === '';
  const seedDoc = !isCreate && initialDoc?.name === name ? initialDoc : undefined;
  const seedRef = useRef(seedDoc);
  // oxlint-disable-next-line react/refs -- latest-value ref: the reset effect reads the current seed without re-running on it
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
  // oxlint-disable-next-line react/refs -- latest-value ref: the live-sync effect merges against the current edits without re-running on each keystroke
  localDocRef.current = localDoc;
  const baselineRef = useRef(baselineDoc);
  // oxlint-disable-next-line react/refs -- latest-value ref: the live-sync effect diffs against the current baseline without re-running on it
  baselineRef.current = baselineDoc;
  // Taken once per create session: effects re-run (StrictMode) must not
  // lose a draft the one-shot stash already handed over.
  const createDraftRef = useRef<{ doctype: string; values?: DocValues } | null>(null);
  const createSeededRef = useRef<string | null>(null);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  const frappeConfig = useMemo<FrappeFormConnectionConfig | undefined>(
    () =>
      finalBaseURL !== undefined && finalBaseURL !== ''
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
  const { meta, isLoading: isMetaLoading, error: metaError } = metaSource ?? ownMeta;

  const isSubmittable = (meta?.is_submittable ?? 0) !== 0;
  const formReadOnly = (meta?.read_only ?? 0) !== 0;
  const baselineValues = baselineDoc === undefined ? undefined : asDocValues(baselineDoc);
  const docstatus = Number(baselineValues?.docstatus ?? 0);
  const layoutFields = useMemo(() => {
    if (meta && sections) {
      return sectionsToLayoutFields(sections);
    }
    return meta?.fields;
  }, [meta, sections]);
  const amendedAs = useAmendedAs(isSubmittable && docstatus === 2 ? frappeConfig : undefined, doctype, name);
  const promptNamed = isCreate && !!meta && isPromptNamed(meta.autoname, meta.naming_rule);
  const fetchMap = useMemo(() => (meta ? buildFetchMap(meta.fields) : undefined), [meta]);

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever the sync layer threw; normalised to an Error here
  const handleDocSyncError = useCallback((err: unknown) => {
    setDocError(err instanceof Error ? err : new Error(String(err)));
  }, []);
  const docCollection = useFrappeCollection<TDoc>(isCreate ? undefined : frappeConfig, doctype, {
    fields,
    filters: isCreate ? undefined : { name },
    onSyncError: handleDocSyncError,
  });
  const { data: rawDocData, isLoading: isDocLoading } = useLiveQuery(
    (q) => {
      if (!docCollection || name === undefined || name === '') {
        return null;
      }
      return q.from({ _doc: docCollection }).where(({ _doc }) => {
        // oxlint-disable-next-line typescript/strict-boolean-expressions -- kept from the original query as a guard on a missing alias ref; tanstack's types say it is always set
        if (!_doc) {
          return eq(name, name);
        }
        return eq(_doc.name, name);
      });
    },
    [docCollection, name],
  );
  const liveDoc = useMemo(() => {
    // The query is a row list; its declared non-array case is only null/undefined.
    const arr = Array.isArray(rawDocData) ? rawDocData : [];
    // SAFETY: the query reads `docCollection`, a TDoc collection, so its rows are TDocs
    const doc = (arr[0] ?? null) as TDoc | null;
    if (doc) {
      return { data: doc, isLoading: isDocLoading };
    }
    return isCreate ? null : { data: null, isLoading: isDocLoading };
  }, [rawDocData, isDocLoading, isCreate]);

  // Create-mode collection (insert path). Edit-mode saves/deletes go through
  // docCollection above, the name-filtered subscription that owns the doc.
  const collection = useFrappeCollection<TDoc>(isCreate ? frappeConfig : undefined, doctype, {
    fields,
  });

  const shareCollection = useFrappeCollection<DocShareGrant & { name: string; doctype: string }>(
    readShares && !sharesOverride && !isCreate ? frappeConfig : undefined,
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
    // SAFETY: the share query reads `shareCollection`, a DocShareGrant collection
    () => sharesOverride ?? (shareCollection ? ((rawShareRows as DocShareGrant[] | undefined) ?? []) : undefined),
    [sharesOverride, shareCollection, rawShareRows],
  );

  const owner = baselineValues?.owner;
  const {
    rights: sessionRights,
    pending: sessionPending,
    roles: effectiveRoles,
    user,
  } = useDocRights(frappeConfig, meta, {
    roles,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `owner` is an untyped doc field; only a string names a user
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
      return layoutFields;
    }
    const doc = asDocValues({ ...localDoc, __islocal: isCreate ? 1 : 0 });
    if (user !== undefined && user !== '') {
      doc.__session_user = user;
    }
    return buildFormTabs({
      fields: layoutFields,
      doc,
      docstatus,
      formReadOnly,
      isCreate,
      detailsLabel: t('Details'),
      permLevels,
      hiddenFields: hideFields,
      hiddenSections: hideSections,
    });
  }, [layoutFields, localDoc, isCreate, user, docstatus, formReadOnly, permLevels, hideFields, hideSections, t]);

  // Reset per-document state when the target document changes.
  useEffect(() => {
    everLoadedRef.current = false;
    if (name !== undefined && name !== '') {
      createDraftRef.current = null;
    }
    createSeededRef.current = null;
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- resets per-record state when the open record changes; deriving it would need keyed remounts the host controls
    setWasDeleted(false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- see the reset above
    setConflictFields([]);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- see the reset above
    setSaveConflict(false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- see the reset above
    setDocError(null);
    const seed = seedRef.current;
    setBaselineDoc(seed);
    if (seed) {
      setLocalDoc(seed);
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- doctype/name are the reset trigger: the effect runs once per opened record
  }, [doctype, name]);

  // Immediate honest deleted state: the live app emits doc_deleted for the
  // open doc's doctype room; the eviction branch below is the durable fallback.
  useFrappeDoctypeEvents(
    isCreate ? undefined : frappeConfig,
    doctype,
    (event) => {
      if (event.type !== 'doc_deleted') {
        return;
      }
      // SAFETY: doc_deleted payloads carry the deleted record's `name`; an absent one simply fails the match
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
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
    const incomingDoc = liveDoc?.data;
    if (incomingDoc) {
      const incoming = asDocValues(incomingDoc);
      everLoadedRef.current = true;
      // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- syncs external live-query updates into local form state
      setWasDeleted(false);
      const baselineDocNow = baselineRef.current;
      if (!baselineDocNow) {
        setBaselineDoc(incomingDoc);
        setLocalDoc(incomingDoc);
        return;
      }
      const baseline = asDocValues(baselineDocNow);
      const local = asDocValues(localDocRef.current);
      const merged = { ...incoming };
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
      setBaselineDoc(incomingDoc);
      setLocalDoc(asPartialDoc<TDoc>(merged));
      if (newConflicts.length > 0) {
        setConflictFields((prev) => [...new Set([...prev, ...newConflicts])]);
      }
    } else if (name !== undefined && name !== '' && everLoadedRef.current && liveDoc?.isLoading !== true) {
      // The doc was live and is now gone from the subscription: deleted on
      // the server (doc_deleted event, CDC tombstone, or 404 eviction).
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- the live subscription dropping the record is an external event, not a prop
      setWasDeleted(true);
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- doctype re-runs the merge when the open record's doctype changes
  }, [liveDoc?.data, liveDoc?.isLoading, doctype, name]);

  // A new record starts from the doctype's defaults (desk create_new), the
  // stashed draft (?d=, Duplicate, Amend) over them. Meta or the session user
  // arriving later fills in what they add without touching typed values.
  useEffect(() => {
    if (name !== undefined && name !== '') {
      return;
    }
    if (createDraftRef.current?.doctype !== doctype) {
      createDraftRef.current = { doctype, values: takeCreatePrefill(doctype) };
    }
    const draft = createDraftRef.current.values;
    const defaults = meta ? buildCreateDefaults(meta.fields, user) : {};
    const fresh = createSeededRef.current !== doctype;
    createSeededRef.current = doctype;
    setLocalDoc((prev) => {
      const next = { ...defaults, ...draft };
      if (!fresh) {
        Object.assign(next, prev);
      }
      next.doctype = doctype;
      return asPartialDoc<TDoc>(next);
    });
  }, [name, doctype, meta, user]);

  const dirtyFields = useMemo(
    () => computeDirtyFields(asDocValues(localDoc), baselineDoc === undefined ? undefined : asDocValues(baselineDoc)),
    [localDoc, baselineDoc],
  );
  const isDirty = dirtyFields.length > 0;

  // fetch_from preview: a changed Link pulls its dependent columns off the
  // linked doc (validate_link on a bench, the fixture corpus otherwise) and
  // patches the targets; clearing the link blanks them.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a Link field's new value, as typed into the form
  const runFetchFrom = (field: string, value: unknown) => {
    const rules = fetchMap?.get(field);
    if (!rules || rules.length === 0 || !frappeConfig) {
      return;
    }
    const applyPatch = (fetched: DocValues) => {
      setLocalDoc((prev) => {
        const current = asDocValues(prev);
        if (current[field] !== value) {
          return prev;
        }
        const patch = applyFetchedValues(rules, fetched, current);
        return Object.keys(patch).length > 0 ? asPartialDoc<TDoc>({ ...current, ...patch }) : prev;
      });
    };
    if (isEmptyValue(value)) {
      applyPatch({});
      return;
    }
    const linkField = meta?.fields.find((metaField) => metaField.fieldname === field);
    const targetDoctype = linkField?.options ?? '';
    if (!targetDoctype) {
      return;
    }
    const sources = [...new Set(rules.map((rule) => rule.source))];
    const { fixtures } = frappeConfig;
    const linkName = String(value);
    const fetchLinked = async (): Promise<DocValues> => {
      if (fixtures) {
        return asDocValues((await fixtures.getDoc(targetDoctype, linkName, sources)) ?? {});
      }
      return await validateLink(createHttpClient(frappeConfig), targetDoctype, linkName, sources);
    };
    const applyLinked = async () => {
      try {
        applyPatch(await fetchLinked());
      } catch {
        // Safe to continue: an unknown link leaves the targets as they are; the server re-validates on save.
      }
    };
    void applyLinked();
  };

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a field's value type depends on the doctype's meta, known only at runtime
  const setValue = (field: keyof TDoc | string, value: unknown) => {
    setLocalDoc((prev) => ({
      ...prev,
      [field]: value,
    }));
    setErrors((prev) => {
      const key = String(field);
      if (!(key in prev)) {
        return prev;
      }
      return Object.fromEntries(Object.entries(prev).filter(([errorField]) => errorField !== key));
    });
    runFetchFrom(String(field), value);
  };

  // Required = what the engine resolved: required or a truthy
  // mandatory_depends_on, on fields that are actually laid out (depends_on,
  // permlevel and host-hidden fields never reach the tabs).
  const validate = () => {
    if (!tabs) {
      return {};
    }
    const validationErrors: FieldErrors = {};
    const doc = asDocValues(localDoc);
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
      if (name !== undefined && name !== '') {
        if (!docCollection) {
          return undefined;
        }
        // Write only the dirty fields through the optimistic mutation path;
        // clean fields stay untouched so concurrent server edits survive.
        if (dirtyFields.length > 0) {
          const local = asDocValues(localDoc);
          const tx = docCollection.update(name, (draft) => {
            const target = asDocValues(draft);
            for (const key of dirtyFields) {
              target[key] = local[key];
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
      const temporaryName = localDoc.name ?? `new-${Date.now()}`;
      // SAFETY: the insert carries every field the form holds plus doctype and name; the server fills and validates the rest
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const docToInsert = { ...localDoc, doctype, name: temporaryName } as TDoc;
      const tx = collection.insert(docToInsert);
      await tx.isPersisted.promise;
      return getFrappeSyncModule(frappeConfig)?.createdName(temporaryName) ?? temporaryName;
    } catch (error: unknown) {
      if (isConflictError(error)) {
        setSaveConflict(true);
      }
      setErrors(
        saveErrorsFor(error, { validation: t('Validation error occurred'), failed: t('Failed to save document') }),
      );
      return undefined;
      // oxlint-disable-next-line react/todo -- React Compiler cannot lower try/finally yet; this hook runs uncompiled
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    if (baselineDoc) {
      setLocalDoc(baselineDoc);
    } else if (liveDoc?.data) {
      setLocalDoc(liveDoc.data);
    } else {
      setLocalDoc(asPartialDoc<TDoc>({ doctype }));
    }
    setConflictFields([]);
    setSaveConflict(false);
    setErrors({});
  };

  const remove = async (): Promise<boolean> => {
    if (!docCollection || name === undefined || name === '') {
      return false;
    }
    if (wasDeleted || !rights.delete) {
      return false;
    }
    setIsSubmitting(true);
    setErrors({});
    try {
      const tx = docCollection.delete(name);
      await tx.isPersisted.promise;
      return true;
    } catch (error) {
      // SAFETY: optional read of `message`; thrown values without one (or with an empty one) fall back below
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      setErrors({ general: (error as Error)?.message || t('Failed to delete') });
      return false;
      // oxlint-disable-next-line react/todo -- React Compiler cannot lower try/finally yet; this hook runs uncompiled
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit and Cancel write docstatus through the collection that owns the
  // doc: the server's save runs the transition (0 → 1 submits, 1 → 2
  // cancels) under the same OCC as any other edit.
  const transitionDocstatus = async (to: 1 | 2, failure: string): Promise<boolean> => {
    if (!docCollection || name === undefined || name === '') {
      return false;
    }
    if (wasDeleted || !rights[to === 1 ? 'submit' : 'cancel']) {
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
        asDocValues(draft).docstatus = to;
      });
      await tx.isPersisted.promise;
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        setSaveConflict(true);
      }
      setErrors({ general: extractServerError(error, failure) });
      return false;
      // oxlint-disable-next-line react/todo -- React Compiler cannot lower try/finally yet; this hook runs uncompiled
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDocument = async () => await transitionDocstatus(1, t('Failed to submit'));
  const cancelDocument = async () => await transitionDocstatus(2, t('Failed to cancel'));

  const amend = (): Partial<TDoc> | undefined => {
    if (!meta || name === undefined || name === '' || !rights.amend) {
      return undefined;
    }
    const draft = buildAmendValues(meta.fields, asDocValues(localDoc), name);
    setCreatePrefill(doctype, draft);
    return asPartialDoc<TDoc>(draft);
  };

  const duplicate = (): DocValues | undefined => {
    if (!meta) {
      return undefined;
    }
    const values = buildCopyValues(meta.fields, asDocValues(localDoc));
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
  const status = formStatus({
    hasName: !isCreate,
    wasDeleted,
    hasError: docError !== null,
    hasData: Boolean(liveDoc?.data),
    isDocReading,
    showsSeed,
  });

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
    readOnly: disabled || wasDeleted || formReadOnly || !canWrite,
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
};
