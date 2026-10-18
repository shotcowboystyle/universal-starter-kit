import { ListBulletsIcon } from '@phosphor-icons/react';
/**
 * The document form page — desk form parity, as page chrome over FrappeForm.
 *
 * Composition:
 *   FormToolbar   breadcrumbs / title (title_field) / status chip /
 *                 Save → Submit → Cancel/Amend lifecycle / ⋯ menu
 *   FrappeForm    the fields: tabs, sections, columns and every rule that
 *                 decides what renders, from the controller useFrappeForm
 *                 returns (the same engine a bare <FrappeForm> runs)
 *   Sidebar       assignments / attachments / tags / shares / likes / follow
 *   Timeline      docinfo comments + versions + communications interleaved
 *   Connections   linked-doctype tiles with live counts
 *
 * Data: meta via getdoctype (cached), doc via the live collection
 * (realtime), docinfo via getdoc (refreshed after actions and on live
 * `modified` changes).
 */
import {
  FrappeForm,
  docinfoRights,
  fixtureDocRights,
  isPermissionError,
  refusalReason,
  useFrappeConfig,
  useFrappeForm,
} from '@repo/frappe-ui';
import type { DocShareGrant, FormTab } from '@repo/frappe-ui';
import { useLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
import {
  AsyncBoundary,
  AsyncSkeleton,
  Button,
  ConfirmDialog,
  EmptyState,
  ScrollView,
  Text,
  XStack,
  YStack,
  notify,
} from '@repo/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  actionsForDoctype,
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeNavigator,
  useBackofficePaths,
} from '../config/BackofficeProvider';
import type { BackofficeAction, BackofficeActionContext } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { deskDocUrl } from '../shared/desk-links';
import { getListNavNeighbors } from '../shared/list-nav-context';
import type { ListNavNeighbors } from '../shared/list-nav-context';
import { invalidateDocinfo, useDocinfo } from '../shared/use-docinfo';
import { useDoctypeMeta } from '../shared/use-doctype-meta';
import { useRecentVisit } from '../shared/use-recent-visit';

import { groupConnectionLinks } from './connections-data';
import { setCreatePrefill } from './createPrefill';
import { createHttpClient, renameDoc, sendEmail } from './formActions';
import { FormConnections } from './FormConnections';
import { EmailDialog, JumpToFieldDialog, RenameDialog } from './FormDialogs';
import type { JumpToFieldTarget } from './FormDialogs';
import { FormErrorBoundary, wrapFieldWithErrorBoundary } from './FormErrorBoundary';
import { FormHeaderCluster } from './FormHeaderCluster';
import { FormSidebarPanel } from './FormSidebarPanel';
import { FormTimeline } from './FormTimeline';
import { FormToolbar, resolveIndicator } from './FormToolbar';
import type { FormToolbarMenuItem } from './FormToolbar';
import {
  canOpenNewTab,
  openInNewTab,
  useBeforeUnloadGuard,
  useDocPagerShortcuts,
  useJumpToFieldShortcut,
  useNavigationDirtyGuard,
  useSaveShortcut,
} from './platform-hooks';
import { htmlToText } from './timeline-utils';

/** Host overrides for the form's ⋯ toolbar menu. */
export interface DocFormActionOverrides {
  /**
   * Built-in menu item keys to remove ("reload" | "duplicate" | "rename" |
   * "print" | "email" | "links" | "jump-list" | "new" | "delete").
   */
  hide?: readonly string[];
  /** Extra host actions appended to the menu (after provider `actions.form`). */
  extra?: readonly BackofficeAction[];
}

export interface DocFormScreenProps {
  /** Proper-cased doctype name (e.g. "Sales Order") */
  doctype: string;
  /** Document name; the literal "new" renders create mode */
  name: string;
  /** Force the whole form read-only regardless of permissions. */
  readOnly?: boolean;
  /** Hide form sections/tabs by Section/Tab Break name or label. */
  hiddenSections?: readonly string[];
  /** Hide individual fields by name. */
  hiddenFields?: readonly string[];
  /** Create-mode field prefill (merged over meta defaults). */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- open frappe field values; keys vary by doctype
  defaults?: Record<string, unknown>;
  /** After a successful save (create or update). `doc.name` is authoritative. */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the saved frappe doc; keys vary by doctype
  onSaved?: (doc: Record<string, unknown> & { name: string }) => void;
  /** After a successful delete. Replaces the default navigate-to-list. */
  onDeleted?: () => void;
  /** Hide built-in ⋯ menu items / append host actions. */
  actionOverrides?: DocFormActionOverrides;
}

const CONNECTIONS_TAB = '__connections';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- an open frappe doc; keys vary by doctype
type DeskDoc = Record<string, unknown> & { name: string; doctype: string };

type ConfirmAction = 'submit' | 'cancel' | 'delete';

/** A non-empty string (route params, doc names and field values arrive as optional strings). */
const present = (value: string | undefined): value is string => value !== undefined && value !== '';

/** Action/slot context for this doc; `name` only once the doc exists. */
const docContext = (doctype: string, docName: string | undefined): BackofficeActionContext => {
  const context: BackofficeActionContext = { doctype };
  if (present(docName)) {
    context.name = docName;
  }
  return context;
};

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- the desk form page: toolbar, banners, body, panels and every dialog share one form controller
export const DocFormScreen = ({
  doctype,
  name,
  readOnly,
  hiddenSections,
  hiddenFields,
  defaults,
  onSaved,
  onDeleted,
  actionOverrides,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component note above
}: DocFormScreenProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const backToListLabel = t('backToList', 'Back to {{doctype}} list', { doctype });
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const capabilities = useBackofficeCapabilities();
  const { actions, slots, emitEvent } = useBackofficeConfig();
  // Canonical size-class mechanism (LC-28): `compact` = < 640 — the sidebar
  // accordion stacks between the form body and the timeline.
  const sizeClass = useLayoutSizeClass();
  const config = useFrappeConfig();

  const isCreate = name === 'new';
  const docName = isCreate ? undefined : name;

  // Write-on-visit for the shared recent store (workspace "Continue where
  // you left off" strip). Create mode and fixture mode (stories) skip.
  useRecentVisit(
    isCreate || config?.fixtures ? undefined : { label: `${doctype}: ${name}`, path: paths.form(doctype, name) },
  );

  // `defaults` prop rides the SAME one-shot stash Duplicate/Amend and the
  // `?d=` route param use (createPrefill) — stashed in a memo (not an
  // effect) so the values land before the form's create-mode seeding runs,
  // and keyed on content so re-renders don't re-stash consumed values.
  const defaultsKey = defaults ? JSON.stringify(defaults) : undefined;
  // oxlint-disable-next-line react/void-use-memo -- deliberate render-phase stash (see above); an effect would run after seeding
  useMemo(() => {
    if (!isCreate || defaultsKey === undefined) {
      return;
    }
    // SAFETY: defaultsKey is JSON.stringify of the `defaults` record, so it parses back to that record
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
    const parsed = JSON.parse(defaultsKey) as Record<string, unknown>;
    if (Object.keys(parsed).length > 0) {
      setCreatePrefill(doctype, parsed);
    }
  }, [doctype, defaultsKey, isCreate]);

  // Host event bus: a form was opened (edit mode; create emits on first save).
  useEffect(() => {
    if (!isCreate) {
      emitEvent({ type: 'doc-opened', doctype, name });
    }
  }, [isCreate, doctype, name, emitEvent]);

  // One meta loader for the whole screen (shared getdoctype cache with the
  // fixture branch for stories) — the form, sidebar, and connections all
  // read the same bundle.
  const { meta, loading: isMetaLoading, error: metaError, reload: refetchMeta } = useDoctypeMeta(doctype);
  const metaSource = useMemo(
    () => ({ meta, isLoading: isMetaLoading, error: metaError }),
    [meta, isMetaLoading, metaError],
  );
  // Guest is refused getdoctype while it may still read the record (LC-96):
  // FrappeForm then lays the record out read-only, and the page offers
  // nothing that needs the meta or the docinfo Guest can't read either.
  const metaRefused = !meta && metaError !== undefined && isPermissionError(metaError);

  // Shared docinfo — one get_docinfo fetch shared with the header cluster,
  // sidebar, and timeline panels; the screen reads the permission flags and
  // passes the bundle down so cluster/sidebar mutations stay in sync.
  const { docinfo, reload: reloadDocinfo } = useDocinfo(doctype, name);
  const refreshDocinfo = useCallback(() => {
    if (present(docName)) {
      invalidateDocinfo(doctype, docName);
    }
    reloadDocinfo();
  }, [doctype, docName, reloadDocinfo]);

  // Rights: the bench's per-record answer (docinfo) when it gave one, else the
  // session's (the form resolves those). Fixture mode has no session and
  // keeps what the doctype's rows grant.
  const fixtureMode = Boolean(config?.fixtures);
  const rights = useMemo(
    () => docinfoRights(docinfo?.permissions) ?? (fixtureMode ? fixtureDocRights(meta) : undefined),
    [docinfo?.permissions, fixtureMode, meta],
  );

  const form = useFrappeForm<DeskDoc>({
    doctype,
    name: docName,
    meta: metaSource,
    rights,
    // SAFETY: docinfo.shared rows are DocShare records, the shape DocShareGrant names
    shares: docinfo?.shared as DocShareGrant[] | undefined,
    readShares: false,
    disabled: readOnly,
    hideFields: hiddenFields,
    hideSections: hiddenSections,
  });
  const { connection } = form;
  const currentUser = form.user ?? '';
  const perms = form.rights;

  useEffect(() => {
    if (metaError && !meta && !metaRefused) {
      emitEvent({ type: 'error', error: metaError, context: 'form-meta' });
    }
  }, [metaError, meta, metaRefused, emitEvent]);

  // Refresh docinfo whenever the live doc's `modified` stamp moves —
  // an external edit usually lands with new versions/comments too.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the live doc is wire data; only a string is usable
  const modifiedStamp = typeof form.baseline?.modified === 'string' ? form.baseline.modified : undefined;
  const stampRef = useRef<string | null>(null);
  useEffect(() => {
    stampRef.current = null;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- doctype/name are the reset key for the stamp
  }, [doctype, name]);
  useEffect(() => {
    if (!present(docName) || !present(modifiedStamp)) {
      return;
    }
    if (stampRef.current === modifiedStamp) {
      return;
    }
    const isFirstLoad = stampRef.current === null;
    stampRef.current = modifiedStamp;
    if (!isFirstLoad) {
      invalidateDocinfo(doctype, docName);
      reloadDocinfo();
    }
  }, [modifiedStamp, docName, doctype, reloadDocinfo]);

  const { isSubmittable } = form;
  const formReadOnly = form.readOnly;
  const jumpTargets = form.fieldTargets;

  // Connections render what FormConnections groups (connections-data skips
  // the link rows a doctype hides, desk parity).
  const showConnections = !isCreate && !!connection && groupConnectionLinks(meta).length > 0;

  // -----------------------------------------------------------------------
  // Navigation with dirty guard
  // -----------------------------------------------------------------------
  const [pendingNav, setPendingNav] = useState<string | undefined>();
  const navigate = useCallback(
    (href: string) => {
      if (form.isDirty) {
        setPendingNav(href);
        return;
      }
      navigator.navigate(href);
    },
    [form.isDirty, navigator],
  );
  useBeforeUnloadGuard(form.isDirty);
  // Covers back navigations that skip navigate(): browser back on web,
  // back gesture/button on native (B7).
  const backGuard = useNavigationDirtyGuard(form.isDirty);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | undefined>();
  const [renameOpen, setRenameOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [pendingJump, setPendingJump] = useState<string | undefined>();

  const [validationSummary, setValidationSummary] = useState<string | undefined>();

  const handleSave = useCallback(async () => {
    // Pre-check required fields so the failing tab is surfaced — inline
    // errors on an inactive tab would otherwise fail invisibly.
    const validationErrors = form.validate();
    const errorFields = Object.keys(validationErrors);
    if (errorFields.length > 0) {
      errorFields.some((field) => form.revealField(field));
      setValidationSummary(
        t('validationSummary', {
          count: errorFields.length,
          defaultValue_one: 'Cannot save — {{count}} required field is missing.',
          defaultValue_other: 'Cannot save — {{count}} required fields are missing.',
        }),
      );
    } else {
      setValidationSummary(undefined);
    }
    const savedName = await form.save();
    if (!present(savedName)) {
      return;
    }
    setValidationSummary(undefined);
    // Explicit save confirmation (desk's green "Saved" toast) — the
    // "Not Saved" badge clearing alone is too passive a success signal.
    // Errors stay on the form's inline path (errors.general).
    notify({
      severity: 'success',
      scope: 'page',
      body: t('savedToast', 'Saved'),
    });
    invalidateDocinfo(doctype, savedName);
    emitEvent({ type: 'doc-saved', doctype, name: savedName, isNew: isCreate });
    onSaved?.({ ...form.doc, name: savedName });
    if (isCreate) {
      navigator.replace(paths.form(doctype, savedName));
    } else {
      reloadDocinfo();
    }
  }, [form, isCreate, navigator, paths, doctype, reloadDocinfo, t, emitEvent, onSaved]);

  // Always swallow Cmd/Ctrl+S while the form is editable (desk parity —
  // the browser save dialog must never appear on a form page); saving
  // itself only fires when there is something to save.
  useSaveShortcut(!formReadOnly, () => {
    if (form.isDirty || isCreate) {
      void handleSave();
    }
  });
  useJumpToFieldShortcut(jumpTargets.length > 0 && !jumpOpen, () => {
    setJumpOpen(true);
  });

  const handleAmend = useCallback(() => {
    if (form.amend()) {
      navigator.navigate(paths.newDoc(doctype));
    }
  }, [form, doctype, navigator, paths]);

  const handleDuplicate = useCallback(() => {
    if (form.duplicate()) {
      navigator.navigate(paths.newDoc(doctype));
    }
  }, [form, doctype, navigator, paths]);

  const handleRename = useCallback(
    async (newName: string) => {
      if (!connection || !present(docName)) {
        return;
      }
      try {
        const resolved = await renameDoc(createHttpClient(connection), doctype, docName, newName);
        navigator.replace(paths.form(doctype, resolved));
      } catch {
        // rename_doc rejections (permissions / duplicates) leave the doc as-is.
      }
    },
    [connection, docName, doctype, navigator, paths],
  );

  // -----------------------------------------------------------------------
  // Prev/next document pager (desk ‹ › parity): neighbors ride the SAME
  // list order the user came from — DoctypeListScreen mirrors each resolved
  // page into the shared listNavContext store (sessionStorage-backed so a
  // reload keeps paging). No context / not in the last result (deep link,
  // renamed doc) → no pager at all: no arrows beat dead arrows (LC-40).
  // -----------------------------------------------------------------------
  const docPager = useMemo<ListNavNeighbors>(
    () => (present(docName) ? getListNavNeighbors(doctype, docName) : { inList: false }),
    [doctype, docName],
  );
  const openNeighborDoc = useCallback(
    (target: string | undefined) => {
      // navigate() (not navigator.navigate) so the dirty guard can prompt.
      if (present(target)) {
        navigate(paths.form(doctype, target));
      }
    },
    [navigate, paths, doctype],
  );
  useDocPagerShortcuts(
    docPager.inList,
    () => {
      openNeighborDoc(docPager.prev);
    },
    () => {
      openNeighborDoc(docPager.next);
    },
  );

  const titleFieldName = meta?.title_field ?? '';
  const rawTitle = titleFieldName === '' ? undefined : form.doc[titleFieldName];
  // Title fields can hold rich text (e.g. a to-do description = "<p>…</p>");
  // strip to plain text so the breadcrumb + toolbar heading don't show
  // literal HTML tags.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the live doc is wire data; only a string is usable
  const titleFieldValue = typeof rawTitle === 'string' ? htmlToText(rawTitle) : undefined;
  const title = isCreate ? t('newDocTitle', 'New {{doctype}}', { doctype }) : (titleFieldValue ?? name);

  // oxlint-disable-next-line eslint/complexity -- one guard per desk menu entry, in desk order
  const menuItems = useMemo<FormToolbarMenuItem[]>(() => {
    if (isCreate) {
      return [];
    }
    const items: FormToolbarMenuItem[] = [
      {
        key: 'reload',
        label: t('menuReload', 'Reload'),
        icon: 'reload',
        onSelect: () => {
          form.reset();
          setValidationSummary(undefined);
          refetchMeta();
          invalidateDocinfo(doctype, name);
          reloadDocinfo();
        },
      },
    ];
    if (!metaRefused) {
      items.push({
        key: 'duplicate',
        label: t('menuDuplicate', 'Duplicate'),
        icon: 'duplicate',
        onSelect: handleDuplicate,
      });
    }
    if ((meta?.allow_rename ?? 0) !== 0 && perms.write) {
      items.push({
        key: 'rename',
        label: t('menuRename', 'Rename'),
        icon: 'rename',
        onSelect: () => {
          setRenameOpen(true);
        },
      });
    }
    if (capabilities.print.enabled && canOpenNewTab() && perms.print && connection) {
      // Print opens the bench's printview in a new tab (web only; native
      // and GNOME hide the entry — documented platform gap).
      items.push({
        key: 'print',
        label: t('menuPrint', 'Print'),
        icon: 'print',
        onSelect: () => {
          const base = connection.baseURL.replace(/\/$/u, '');
          openInNewTab(
            `${base}/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=Standard`,
          );
        },
      });
    }
    if (capabilities.email.enabled && perms.email) {
      items.push({
        key: 'email',
        label: t('menuEmail', 'Email'),
        icon: 'email',
        onSelect: () => {
          setEmailOpen(true);
        },
      });
    }
    if (showConnections) {
      items.push({
        key: 'links',
        label: t('menuLinks', 'Links'),
        icon: 'links',
        onSelect: () => {
          form.setActiveTab(CONNECTIONS_TAB);
        },
      });
    }
    if (jumpTargets.length > 0) {
      items.push({
        key: 'jump-field',
        label: t('jumpToField', 'Jump to Field'),
        icon: 'jump',
        onSelect: () => {
          setJumpOpen(true);
        },
      });
    }
    items.push({
      key: 'jump-list',
      label: t('menuJumpToList', 'Jump to {{doctype}} List', { doctype }),
      icon: 'list',
      onSelect: () => {
        navigate(paths.list(doctype));
      },
    });
    if (connection && !connection.fixtures && canOpenNewTab()) {
      // Desk counterpart of this document — same session caveat as Print
      // off-web (system browser opens unauthenticated).
      items.push({
        key: 'desk',
        label: t('openInDesk', 'Open in Desk'),
        icon: 'desk',
        onSelect: () => {
          openInNewTab(deskDocUrl(connection.baseURL, doctype, name));
        },
      });
    }
    if (capabilities.newDoc.enabled && perms.create) {
      items.push({
        key: 'new',
        label: t('menuNew', 'New {{doctype}}', { doctype }),
        icon: 'new',
        onSelect: () => {
          navigate(paths.newDoc(doctype));
        },
      });
    }
    if (perms.delete) {
      items.push({
        key: 'delete',
        label: t('menuDelete', 'Delete'),
        icon: 'delete',
        destructive: true,
        onSelect: () => {
          setConfirmAction('delete');
        },
      });
    }
    return items;
  }, [
    isCreate,
    t,
    form,
    refetchMeta,
    reloadDocinfo,
    handleDuplicate,
    metaRefused,
    meta?.allow_rename,
    perms,
    connection,
    doctype,
    name,
    showConnections,
    jumpTargets,
    navigate,
    paths,
    capabilities,
  ]);

  // Host action registry: provider-level `actions.form` plus per-screen
  // `actionOverrides.extra` land on the ⋯ menu; `actionOverrides.hide`
  // removes built-ins by key (a host can replace "print" by hiding it and
  // injecting its own).
  const effectiveMenuItems = useMemo<FormToolbarMenuItem[]>(() => {
    const hiddenKeys = new Set(actionOverrides?.hide);
    const items = menuItems.filter((item) => !hiddenKeys.has(item.key));
    const injected: BackofficeAction[] = [
      ...actionsForDoctype(actions.form, doctype),
      ...actionsForDoctype(actionOverrides?.extra, doctype),
    ];
    for (const action of injected) {
      items.push({
        key: `host:${action.id}`,
        label: action.label,
        onSelect: () => {
          action.onPress(docContext(doctype, docName));
        },
      });
    }
    return items;
  }, [menuItems, actions.form, actionOverrides, doctype, docName]);

  const handleJumpToField = useCallback(
    (field: JumpToFieldTarget) => {
      setJumpOpen(false);
      form.setActiveTab(field.tabKey);
      setPendingJump(field.name);
    },
    [form],
  );

  // Desk Jump-to-field: switch tab (lazyMount) then focus the LC-71 field shell.
  useEffect(() => {
    if (!present(pendingJump)) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    if (typeof document === 'undefined') {
      // oxlint-disable-next-line react/set-state-in-effect -- no DOM to focus in (native/GTK): drop the jump at once
      setPendingJump(undefined);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) {
        return;
      }
      // oxlint-disable-next-line unicorn/prefer-query-selector -- the id embeds a raw field name; getElementById needs no CSS escaping
      const root = document.getElementById(`form-field-${pendingJump}`);
      if (root) {
        root.scrollIntoView({ block: 'center' });
        const focusable = root.querySelector<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable='true']",
        );
        focusable?.focus();
        setPendingJump(undefined);
        return;
      }
      tries += 1;
      if (tries <= 20) {
        requestAnimationFrame(tick);
      } else {
        setPendingJump(undefined);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [pendingJump]);

  // -----------------------------------------------------------------------
  // Early states
  // -----------------------------------------------------------------------
  if (!present(config?.baseURL) || !connection) {
    return (
      <YStack flex={1}>
        <EmptyState
          title={t('noFrappe', 'Frappe is not configured')}
          description={t(
            'noFrappeHint',
            'Pass a frappe connection to BackofficeProvider to point the backoffice at a bench.',
          )}
        />
      </YStack>
    );
  }

  if (isMetaLoading && !meta) {
    return (
      <YStack
        flex={1}
        {...knobProps.panelPadding}
        testID="doc-form-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>
    );
  }

  if (metaError && !meta && !metaRefused) {
    return (
      <YStack flex={1}>
        <AsyncBoundary
          error={metaError}
          errorTitle={t('metaError', 'Could not load {{doctype}}', { doctype })}
          onRetry={refetchMeta}
        />
      </YStack>
    );
  }

  if (!isCreate && form.status === 'error' && form.docError && isPermissionError(form.docError)) {
    return (
      <YStack flex={1}>
        <EmptyState
          testID="frappe-form-not-permitted"
          title={t('docNotPermitted', "You can't open {{doctype}} {{name}}", { doctype, name })}
          description={refusalReason(form.docError)}
          action={
            <Button
              icon={ListBulletsIcon}
              onPress={() => {
                navigator.navigate(paths.list(doctype));
              }}>
              {backToListLabel}
            </Button>
          }
        />
      </YStack>
    );
  }

  if (!isCreate && form.status === 'error' && form.docError) {
    return (
      <YStack flex={1}>
        <EmptyState
          intent="error"
          title={t('docLoadError', 'Could not load {{doctype}} {{name}}', { doctype, name })}
          description={form.docError.message}
          action={
            <Button
              icon={ListBulletsIcon}
              onPress={() => {
                navigator.navigate(paths.list(doctype));
              }}>
              {backToListLabel}
            </Button>
          }
        />
      </YStack>
    );
  }

  if (!isCreate && form.status === 'notFound') {
    return (
      <YStack flex={1}>
        <EmptyState
          title={t('docNotFound', '{{doctype}} {{name}} not found', {
            doctype,
            name,
          })}
          description={t('docNotFoundHint', 'The document does not exist or you do not have permission to read it.')}
          action={
            <Button
              icon={ListBulletsIcon}
              onPress={() => {
                navigator.navigate(paths.list(doctype));
              }}>
              {backToListLabel}
            </Button>
          }
        />
      </YStack>
    );
  }

  if (!isCreate && form.status === 'loading') {
    return (
      <YStack
        flex={1}
        {...knobProps.panelPadding}
        testID="doc-form-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>
    );
  }

  // -----------------------------------------------------------------------
  // Toolbar state
  // -----------------------------------------------------------------------
  const indicator = resolveIndicator({
    isCreate,
    isDirty: form.isDirty,
    docstatus: form.docstatus,
    isSubmittable,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the live doc is wire data; only a string is usable
    statusValue: typeof form.doc.status === 'string' ? form.doc.status : undefined,
    states: meta?.states,
  });
  const canSave = !formReadOnly && (isCreate ? perms.create : perms.write && form.docstatus === 0);
  const lifecycleOpen = !isCreate && isSubmittable && !form.wasDeleted;
  const canSubmit = lifecycleOpen && form.docstatus === 0 && !form.isDirty && perms.submit;
  const canCancel = lifecycleOpen && form.docstatus === 1 && perms.cancel;
  const canAmend = lifecycleOpen && form.docstatus === 2 && perms.amend;

  const breadcrumbs = [
    { label: t('home', 'Home'), href: paths.home() },
    { label: doctype, href: paths.list(doctype) },
    { label: isCreate ? t('newCrumb', 'New') : title },
  ];

  // Compact (< 640): the sidebar accordion stacks between form body and
  // timeline (LC-29 — asides stack, never hide; metadata before history).
  const sidebarStacked = sizeClass === 'compact';

  const connectionsTab = showConnections
    ? [
        {
          value: CONNECTIONS_TAB,
          label: t('connectionsTab', 'Connections'),
          content: (
            <YStack paddingTop="$3">
              <FormConnections
                doctype={doctype}
                name={name}
                meta={meta}
              />
            </YStack>
          ),
        },
      ]
    : [];

  // Containment at two granularities: each field renders behind its own
  // boundary (a broken field degrades to an inline error slot; siblings stay
  // editable), and the whole tab body behind another (a crash in the form
  // costs one tab, not the route).
  const renderTab = (tab: FormTab, content: React.ReactNode) => (
    <YStack
      {...knobProps.gapLg}
      paddingTop="$3">
      <FormErrorBoundary
        errorTitle={t('formTabRenderError', 'This form tab failed to render')}
        testID={`form-tab-error-${tab.key}`}>
        {content}
      </FormErrorBoundary>
    </YStack>
  );

  const formBody = (
    // No flex here: formBody lives inside COLUMN containers (both branches
    // below), where `flex={1}` means flex-basis:0 — the body would stop
    // contributing height and the timeline/sidebar would paint over it.
    <YStack minWidth={0}>
      <FrappeForm<DeskDoc>
        form={form}
        doctype={doctype}
        name={docName}
        disabled={readOnly}
        showToolbar={false}
        showSidebar={false}
        showTimeline={false}
        showConnections={false}
        showBanners={false}
        sectionHeadingLevel={2}
        renderFieldWrapper={wrapFieldWithErrorBoundary}
        renderTab={renderTab}
        extraTabs={connectionsTab}
      />
    </YStack>
  );

  const showTimeline = capabilities.timeline.enabled && !isCreate && !metaRefused;
  const timeline =
    showTimeline && present(docName) ? (
      // Composed mode: the screen's shared docinfo (and its refresh) feed
      // the timeline. Self-fetch mode subscribed the timeline to its OWN
      // cache entry, which the save path's invalidate+reload orphaned — the
      // feed then showed stale versions until a full remount (no new
      // old→new rows after saving).
      <FormTimeline
        doctype={doctype}
        name={docName}
        docInfo={docinfo}
        refreshDocInfo={refreshDocinfo}
        currentUser={currentUser}
        connection={connection}
      />
    ) : null;

  const sidebar =
    !isCreate && present(docName) && meta ? (
      <FormSidebarPanel
        doctype={doctype}
        name={docName}
        meta={meta}
        doc={form.doc}
        docinfo={docinfo}
        currentUser={currentUser}
        onRefresh={refreshDocinfo}
        stacked={sidebarStacked}
      />
    ) : null;

  const canOpenDesk = !isCreate && !connection.fixtures && canOpenNewTab();
  const toolbar = (
    <FormToolbar
      breadcrumbs={breadcrumbs}
      onNavigate={navigate}
      title={title}
      indicator={indicator}
      showIndicator={!!meta}
      isSaving={form.isSubmitting}
      cluster={
        !isCreate && present(docName) && !metaRefused ? (
          <FormHeaderCluster
            doctype={doctype}
            name={docName}
            docinfo={docinfo}
            currentUser={currentUser}
            onRefresh={refreshDocinfo}
          />
        ) : undefined
      }
      canSave={canSave}
      canSubmit={canSubmit}
      canCancel={canCancel}
      canAmend={canAmend}
      onSave={() => {
        void handleSave();
      }}
      onSubmit={() => {
        setConfirmAction('submit');
      }}
      onCancel={() => {
        setConfirmAction('cancel');
      }}
      onAmend={handleAmend}
      menuItems={effectiveMenuItems}
      onOpenDesk={
        canOpenDesk && present(docName)
          ? () => {
              openInNewTab(deskDocUrl(connection.baseURL, doctype, docName));
            }
          : undefined
      }
      {...(docPager.inList
        ? {
            onPrevDoc: () => {
              openNeighborDoc(docPager.prev);
            },
            onNextDoc: () => {
              openNeighborDoc(docPager.next);
            },
            prevDocDisabled: !present(docPager.prev),
            nextDocDisabled: !present(docPager.next),
          }
        : {})}
    />
  );

  const submitAndNotify = async () => {
    if (await form.submitDocument()) {
      notify({
        severity: 'success',
        scope: 'page',
        body: t('submittedToast', 'Submitted'),
      });
      reloadDocinfo();
    }
  };

  const cancelAndNotify = async () => {
    if (await form.cancelDocument()) {
      notify({
        severity: 'success',
        scope: 'page',
        body: t('cancelledToast', 'Cancelled'),
      });
      reloadDocinfo();
    }
  };

  const removeAndLeave = async () => {
    const ok = await form.remove();
    if (ok) {
      invalidateDocinfo(doctype, name);
      emitEvent({ type: 'doc-deleted', doctype, name });
      if (onDeleted) {
        onDeleted();
      } else {
        navigator.replace(paths.list(doctype));
      }
    }
  };

  return (
    <YStack flex={1}>
      {slots.renderFormHeader
        ? slots.renderFormHeader({ ...docContext(doctype, docName), defaultContent: toolbar })
        : toolbar}

      {(form.wasDeleted || present(validationSummary) || form.conflict) && (
        <YStack paddingHorizontal="$3">
          {form.wasDeleted && (
            <XStack
              role="alert"
              {...knobProps.containerRadius}
              {...knobProps.panelPadding}
              backgroundColor="$red3">
              <Text
                color="$red11"
                fontSize="$3">
                {t('deletedBanner', 'This document was deleted on the server. Fields are read-only.')}
              </Text>
            </XStack>
          )}

          {present(validationSummary) && !form.wasDeleted && (
            <XStack
              role="alert"
              {...knobProps.containerRadius}
              {...knobProps.panelPadding}
              backgroundColor="$red3"
              testID="doc-form-validation-summary">
              <Text
                color="$red11"
                fontSize="$3">
                {validationSummary}
              </Text>
            </XStack>
          )}

          {form.conflict && !form.wasDeleted && (
            <XStack
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders on native too, where role is the only status semantic
              role="status"
              alignItems="center"
              justifyContent="space-between"
              {...knobProps.containerRadius}
              {...knobProps.panelPadding}
              backgroundColor="$orange3"
              gap="$3">
              <Text
                color="$orange11"
                fontSize="$3"
                flex={1}>
                {t('conflictBanner', 'This document changed on the server while you were editing.')}
              </Text>
              <Button
                size="$2"
                outlined
                aria-label={t('reloadDoc', 'Reload')}
                onPress={() => {
                  form.reset();
                }}>
                {t('reloadDoc', 'Reload')}
              </Button>
            </XStack>
          )}
        </YStack>
      )}

      <ScrollView flex={1}>
        {sidebarStacked ? (
          // Compact: form body → metadata accordion → timeline (the accordion
          // must not hide below the activity feed's long scroll).
          <YStack
            {...knobProps.panelPadding}
            {...knobProps.gapLg}>
            {formBody}
            {sidebar}
            {timeline}
          </YStack>
        ) : (
          // Wide: main column (body + timeline) with the compact metadata
          // rail keeping its trailing position.
          <XStack
            {...knobProps.panelPadding}
            {...knobProps.gapLg}
            alignItems="flex-start">
            <YStack
              flex={1}
              minWidth={0}
              {...knobProps.gapLg}>
              {formBody}
              {timeline}
            </YStack>
            {sidebar}
          </XStack>
        )}
      </ScrollView>

      {/* Lifecycle confirms */}
      <ConfirmDialog
        open={confirmAction === 'submit'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(undefined);
          }
        }}
        title={t('submitConfirmTitle', 'Submit {{doctype}}?', { doctype })}
        body={t(
          'submitConfirmBody',
          'After submitting, the document becomes read-only and can only be cancelled or amended.',
        )}
        confirmLabel={t('submit', 'Submit')}
        warning
        onConfirm={() => {
          setConfirmAction(undefined);
          void submitAndNotify();
        }}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(undefined);
          }
        }}
        title={t('cancelConfirmTitle', 'Cancel {{doctype}}?', { doctype })}
        body={t(
          'cancelConfirmBody',
          'Cancelling marks the document as void. You can amend it into a new draft afterwards.',
        )}
        confirmLabel={t('cancelAction', 'Cancel')}
        destructive
        onConfirm={() => {
          setConfirmAction(undefined);
          void cancelAndNotify();
        }}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(undefined);
          }
        }}
        title={t('deleteConfirmTitle', 'Delete {{doctype}} {{name}}?', {
          doctype,
          name: title,
        })}
        body={t('deleteConfirmBody', 'This action cannot be undone.')}
        confirmLabel={t('menuDelete', 'Delete')}
        destructive
        onConfirm={() => {
          setConfirmAction(undefined);
          void removeAndLeave();
        }}
      />

      {/* Unsaved-changes nav guard (in-app navigate() + router-level back) */}
      <ConfirmDialog
        open={present(pendingNav) || backGuard.blocked}
        onOpenChange={(open) => {
          if (open) {
            return;
          }
          setPendingNav(undefined);
          backGuard.reset();
        }}
        title={t('unsavedTitle', 'Discard unsaved changes?')}
        body={t('unsavedBody', 'You have unsaved changes that will be lost if you leave this page.')}
        confirmLabel={t('leave', 'Leave')}
        warning
        onConfirm={() => {
          if (backGuard.blocked) {
            backGuard.proceed();
            return;
          }
          const target = pendingNav;
          setPendingNav(undefined);
          if (present(target)) {
            navigator.navigate(target);
          }
        }}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={name}
        onRename={(newName) => {
          setRenameOpen(false);
          void handleRename(newName);
        }}
      />
      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        defaultSubject={`${doctype}: ${title}`}
        onSend={(args) => {
          setEmailOpen(false);
          if (!present(docName)) {
            return;
          }
          const send = async () => {
            try {
              await sendEmail(createHttpClient(connection), {
                doctype,
                name: docName,
                ...args,
              });
            } catch {
              // Email failures surface in the refreshed timeline / bench logs.
            }
            reloadDocinfo();
          };
          void send();
        }}
      />
      <JumpToFieldDialog
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        fields={jumpTargets}
        onJump={handleJumpToField}
      />
    </YStack>
  );
};
