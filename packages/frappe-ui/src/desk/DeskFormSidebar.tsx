/**
 * DeskFormSidebar — live-wired FormSidebar for the Desk form page's
 * supporting pane (LC-29 PAGE-TEMPLATE).
 *
 * DeskFormPage composes `DetailPageLayout` and places the document sidebar in
 * the template's `aside` slot (side-by-side from `expanded` up, stacked below
 * the form on compact/medium — never hidden). The aside is a sibling of
 * FrappeForm, so this component owns the same live wiring FrappeForm uses for
 * its inline sidebar: the name-filtered doc subscription (metadata, image
 * field), the assignment-ToDo live query (Assigned To) and the DocShare live
 * query (Shared With). The section / metadata / image mappers are shared with
 * FrappeForm — one body (Axiom 13).
 *
 * Renders nothing until the doc arrives (no "No one assigned" while loading —
 * Axiom 6 HONEST STATE); DeskFormPage keeps the aside slot mounted so the
 * pane geometry is stable while the data loads.
 */

import { useDocTypeMeta, useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { eq } from '@tanstack/db';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isWeb } from 'tamagui';

import { FormSidebar } from '../FormSidebar';
import { buildSidebarSections, mapDocToSidebarMetadata, resolveFileUrl } from '../FrappeForm';
import type { AssignmentTodoRow, DocShareRow } from '../FrappeForm';
import { useFrappeConfig } from '../FrappeProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeskFormSidebarProps {
  /** DocType display name (e.g. "Todo"). */
  doctype: string;
  /** Document name (edit mode only). */
  name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeskFormSidebar({ doctype, name }: DeskFormSidebarProps) {
  const config = useFrappeConfig();
  const { t } = useTranslation();

  const frappeConfig = useMemo(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            socketPort: config.socketPort,
            siteName: config.siteName,
            socketBaseURL: config.socketBaseURL,
            auth: config.auth,
            syncOptions: config.syncOptions,
            realtime: config.realtime,
            fixtures: config.fixtures,
          }
        : undefined,
    [config],
  );

  const { meta } = useDocTypeMeta(frappeConfig, doctype);

  // Same name-filtered live subscription shape as FrappeForm's doc query.
  const docCollection = useFrappeCollection<{ name: string; doctype: string }>(frappeConfig, doctype, {
    filters: { name },
  });
  const { data: rawDocData } = useLiveQuery(
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
  const doc = useMemo(() => {
    const arr = Array.isArray(rawDocData) ? rawDocData : rawDocData ? [rawDocData] : [];
    return (arr[0] ?? undefined) as Record<string, unknown> | undefined;
  }, [rawDocData]);

  // Live "Shared With" rows (mirrors FrappeForm's inline-sidebar query).
  const shareCollection = useFrappeCollection<DocShareRow>(frappeConfig, 'DocShare', {
    fields: ['name', 'user', 'everyone', 'read', 'write', 'share'],
    filters: { share_doctype: doctype, share_name: name },
  });
  const { data: rawShareRows } = useLiveQuery(
    (q) => (shareCollection ? q.from({ _share: shareCollection }) : null),
    [shareCollection],
  );
  const shareRows = useMemo(
    () => (shareCollection ? ((rawShareRows as DocShareRow[] | undefined) ?? []) : undefined),
    [shareCollection, rawShareRows],
  );

  // Live "Assigned To" rows (mirrors FrappeForm's inline sidebar): open
  // assignment ToDos referencing this doc — the `_assign` mirror is written
  // without events and can't update live. Fixture mode falls back to
  // `_assign` via assignmentRows=undefined.
  const assignmentCollection = useFrappeCollection<AssignmentTodoRow>(
    name && !frappeConfig?.fixtures ? frappeConfig : undefined,
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

  if (!config || !doc) {
    return null;
  }

  const imageFieldName = meta?.image_field;
  const imageUrl = imageFieldName ? resolveFileUrl(doc[imageFieldName], config.baseURL) : undefined;

  return (
    <FormSidebar
      imageUrl={imageUrl}
      sections={buildSidebarSections(doc, shareRows, t, assignmentRows)}
      metadata={mapDocToSidebarMetadata(doc, t)}
      // Supporting-pane placement: fill the aside pane instead of the fixed
      // inline rail width, and drop the end rail — the pane gap separates the
      // sidebar from the form (stacked below on compact, the rail would float).
      width="100%"
      {...(isWeb ? { borderInlineEndWidth: 0 } : { borderEndWidth: 0 })}
      data-testid="desk-form-sidebar"
    />
  );
}
