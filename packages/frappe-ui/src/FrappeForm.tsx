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
import type { FieldSchema } from './fieldRegistry';
import type { HeadingLevel } from './fields/Heading';
import {
  canDeleteDoc,
  canEditDoc,
  isAmendable,
  resolveDocAction,
  resolveDocIndicator,
} from './formEngine/docLifecycle';
import type { FormTab } from './formEngine/formLayout';
import { FormSidebar } from './FormSidebar';
import type { SidebarSection, SidebarMetadataEntry } from './FormSidebar';
import { connectionFields, connectionsFromMeta } from './frappeConnections';
import type { FrappeConnection } from './frappeConnections';
import { FrappeFormActions } from './FrappeFormActions';
import { FrappeFormConnections } from './FrappeFormConnections';
import { frappeRouteHref, frappeRouteTarget, useFrappeRouter } from './frappeNavigation';
import type { FrappeRouteTarget } from './frappeNavigation';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import { isPermissionError } from './liveErrors';
import { fieldsFromRecord } from './recordShape';
import { SchemaForm } from './schemaForm';
import type { FieldOverride, SchemaFormProps } from './schemaForm';
import { useFrappeForm } from './useFrappeForm';
import type { FrappeFormController } from './useFrappeForm';

/** Linked rows per connection doctype, as the render prop receives them. */
export type FrappeConnectionRows = Record<string, Record<string, unknown>[]>;

export interface FrappeFormProps<TDoc extends { name: string; doctype: string }> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: Record<string, unknown>;
  doctype: string;
  name?: string;
  fields?: readonly (keyof TDoc & string)[];
  /** Render-prop children. When provided, schema-driven mode is bypassed. */
  children?: (props: {
    doc: Partial<TDoc>;
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
function schemaFieldsFromRecord(doc: Record<string, unknown>): FieldSchema[] {
  return fieldsFromRecord(doc).map((field) => ({
    name: field.fieldname,
    label: field.label,
    type: field.fieldtype,
    readOnly: true,
  }));
}

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
 * ToDo documents referencing the form's document. Assignments must be read
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
export function resolveFileUrl(value: unknown, baseURL: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return baseURL ? `${baseURL.replace(/\/$/, '')}${value}` : undefined;
  }
  return value;
}

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
export function buildSidebarSections(
  doc: Record<string, unknown>,
  shares: DocShareRow[] | undefined,
  t: TFunction,
  assignments?: AssignmentTodoRow[],
): SidebarSection[] {
  const sections: SidebarSection[] = [];

  // Assignments section (live via the referencing assignment ToDos)
  let assignees: string[] = [];
  if (assignments) {
    assignees = assignments.map((row) => row.allocated_to).filter((user): user is string => Boolean(user));
  } else if (doc._assign && typeof doc._assign === 'string') {
    try {
      assignees = JSON.parse(doc._assign || '[]') as string[];
    } catch {
      // ignore parse errors
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
        label: share.everyone ? t('Everyone') : (share.user ?? share.name),
        sublabel: share.write ? t('Can edit') : share.read ? t('Can view') : undefined,
      })),
      emptyText: t('Not shared'),
    });
  }

  return sections;
}

/**
 * Maps a Frappe document to generic SidebarMetadataEntry[] for FormSidebar.
 */
export function mapDocToSidebarMetadata(doc: Record<string, unknown>, t: TFunction): SidebarMetadataEntry[] {
  const metadata: SidebarMetadataEntry[] = [];

  if (doc.owner) {
    metadata.push({ label: t('Created by {{user}}', { user: doc.owner }) });
  }
  if (doc.modified_by) {
    metadata.push({ label: t('Modified by {{user}}', { user: doc.modified_by }) });
  }
  if (doc.creation) {
    metadata.push({ label: t('Created on {{date}}', { date: doc.creation }) });
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
export function FrappeForm<TDoc extends { name: string; doctype: string }>(props: FrappeFormProps<TDoc>) {
  const config = useFrappeConfig();
  const { route, ...formProps } = props;
  if (!(props.baseURL ?? config?.baseURL) && !config?.fixtures) {
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
}

type FrappeFormBodyProps<TDoc extends { name: string; doctype: string }> = Omit<FrappeFormProps<TDoc>, 'route'> & {
  /** Routed page: the detail template, with a back action to the list. */
  routePage?: { onBack: () => void };
};

function FrappeFormRoute<TDoc extends { name: string; doctype: string }>({
  route,
  name: nameProp,
  onSave,
  onCancel,
  onDelete,
  onEdit,
  onAmend,
  ...props
}: Omit<FrappeFormProps<TDoc>, 'route'> & { route: string }) {
  const router = useFrappeRouter();
  const fromPath = router ? frappeRouteTarget(route, router.pathname) : undefined;
  const target: FrappeRouteTarget = nameProp
    ? { mode: fromPath?.mode === 'view' ? 'view' : 'edit', name: nameProp }
    : fromPath?.mode === 'view' || fromPath?.mode === 'edit'
      ? fromPath
      : { mode: 'create' };
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
          go(saved ? { mode: 'view', name: saved } : { mode: 'list' });
        })
      }
      onCancel={onCancel ?? (() => go(name ? { mode: 'view', name } : { mode: 'list' }))}
      onDelete={onDelete ?? (() => go({ mode: 'list' }))}
      onAmend={onAmend ?? (() => go({ mode: 'create' }))}
    />
  );
}

function FrappeFormBody<TDoc extends { name: string; doctype: string }>(props: FrappeFormBodyProps<TDoc>) {
  if (props.form) {
    return (
      <FrappeFormView<TDoc>
        {...props}
        form={props.form}
      />
    );
  }
  return <FrappeFormOwned<TDoc> {...props} />;
}

function FrappeFormOwned<TDoc extends { name: string; doctype: string }>(props: FrappeFormBodyProps<TDoc>) {
  const config = useFrappeConfig();
  if (!(props.baseURL ?? config?.baseURL)) {
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
}

function FrappeFormView<TDoc extends { name: string; doctype: string }>({
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
}: FrappeFormBodyProps<TDoc> & { form: FrappeFormController<TDoc> }) {
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
  const isCreate = !name;
  const hasUnsavedChanges = form.isDirty;
  // Meta is permission-gated (Guest gets 403) while the record may still be
  // readable: the form then lays the record's own fields out, read-only.
  const readsWithoutMeta = !children && !meta && Boolean(metaError) && Boolean(name);
  const recordTabs = useMemo((): FormTab[] | undefined => {
    if (!readsWithoutMeta || !baselineDoc) {
      return undefined;
    }
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
  const assignmentCollection = useFrappeCollection<AssignmentTodoRow>(
    showSidebar && name && frappeConfig && !frappeConfig.fixtures ? frappeConfig : undefined,
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
    () => (assignmentCollection ? ((rawAssignmentRows as AssignmentTodoRow[] | undefined) ?? []) : undefined),
    [assignmentCollection, rawAssignmentRows],
  );

  const effectiveConnections = useMemo(() => connections ?? connectionsFromMeta(meta), [connections, meta]);
  const readsConnections = Boolean(children) && Boolean(name) && effectiveConnections.length > 0;
  const [connectionSnapshots, setConnectionSnapshots] = useState<
    Record<string, FrappeRowsSnapshot<Record<string, unknown> & { name: string; doctype: string }>>
  >({});
  useEffect(() => {
    setConnectionSnapshots({});
  }, [doctype, name]);
  const connectionReads = useMemo(
    () =>
      readsConnections && name
        ? effectiveConnections.map((link) => ({
            link,
            options: {
              fields: connectionFields(link),
              filters: [[link.fieldname, '=', name]] as [string, string, unknown][],
              limit: link.limit ?? 0,
            },
            onChange: (snapshot: FrappeRowsSnapshot<Record<string, unknown> & { name: string; doctype: string }>) => {
              setConnectionSnapshots((prev) => ({ ...prev, [link.doctype]: snapshot }));
            },
          }))
        : [],
    [readsConnections, effectiveConnections, name],
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
    if (!saved) {
      return;
    }
    onSave?.(isCreate ? { ...localDoc, name: saved } : localDoc);
  };

  const handleCancel = () => {
    form.reset();
    onCancel?.();
  };

  const handleDelete = async () => {
    if (!name || wasDeleted || !rights.delete) {
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
    if (!name || wasDeleted || !rights.submit) {
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
    if (!name || wasDeleted || !rights.cancel) {
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
  const titleValue = titleField ? (localDoc as Record<string, unknown>)[titleField] : undefined;
  const pageTitle = isCreate ? t('New {{doctype}}', { doctype }) : String(titleValue ?? name);
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

  if (!children && metaError && !meta && !name) {
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

  if (name && form.status === 'error' && docError) {
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

  if (name && form.status === 'loading') {
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
  if (name && form.status === 'notFound') {
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
  const showDelete = Boolean(name && onDelete && !wasDeleted && rights.delete && canDeleteDoc(docstatus));
  const showEdit = Boolean(onEdit && rights.write && canEditDoc(docstatus, meta));
  const showAmend = Boolean(onAmend && isAmendable(meta));
  const showClose = !onEdit && Boolean(onCancel);
  const toolbarShown =
    showToolbar && !readsWithoutMeta && Boolean((indicator ?? docAction ?? showDelete) || showEdit || showClose);
  const shownTabs = formTabs ?? recordTabs;
  const imageFieldName = meta?.image_field;
  const sidebarImageUrl = imageFieldName
    ? resolveFileUrl((localDoc as Record<string, unknown>)[imageFieldName], frappeConfig?.baseURL)
    : undefined;
  const conflictLabels = conflictFields
    .map((fieldname) => {
      const field = meta?.fields.find((metaField) => metaField.fieldname === fieldname);
      return field?.label ?? fieldname;
    })
    .join(', ');

  const formTabItems: TabsItem[] = (shownTabs ?? []).map((tab) => {
    const content = (
      <SchemaForm
        schema={tab.schema}
        doc={localDoc as Record<string, any>}
        setValue={(field, value) => {
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
    ...(showConnections && name && frappeConfig && effectiveConnections.length > 0
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
  const effectiveTab = activeTab && tabItems.some((tab) => tab.value === activeTab) ? activeTab : tabItems[0]?.value;
  const localName = (localDoc as Record<string, unknown>).name;
  const sidebar =
    showSidebar && name && meta ? (
      <FormSidebar
        imageUrl={sidebarImageUrl}
        sections={buildSidebarSections(
          localDoc as Record<string, any>,
          form.shareRows as DocShareRow[] | undefined,
          t,
          assignmentRows,
        )}
        metadata={mapDocToSidebarMetadata(localDoc as Record<string, any>, t)}
      />
    ) : undefined;

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
              options={read.options as never}
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
          {children ? (
            // Render-prop mode
            children({
              doc: localDoc,
              setValue,
              isSubmitting,
              errors,
              meta,
              disabled: fieldsDisabled,
              connections: connectionRows,
              connectionsLoading,
            })
          ) : shownTabs ? (
            <YStack {...knobProps.gapLg}>
              {promptNamed && (
                <Input
                  label={t('Name')}
                  value={typeof localName === 'string' ? localName : ''}
                  onChangeText={(value) => {
                    setValue('name' as keyof TDoc, value);
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
          ) : (
            // Metadata unavailable (should be covered by metaError branch above)
            <YStack
              {...knobProps.panelPadding}
              alignItems="center">
              <Text
                color={formCommonColors.muted}
                {...knobProps.body}>
                {t('Form schema unavailable')}
              </Text>
            </YStack>
          )}

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
              onSave={handleSave}
              onSubmit={handleSubmitDocument}
              onCancelDocument={handleCancelDocument}
              onAmend={showAmend ? handleAmend : undefined}
              amendedAs={amendedAs}
              onDelete={showDelete ? handleDelete : undefined}
              onEdit={showEdit ? onEdit : undefined}
              onClose={showClose ? handleCancel : undefined}
              closeDisabled={disabled}
            />
          )}
        </YStack>
      </XStack>

      {/* Timeline (edit mode only) — live Comment/Version via useFrappeCollection */}
      {showTimeline && name && !readsWithoutMeta && (
        <Timeline
          doctype={doctype}
          docname={name}
          label={t('Activity')}
        />
      )}
    </YStack>,
    routePage ? sidebar : undefined,
  );
}
