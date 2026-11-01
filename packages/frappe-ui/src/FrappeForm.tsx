import { ArrowLeftIcon } from '@phosphor-icons/react';
import { dialog } from '@repo/desktop';
import { Button, Input, formCommonColors } from '@repo/forms';
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import type { DocTypeMeta, FormSection } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, AsyncSkeleton, DetailPageLayout, EmptyState, PageHeader, Tabs } from '@repo/ui';
import type { TabsItem } from '@repo/ui';
import type { TFunction } from 'i18next';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';

import { Timeline } from './components/timeline';
import type { FieldSchema } from './field-registry';
import type { HeadingLevel } from './fields/Heading';
import {
  canDeleteDoc,
  canEditDoc,
  isAmendable,
  resolveDocAction,
  resolveDocIndicator,
} from './formEngine/doc-lifecycle';
import type { FormTab } from './formEngine/form-layout';
import { FormSidebar } from './FormSidebar';
import type { SidebarSection, SidebarMetadataEntry } from './FormSidebar';
import { connectionFields, connectionsFromMeta } from './frappe-connections';
import type { FrappeConnection } from './frappe-connections';
import { frappeRouteHref, frappeRouteTarget, useFrappeRouter } from './frappe-navigation';
import type { FrappeRouteTarget } from './frappe-navigation';
import { FrappeFormActions } from './FrappeFormActions';
import { FrappeFormConnections } from './FrappeFormConnections';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import { isPermissionError } from './live-errors';
import { fieldsFromRecord } from './record-shape';
import { SchemaForm } from './schemaForm';
import type { FieldOverride, SchemaFormProps } from './schemaForm';
import { useFrappeForm } from './use-frappe-form';
import type { FrappeFormController } from './use-frappe-form';
import type { UseFrappeRowsOptions } from './use-frappe-rows';

/** Linked rows per connection doctype, as the render prop receives them. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a linked row carries whatever fields its doctype declares
export type FrappeConnectionRows = Record<string, Record<string, unknown>[]>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a linked row carries whatever fields its doctype declares
type ConnectionRow = Record<string, unknown> & { name: string; doctype: string };

/** Live-read options for one connection's rows of record `name`. */
const connectionReadOptions = (link: FrappeConnection, name: string): UseFrappeRowsOptions<ConnectionRow> => ({
  fields: connectionFields(link),
  filters: [[link.fieldname, '=', name]],
  limit: link.limit ?? 0,
});

export interface FrappeFormProps<TDoc extends { name: string; doctype: string }> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- passed through untouched to the sync engine's own options
  syncOptions?: Record<string, unknown>;
  doctype: string;
  name?: string;
  fields?: readonly (keyof TDoc & string)[];
  /** Render-prop children. When provided, schema-driven mode is bypassed. */
  children?: (props: {
    doc: Partial<TDoc>;
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a field's value type depends on its meta fieldtype
    setValue: (field: keyof TDoc, value: unknown) => void;
    isSubmitting: boolean;
    errors: Record<string, string>;
    meta?: DocTypeMeta;
    /** True when the form is read-only (disabled prop, or doc deleted on the server). */
    disabled: boolean;
    /** The record's linked rows per connection doctype (edit mode), live. */
    connections: FrappeConnectionRows;
    /** A connection's rows are still being read. */
    connectionsLoading: boolean;
  }) => React.ReactNode;
  /**
   * Doctypes linking back to this one (the desk's Connections). Defaults to
   * meta.links; declare them where the reader cannot load meta (Guest).
   * Schema mode shows them on a Connections tab; render-prop mode hands the
   * rows to `children`.
   */
  connections?: readonly FrappeConnection[];
  /** False leaves the Connections tab out of schema mode. */
  showConnections?: boolean;
  /**
   * The document a route loader rendered on the server (`loadDoc`), shown
   * until the live read lands so the server page and the hydrated page match.
   * Ignored unless its name is `name`.
   */
  initialDoc?: Partial<TDoc>;
  /** Replaces the skeleton while the document loads. */
  loadingFallback?: React.ReactNode;
  /** Replaces the not-found message for a name that does not resolve. */
  notFoundFallback?: React.ReactNode;
  /** Replaces the error state when the document cannot be read. */
  errorFallback?: React.ReactNode;
  /** Per-field overrides for schema-driven mode (when children not provided). */
  overrides?: Record<string, FieldOverride>;
  /** Fields to hide in schema-driven mode. */
  hideFields?: string[];
  /** Fields to force read-only in schema-driven mode. */
  readOnlyFields?: string[];
  /** Completely replace the auto-generated layout. */
  sections?: FormSection[];
  /**
   * R2: reorder fields in the meta-derived layout. Listed names permute
   * among their slots; unlisted fields keep their meta positions. Unknown
   * names are ignored. Cheaper than replacing `sections`.
   */
  order?: string[];
  /**
   * Session roles for permlevel resolution. Omitted: the form asks the site
   * for them when the doctype has fields above permlevel 0, and a fixtures
   * connection takes the conservative rule (permlevel > 0 is read-only,
   * never hidden).
   */
  roles?: string[];
  /** Called after a save; a created document carries the name the server gave it. */
  onSave?: (doc: Partial<TDoc>) => void;
  onCancel?: () => void;
  onDelete?: (doc: Partial<TDoc>) => void;
  /**
   * Opens the amended draft of a cancelled document (desk Amend). The draft
   * carries `amended_from` and is also handed to the doctype's next
   * create-mode FrappeForm, so navigating to one is enough. Absent, a
   * cancelled document offers no Amend.
   */
  onAmend?: (draft: Partial<TDoc>) => void;
  /**
   * Given, the form is a read-only view of the record: its toolbar offers
   * Edit (this callback) instead of Save and Cancel, beside Delete and the
   * document's Submit, Cancel or Amend. A document with nothing left to
   * edit (cancelled, or submitted without allow_on_submit fields) shows no Edit.
   */
  onEdit?: () => void;
  /**
   * The path the doctype's pages live under (`/moves`). Given, the form is
   * the doctype's record page: it reads the record from the path through
   * the FrappeProvider's navigation (`route/new` creates, `route/<name>`
   * views, `route/<name>/edit` edits), carries the detail page template,
   * and after a save, cancel, edit or delete moves to the matching page;
   * Amend opens the amended draft on `route/new`. Callbacks given alongside
   * it replace those moves.
   */
  route?: string;
  showToolbar?: boolean;
  showSidebar?: boolean;
  showTimeline?: boolean;
  disabled?: boolean;
  /**
   * Semantic level for schema section headings (DG-A11Y-02). Defaults to 2
   * via SchemaForm — sections sit one step below the page h1.
   */
  sectionHeadingLevel?: HeadingLevel;
  /**
   * The form's state, owned by the caller (`useFrappeForm`). Given, the form
   * renders from it instead of holding its own, so a page can build its
   * chrome on the same controller: turn the form's toolbar, sidebar,
   * timeline and banners off and render them from `form` instead.
   */
  form?: FrappeFormController<TDoc>;
  /** Section or Tab Breaks to hide, by fieldname or label. */
  hideSections?: string[];
  /** False leaves the deleted and changed-elsewhere banners to the host. */
  showBanners?: boolean;
  /** Host tabs after the form's own (and its Connections tab). */
  extraTabs?: TabsItem[];
  /** Wraps each rendered field, e.g. in an error boundary. */
  renderFieldWrapper?: SchemaFormProps['renderFieldWrapper'];
  /** Wraps each laid-out tab's body. */
  renderTab?: (tab: FormTab, content: React.ReactNode) => React.ReactNode;
}

/**
 * A record's own fields as read-only schema fields, for a reader without meta
 * (LC-96).
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a record read without meta has no declared field types
const schemaFieldsFromRecord = (doc: Record<string, unknown>): FieldSchema[] =>
  fieldsFromRecord(doc).map((field) => ({
    name: field.fieldname,
    label: field.label,
    type: field.fieldtype,
    readOnly: true,
  }));

// ---------------------------------------------------------------------------
// Sidebar Mappers
// ---------------------------------------------------------------------------

/** DocShare row shape used for the live "Shared With" sidebar section. */
export interface DocShareRow {
  name: string;
  doctype: string;
  user?: string;
  everyone?: number | boolean;
  read?: number | boolean;
  write?: number | boolean;
  share?: number | boolean;
}

/**
 * Assignment row shape for the live "Assigned To" sidebar section: the open
 * assignment documents referencing the form's document. Assignments must be read
 * from these rows (not the doc's `_assign` mirror) to be live — frappe
 * writes `_assign` with `update_modified=False` and no realtime event, so
 * the mirror is invisible to both the realtime channel and the CDC feed,
 * while the assignment ToDos themselves emit ordinary list_update events.
 */
export interface AssignmentTodoRow {
  name: string;
  doctype: string;
  allocated_to?: string;
  status?: string;
  reference_type?: string;
  reference_name?: string;
}

/**
 * Resolves a Frappe file field value (e.g. `/files/x.png`) to a full URL.
 * A site-relative path needs a server to hang off, so it resolves to nothing
 * on a fixtures-only host (no baseURL); absolute URLs still pass through.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- takes a raw doc field of any fieldtype; only strings are file paths
export const resolveFileUrl = (value: unknown, baseURL: string | undefined): string | undefined => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the field value is untyped; a non-string is never a file path
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return baseURL !== undefined && baseURL !== '' ? `${baseURL.replace(/\/$/u, '')}${value}` : undefined;
  }
  return value;
};

/** A DocShare flag is granted when set to true or a non-zero number. */
const isGranted = (flag: number | boolean | undefined): boolean => flag !== undefined && flag !== false && flag !== 0;

/** A share's access sublabel: edit beats view; neither leaves it off. */
const shareAccessLabel = (share: DocShareRow, t: TFunction): string | undefined => {
  if (isGranted(share.write)) {
    return t('Can edit');
  }
  if (isGranted(share.read)) {
    return t('Can view');
  }
  return undefined;
};

/** A doc bookkeeping value worth showing: set and non-empty. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- takes raw doc bookkeeping fields, untyped in the doc record
const isPresent = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/**
 * Builds the live sidebar sections (assignments from the open assignment
 * ToDos, shares from the DocShare live query). Both inputs come from live
 * subscriptions, so external assignment/share changes re-render in place.
 *
 * `assignments === undefined` means no live assignment subscription exists
 * (fixture mode) — the doc's `_assign` mirror is parsed as the fallback.
 * When the subscription exists its rows are authoritative, even when empty
 * (the `_assign` mirror can lag behind removals).
 */
export const buildSidebarSections = (
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- reads only the doc's `_assign` mirror; other fields pass by
  doc: Record<string, unknown>,
  shares: DocShareRow[] | undefined,
  t: TFunction,
  assignments?: AssignmentTodoRow[],
): SidebarSection[] => {
  const sections: SidebarSection[] = [];

  // Assignments section (live via the referencing assignment ToDos)
  let assignees: string[] = [];
  if (assignments) {
    assignees = assignments.map((row) => row.allocated_to).filter((user): user is string => Boolean(user));
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `_assign` is untyped doc data; only a string can hold the JSON list
  } else if (typeof doc._assign === 'string' && doc._assign !== '') {
    try {
      // SAFETY: frappe writes `_assign` as a JSON array of user ids
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      assignees = JSON.parse(doc._assign) as string[];
    } catch {
      // Safe to continue: a malformed `_assign` mirror leaves the section empty
    }
  }
  sections.push({
    key: 'assignments',
    title: t('Assigned To'),
    items: assignees.map((email: string) => ({
      id: email,
      label: email,
    })),
    emptyText: t('No one assigned'),
  });

  // Shares section (live via the DocShare collection)
  if (shares) {
    sections.push({
      key: 'shares',
      title: t('Shared With'),
      items: shares.map((share) => ({
        id: share.name,
        label: isGranted(share.everyone) ? t('Everyone') : (share.user ?? share.name),
        sublabel: shareAccessLabel(share, t),
      })),
      emptyText: t('Not shared'),
    });
  }

  return sections;
};

/**
 * Maps a Frappe document to generic SidebarMetadataEntry[] for FormSidebar.
 */
export const mapDocToSidebarMetadata = (
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- reads only the bookkeeping fields every doc carries
  doc: Record<string, unknown>,
  t: TFunction,
): SidebarMetadataEntry[] => {
  const metadata: SidebarMetadataEntry[] = [];

  if (isPresent(doc.owner)) {
    metadata.push({ label: t('Created by {{user}}', { user: doc.owner }) });
  }
  if (isPresent(doc.modified_by)) {
    metadata.push({ label: t('Modified by {{user}}', { user: doc.modified_by }) });
  }
  if (isPresent(doc.creation)) {
    metadata.push({ label: t('Created on {{date}}', { date: doc.creation }) });
  }

  return metadata;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type FrappeFormBodyProps<TDoc extends { name: string; doctype: string }> = Omit<FrappeFormProps<TDoc>, 'route'> & {
  /** Routed page: the detail template, with a back action to the list. */
  routePage?: { onBack: () => void };
};

// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component, typescript/promise-function-async -- one render per form state over a shared controller; ReactNode's union includes Promise, nothing here is async
const FrappeFormView = <TDoc extends { name: string; doctype: string }>({
  form,
  doctype,
  name,
  children,
  overrides,
  readOnlyFields,
  order,
  onSave,
  onCancel,
  onDelete,
  onAmend,
  onEdit,
  showToolbar = true,
  showSidebar = true,
  showTimeline = true,
  showBanners = true,
  disabled = false,
  sectionHeadingLevel,
  connections,
  showConnections = true,
  extraTabs,
  renderFieldWrapper,
  renderTab,
  loadingFallback,
  notFoundFallback,
  errorFallback,
  routePage,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- one early return per form state; the branches read top to bottom like desk's form states
}: FrappeFormBodyProps<TDoc> & { form: FrappeFormController<TDoc> }) => {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const {
    meta,
    metaLoading: isMetaLoading,
    metaError,
    doc: localDoc,
    baseline: baselineDoc,
    setValue,
    errors,
    isSubmitting,
    docstatus,
    isSubmittable,
    rights,
    rightsPending,
    canWrite: canWriteRecord,
    wasDeleted,
    conflictFields,
    docError,
    tabs: formTabs,
    promptNamed,
    activeTab,
    setActiveTab,
    amendedAs,
  } = form;
  const frappeConfig = form.connection;
  const hasName = name !== undefined && name !== '';
  const isCreate = !hasName;
  // SAFETY: a doc is a plain record of its fields; meta addresses them by fieldname
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above; field types come from meta at runtime
  const docRecord = localDoc as Record<string, unknown>;
  const hasUnsavedChanges = form.isDirty;
  // Meta is permission-gated (Guest gets 403) while the record may still be
  // readable: the form then lays the record's own fields out, read-only.
  const readsWithoutMeta = !children && !meta && Boolean(metaError) && Boolean(name);
  const recordTabs = useMemo((): FormTab[] | undefined => {
    if (!readsWithoutMeta || !baselineDoc) {
      return undefined;
    }
    // SAFETY: a doc is a plain record of its fields
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above; no meta declares the field types
    const recordFields = schemaFieldsFromRecord(baselineDoc as Record<string, unknown>);
    return [
      {
        key: '__details',
        label: t('Details'),
        schema: { sections: [{ columns: [{ fields: recordFields }] }], fields: recordFields },
      },
    ];
  }, [readsWithoutMeta, baselineDoc, t]);

  // Live "Assigned To" rows: the open assignment ToDos referencing this doc.
  // The doc's own `_assign` mirror is written silently (update_modified=False,
  // no event) and can't update live; the assignment ToDos emit ordinary
  // insert/update events, so their name-filtered subscription is the live
  // source of truth. Fixture mode keeps the `_assign` fallback (no fixture
  // data exists for referencing ToDos), signalled by assignmentRows=undefined.
  const readsAssignments = showSidebar && hasName && frappeConfig !== undefined && !frappeConfig.fixtures;
  const assignmentCollection = useFrappeCollection<AssignmentTodoRow>(
    readsAssignments ? frappeConfig : undefined,
    'ToDo',
    {
      fields: ['name', 'allocated_to', 'status', 'reference_type', 'reference_name'],
      filters: { reference_type: doctype, reference_name: name, status: 'Open' },
    },
  );
  const { data: rawAssignmentRows } = useLiveQuery(
    (q) => (assignmentCollection ? q.from({ _assignment: assignmentCollection }) : null),
    [assignmentCollection],
  );
  const assignmentRows = useMemo(
    // SAFETY: the live query reads the assignment collection typed AssignmentTodoRow above
    () => (assignmentCollection ? ((rawAssignmentRows as AssignmentTodoRow[] | undefined) ?? []) : undefined),
    [assignmentCollection, rawAssignmentRows],
  );

  const effectiveConnections = useMemo(() => connections ?? connectionsFromMeta(meta), [connections, meta]);
  const readsConnections = Boolean(children) && Boolean(name) && effectiveConnections.length > 0;
  const [connectionSnapshots, setConnectionSnapshots] = useState<Record<string, FrappeRowsSnapshot<ConnectionRow>>>({});
  // oxlint-disable-next-line react-doctor/no-reset-all-state-on-prop-change -- drops the previous record's connection rows when the record changes
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change -- see the reset note above
    setConnectionSnapshots({});
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- doctype and name are the reset trigger, not inputs
  }, [doctype, name]);
  const connectionReads = useMemo(
    () =>
      readsConnections && hasName
        ? effectiveConnections.map((link) => ({
            link,
            options: connectionReadOptions(link, name),
            onChange: (snapshot: FrappeRowsSnapshot<ConnectionRow>) => {
              // oxlint-disable-next-line sonarjs/no-nested-functions -- each connection's reporter closes over its own link
              setConnectionSnapshots((prev) => ({ ...prev, [link.doctype]: snapshot }));
            },
          }))
        : [],
    [readsConnections, hasName, effectiveConnections, name],
  );
  const connectionRows = useMemo(() => {
    const rows: FrappeConnectionRows = {};
    for (const { link } of connectionReads) {
      rows[link.doctype] = connectionSnapshots[link.doctype]?.rows ?? [];
    }
    return rows;
  }, [connectionReads, connectionSnapshots]);
  const connectionsLoading = connectionReads.some(({ link }) => connectionSnapshots[link.doctype]?.isLoading ?? true);

  const handleSave = async () => {
    const saved = await form.save();
    if (saved === undefined || saved === '') {
      return;
    }
    onSave?.(isCreate ? { ...localDoc, name: saved } : localDoc);
  };

  const handleCancel = () => {
    form.reset();
    onCancel?.();
  };

  const handleDelete = async () => {
    if (!hasName || wasDeleted || !rights.delete) {
      return;
    }
    if (!(await dialog.confirm(t('Delete this {{doctype}}?', { doctype })))) {
      return;
    }
    if (await form.remove()) {
      onDelete?.(localDoc);
    }
  };

  const handleSubmitDocument = async () => {
    if (!hasName || wasDeleted || !rights.submit) {
      return;
    }
    const requiredErrors = form.validate();
    if (Object.keys(requiredErrors).length > 0) {
      form.setErrors(requiredErrors);
      return;
    }
    if (!(await dialog.confirm(t('Permanently Submit {{name}}?', { name })))) {
      return;
    }
    await form.submitDocument();
  };

  const handleCancelDocument = async () => {
    if (!hasName || wasDeleted || !rights.cancel) {
      return;
    }
    if (!(await dialog.confirm(t('Permanently Cancel {{name}}?', { name })))) {
      return;
    }
    await form.cancelDocument();
  };

  const handleAmend = () => {
    if (!onAmend) {
      return;
    }
    const draft = form.amend();
    if (draft) {
      onAmend(draft);
    }
  };

  const titleField = meta?.title_field;
  const titleValue = titleField !== undefined && titleField !== '' ? docRecord[titleField] : undefined;
  // oxlint-disable-next-line typescript/no-base-to-string -- title_field names a scalar Data/Link field; String() renders it as desk does
  const pageTitle = isCreate ? t('New {{doctype}}', { doctype }) : String(titleValue ?? name);
  // oxlint-disable-next-line typescript/promise-function-async -- ReactNode's union includes Promise; this returns JSX synchronously
  const frame = (content: React.ReactNode, aside?: React.ReactNode) =>
    routePage ? (
      // flexBasis auto: see DeskFormPage (react-native-web's min-height:0
      // reset would cap the scroll page at viewport height).
      <DetailPageLayout
        flexBasis="auto"
        toolbarLeading={
          <Button
            size="$3"
            chromeless
            icon={ArrowLeftIcon}
            // oxlint-disable-next-line react/jsx-handler-names -- forwards the routed page's own onBack callback
            onPress={routePage.onBack}
            aria-label={t('Back to {{doctype}} list', { doctype })}>
            {doctype}
          </Button>
        }
        header={
          <PageHeader
            title={pageTitle}
            divider={false}
          />
        }
        aside={aside}>
        {content}
      </DetailPageLayout>
    ) : (
      content
    );

  // Schema-driven mode needs meta; render-prop mode can proceed without it.
  if (!children && isMetaLoading && !meta) {
    return frame(
      <YStack
        {...knobProps.panelPadding}
        testID="frappe-form-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>,
    );
  }

  if (!children && isCreate && meta && rightsPending) {
    return frame(
      <YStack
        {...knobProps.panelPadding}
        testID="frappe-form-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>,
    );
  }

  if (!children && isCreate && meta && !rights.create) {
    return frame(
      <EmptyState
        testID="frappe-form-not-permitted"
        title={t("You can't create {{doctype}}", { doctype })}
        description={t("Your roles don't grant creating a {{doctype}}.", { doctype })}
      />,
    );
  }

  if (!children && metaError && !meta && !hasName) {
    return frame(
      isPermissionError(metaError) ? (
        <EmptyState
          testID="frappe-form-not-permitted"
          title={t("You can't create {{doctype}}", { doctype })}
          description={metaError.message}
        />
      ) : (
        <AsyncBoundary
          {...knobProps.panelPadding}
          error={metaError}
          errorTitle={t('Failed to load {{doctype}} form', { doctype })}
        />
      ),
    );
  }

  if (hasName && form.status === 'error' && docError) {
    if (errorFallback !== undefined) {
      return frame(errorFallback);
    }
    if (isPermissionError(docError)) {
      return frame(
        <EmptyState
          testID="frappe-form-not-permitted"
          title={t("You can't open {{doctype}} {{name}}", { doctype, name })}
          description={t("Your session can't read this {{doctype}}.", { doctype })}
        />,
      );
    }
    return frame(
      <AsyncBoundary
        {...knobProps.panelPadding}
        error={docError}
        errorTitle={t('Failed to load {{doctype}}', { doctype })}
      />,
    );
  }

  if (hasName && form.status === 'loading') {
    if (loadingFallback !== undefined) {
      return frame(loadingFallback);
    }
    return frame(
      <YStack
        {...knobProps.panelPadding}
        testID="frappe-form-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>,
    );
  }

  // Never-loaded miss (bad name, or read denied) — distinct from the
  // deleted-while-open state below, which keeps the form mounted.
  if (hasName && form.status === 'notFound') {
    if (notFoundFallback !== undefined) {
      return frame(notFoundFallback);
    }
    return frame(
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        {...knobProps.gap}>
        <Text
          color={formCommonColors.error}
          {...knobProps.body}>
          {t('{{doctype}} not found', { doctype })}
        </Text>
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('Document {{name}} does not exist or could not be loaded.', { name })}
        </Text>
      </YStack>,
    );
  }

  const effectiveDisabled = disabled || wasDeleted;
  const readOnlyView = Boolean(onEdit) || readsWithoutMeta;
  const fieldsDisabled = effectiveDisabled || readOnlyView || !canWriteRecord;
  const indicator = resolveDocIndicator({
    docstatus,
    isCreate,
    isDirty: hasUnsavedChanges && !onEdit,
    isSubmittable,
  });
  const docAction = resolveDocAction({
    docstatus,
    isCreate,
    isDirty: hasUnsavedChanges,
    isSubmittable,
    perms: {
      write: canWriteRecord,
      submit: rights.submit,
      cancel: rights.cancel,
      amend: rights.amend,
    },
    isReadOnlyView: Boolean(onEdit),
  });
  const canDelete = !wasDeleted && rights.delete && canDeleteDoc(docstatus);
  const showDelete = Boolean(hasName && onDelete && canDelete);
  const showEdit = Boolean(onEdit && rights.write && canEditDoc(docstatus, meta));
  const showAmend = Boolean(onAmend && isAmendable(meta));
  const showClose = !onEdit && Boolean(onCancel);
  const hasLifecycleState = indicator !== undefined || docAction !== undefined;
  const hasToolbarActions = hasLifecycleState || showDelete || showEdit || showClose;
  const toolbarShown = showToolbar && !readsWithoutMeta && hasToolbarActions;
  const shownTabs = formTabs ?? recordTabs;
  const imageFieldName = meta?.image_field;
  const sidebarImageUrl =
    imageFieldName !== undefined && imageFieldName !== ''
      ? resolveFileUrl(docRecord[imageFieldName], frappeConfig?.baseURL)
      : undefined;
  const conflictLabels = conflictFields
    .map((fieldname) => {
      const field = meta?.fields.find((metaField) => metaField.fieldname === fieldname);
      return field?.label ?? fieldname;
    })
    .join(', ');

  const showConnectionsTab =
    showConnections && hasName && frappeConfig !== undefined && effectiveConnections.length > 0;
  const formTabItems: TabsItem[] = (shownTabs ?? []).map((tab) => {
    const content = (
      <SchemaForm
        schema={tab.schema}
        doc={docRecord}
        setValue={(field, value) => {
          // SAFETY: SchemaForm reports fieldnames from tab.schema, which the form laid out from TDoc's meta
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          setValue(field as keyof TDoc, value);
        }}
        errors={errors}
        disabled={fieldsDisabled}
        overrides={overrides}
        readOnlyFields={readOnlyFields}
        sectionHeadingLevel={sectionHeadingLevel}
        order={order}
        renderFieldWrapper={renderFieldWrapper}
      />
    );
    return {
      value: tab.key,
      label: tab.label,
      content: renderTab ? renderTab(tab, content) : content,
    };
  });
  const tabItems: TabsItem[] = [
    ...formTabItems,
    ...(showConnectionsTab
      ? [
          {
            value: '__connections',
            label: t('Connections'),
            content: (
              <FrappeFormConnections
                connection={frappeConfig}
                connections={effectiveConnections}
                name={name}
              />
            ),
          },
        ]
      : []),
    ...(extraTabs ?? []),
  ];
  const hasActiveTab = activeTab !== undefined && activeTab !== '' && tabItems.some((tab) => tab.value === activeTab);
  const effectiveTab = hasActiveTab ? activeTab : tabItems[0]?.value;
  const sidebar =
    showSidebar && hasName && meta ? (
      <FormSidebar
        imageUrl={sidebarImageUrl}
        sections={buildSidebarSections(
          docRecord,
          // SAFETY: the form reads DocShare rows whole; DocShareGrant is the permission subset of the same rows
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          form.shareRows as DocShareRow[] | undefined,
          t,
          assignmentRows,
        )}
        metadata={mapDocToSidebarMetadata(docRecord, t)}
      />
    ) : undefined;

  let formBody: React.ReactNode;
  if (children) {
    // Render-prop mode
    formBody = children({
      doc: localDoc,
      setValue,
      isSubmitting,
      errors,
      meta,
      disabled: fieldsDisabled,
      connections: connectionRows,
      connectionsLoading,
    });
  } else if (shownTabs) {
    formBody = (
      <YStack {...knobProps.gapLg}>
        {promptNamed && (
          <Input
            label={t('Name')}
            value={localDoc.name ?? ''}
            onChangeText={(value) => {
              setValue('name', value);
            }}
            placeholder={t('New document name')}
            error={errors.name}
            disabled={effectiveDisabled || !canWriteRecord}
          />
        )}
        {tabItems.length > 1 ? (
          <Tabs
            items={tabItems}
            value={effectiveTab}
            onChange={setActiveTab}
            lazyMount
          />
        ) : (
          (tabItems[0]?.content ?? null)
        )}
      </YStack>
    );
  } else {
    // Metadata unavailable (should be covered by metaError branch above)
    formBody = (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center">
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('Form schema unavailable')}
        </Text>
      </YStack>
    );
  }

  return frame(
    // flexBasis auto (not the flex:1 shorthand's 0%): inside scroll-flow page
    // scaffolds (LC-29 templates) the parent is auto-height, and a 0% basis
    // collapses this stack to zero height on web — content then paints over
    // whatever follows. Bounded parents still fill (grow 1) exactly as before.
    <YStack
      {...knobProps.gapLg}
      flexGrow={1}
      flexShrink={1}
      flexBasis="auto">
      {frappeConfig ? <FrappeReconnectIndicator config={frappeConfig} /> : null}
      {frappeConfig
        ? connectionReads.map((read) => (
            <FrappeRowsReader
              key={read.link.doctype}
              connection={frappeConfig}
              doctype={read.link.doctype}
              options={read.options}
              // oxlint-disable-next-line react/jsx-handler-names -- forwards the connection read's own reporter
              onChange={read.onChange}
            />
          ))
        : null}

      {showBanners && wasDeleted && (
        <XStack
          role="alert"
          alignItems="center"
          {...knobProps.containerRadius}
          {...knobProps.panelPadding}
          backgroundColor="$red3"
          testID="frappe-form-deleted-banner">
          <Text
            color={formCommonColors.error}
            {...knobProps.body}>
            {hasUnsavedChanges
              ? t(
                  'This {{doctype}} was deleted on the server. Fields are read-only and your unsaved edits can no longer be saved.',
                  { doctype },
                )
              : t('This {{doctype}} was deleted on the server. Fields are read-only.', {
                  doctype,
                })}
          </Text>
        </XStack>
      )}

      {showBanners && !wasDeleted && conflictFields.length > 0 && (
        <XStack
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui's XStack renders a div; the role gives it the live-region semantics
          role="status"
          alignItems="center"
          {...knobProps.containerRadius}
          {...knobProps.panelPadding}
          backgroundColor="$orange3"
          testID="frappe-form-conflict-banner">
          <Text
            color="$orange11"
            {...knobProps.body}>
            {t(
              'Changed elsewhere while you were editing: {{fields}}. Your edits are kept — saving will overwrite the newer server values.',
              { fields: conflictLabels },
            )}
          </Text>
        </XStack>
      )}

      {/* flexBasis auto — see the root stack note (zero-height collapse in
          auto-height scroll flows would paint the Timeline over the form). */}
      <XStack
        flexGrow={1}
        flexShrink={1}
        flexBasis="auto"
        {...knobProps.gapLg}>
        {/* Sidebar (edit mode only) — assignments/shares/image are live.
            A routed page carries it in the template's aside instead. */}
        {routePage ? null : sidebar}

        {/* Form body */}
        <YStack
          flex={1}
          {...knobProps.gapLg}>
          {formBody}

          {errors.general && (
            <Text
              color={formCommonColors.error}
              {...knobProps.body}
              role="alert">
              {errors.general}
            </Text>
          )}

          {toolbarShown && (
            <FrappeFormActions
              indicator={indicator}
              action={docAction}
              busy={isSubmitting}
              disabled={effectiveDisabled}
              // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler; the action bar fires it without awaiting
              onSave={handleSave}
              // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler; the action bar fires it without awaiting
              onSubmit={handleSubmitDocument}
              // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler; the action bar fires it without awaiting
              onCancelDocument={handleCancelDocument}
              onAmend={showAmend ? handleAmend : undefined}
              amendedAs={amendedAs}
              // oxlint-disable-next-line typescript/no-misused-promises -- awaitable handler; the action bar fires it without awaiting
              onDelete={showDelete ? handleDelete : undefined}
              onEdit={showEdit ? onEdit : undefined}
              onClose={showClose ? handleCancel : undefined}
              closeDisabled={disabled}
            />
          )}
        </YStack>
      </XStack>

      {/* Timeline (edit mode only) — live Comment/Version via useFrappeCollection */}
      {showTimeline && hasName && !readsWithoutMeta && (
        <Timeline
          doctype={doctype}
          docname={name}
          label={t('Activity')}
        />
      )}
    </YStack>,
    routePage ? sidebar : undefined,
  );
};

const FrappeFormOwned = <TDoc extends { name: string; doctype: string }>(props: FrappeFormBodyProps<TDoc>) => {
  const config = useFrappeConfig();
  const baseURL = props.baseURL ?? config?.baseURL;
  if (baseURL === undefined || baseURL === '') {
    throw new Error('FrappeForm requires baseURL prop or FrappeProvider with baseURL');
  }
  const form = useFrappeForm<TDoc>({
    doctype: props.doctype,
    name: props.name,
    baseURL: props.baseURL,
    auth: props.auth,
    syncOptions: props.syncOptions,
    fields: props.fields,
    sections: props.sections,
    hideFields: props.hideFields,
    hideSections: props.hideSections,
    roles: props.roles,
    readShares: props.showSidebar ?? true,
    disabled: props.disabled,
    initialDoc: props.initialDoc,
  });
  return (
    <FrappeFormView<TDoc>
      {...props}
      form={form}
    />
  );
};

const FrappeFormBody = <TDoc extends { name: string; doctype: string }>(props: FrappeFormBodyProps<TDoc>) => {
  if (props.form) {
    return (
      <FrappeFormView<TDoc>
        {...props}
        form={props.form}
      />
    );
  }
  return <FrappeFormOwned<TDoc> {...props} />;
};

const FrappeFormRoute = <TDoc extends { name: string; doctype: string }>({
  route,
  name: nameProp,
  onSave,
  onCancel,
  onDelete,
  onEdit,
  onAmend,
  ...props
}: Omit<FrappeFormProps<TDoc>, 'route'> & { route: string }) => {
  const router = useFrappeRouter();
  const fromPath = router ? frappeRouteTarget(route, router.pathname) : undefined;
  let target: FrappeRouteTarget = { mode: 'create' };
  if (nameProp !== undefined && nameProp !== '') {
    target = { mode: fromPath?.mode === 'view' ? 'view' : 'edit', name: nameProp };
  } else if (fromPath?.mode === 'view' || fromPath?.mode === 'edit') {
    target = fromPath;
  }
  const go = (next: FrappeRouteTarget) => router?.navigate(frappeRouteHref(route, next));
  const name = target.mode === 'view' || target.mode === 'edit' ? target.name : undefined;

  return (
    <FrappeFormBody<TDoc>
      {...props}
      // A new target is a new page: no state carries over from the last one.
      key={`${target.mode}:${name ?? ''}`}
      name={name}
      routePage={{ onBack: () => go({ mode: 'list' }) }}
      onEdit={target.mode === 'view' ? (onEdit ?? (() => go({ mode: 'edit', name: target.name }))) : undefined}
      onSave={
        onSave ??
        ((doc) => {
          const saved = doc.name ?? name;
          go(saved !== undefined && saved !== '' ? { mode: 'view', name: saved } : { mode: 'list' });
        })
      }
      onCancel={onCancel ?? (() => go(name !== undefined && name !== '' ? { mode: 'view', name } : { mode: 'list' }))}
      onDelete={onDelete ?? (() => go({ mode: 'list' }))}
      onAmend={onAmend ?? (() => go({ mode: 'create' }))}
    />
  );
};

/**
 * The form for a Frappe doctype, resolved from meta by the desk form engine.
 *
 * Fetches doctype metadata and the document, lays the fields out through
 * `buildFormTabs` (tabs, sections, `depends_on`, `mandatory_depends_on`,
 * `read_only_depends_on`, `collapsible_depends_on`, permlevel,
 * `set_only_once`, `fetch_from` and docstatus), and renders each tab with
 * `SchemaForm`. With a `route` it is the doctype's record page. With neither
 * a bench URL nor a fixture corpus it says Frappe is not configured.
 */
export const FrappeForm = <TDoc extends { name: string; doctype: string }>(props: FrappeFormProps<TDoc>) => {
  const config = useFrappeConfig();
  const { route, ...formProps } = props;
  const baseURL = props.baseURL ?? config?.baseURL;
  if ((baseURL === undefined || baseURL === '') && !config?.fixtures) {
    return (
      <FrappeNotConfigured
        doctype={props.doctype}
        page={route !== undefined}
      />
    );
  }
  if (route === undefined) {
    return <FrappeFormBody<TDoc> {...formProps} />;
  }
  return (
    <FrappeFormRoute<TDoc>
      {...formProps}
      route={route}
    />
  );
};
