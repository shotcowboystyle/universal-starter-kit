/**
 * DeskFormPage - Page component for Frappe Desk form views.
 *
 * Composes the canonical `DetailPageLayout` page template (LC-29
 * PAGE-TEMPLATE) inside DeskShell: back toolbar, PageHeader (the page's
 * single h1, DG-A11Y-02), the schema-driven FrappeForm as the primary
 * content, and the live document sidebar in the template's `aside` slot —
 * side-by-side (⅔ / ⅓) from `expanded` up, stacked below the form on
 * compact/medium, never hidden.
 *
 * Supports both create mode (no name / name === "new") and edit mode.
 * Accepts `doctype` and `name` as props (route files read params and pass them).
 *
 * Missing documents are handled by FrappeForm (SB-M-1707): when `name` is set
 * and the live query settles without a row, FrappeForm renders a not-found
 * panel (no editable empty form / Delete toolbar).
 */

import { DetailPageLayout, PageHeader } from '@repo/ui';
import type { BreadcrumbItem } from '@repo/ui';
import { Button, formCommonColors } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';

import { FrappeForm } from '../FrappeForm';

import { DeskFormSidebar } from './DeskFormSidebar';
import { DeskShell } from './DeskShell';
import { addToRecent } from './DeskSidebar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeskFormPageProps {
  /** DocType slug from route params (e.g. "pokemon", "poke-type") */
  doctype: string;
  /** Document name. If not provided or "new", renders in create mode */
  name?: string;
  /** Navigation handler — called when the user clicks a link */
  onNavigate?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a URL slug to a display name.
 * "pokemon" → "Pokemon", "poke-type" → "Poke Type"
 */
function toDisplayName(slug: string): string {
  return slug.replaceAll('-', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeskFormPage({ doctype, name, onNavigate }: DeskFormPageProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const isCreate = !name || name === 'new';
  const displayName = toDisplayName(doctype);

  // Track recent visits for edit mode
  useEffect(() => {
    if (!isCreate && name) {
      addToRecent({
        label: `${displayName}: ${name}`,
        path: `/desk/${doctype}/${name}`,
      });
    }
  }, [doctype, name, displayName, isCreate]);

  if (!doctype) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        {...knobProps.panelPadding}
        {...knobProps.containerRadius}
        {...knobProps.gap}>
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('No DocType specified')}
        </Text>
      </YStack>
    );
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t('Desk'), href: '/desk' },
    { label: displayName, href: `/desk/${doctype}` },
    { label: isCreate ? t('New') : (name ?? '') },
  ];

  const handleNavigate = (path: string) => {
    onNavigate?.(path);
  };

  return (
    <DeskShell
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      activePath={`/desk/${doctype}/${name ?? 'new'}`}>
      {/* LC-29 PAGE-TEMPLATE: the canonical detail-page scaffold owns scroll,
          max-width, toolbar/header regions, and the supporting-pane aside.
          flexBasis auto reaches Screen's content stack (ScreenProps rest):
          with react-native-web's min-height:0 reset, the default 0% basis
          would cap the scroll page at viewport height and crush the form. */}
      <DetailPageLayout
        flexBasis="auto"
        toolbarLeading={
          <Button
            size="$3"
            chromeless
            icon={ArrowLeftIcon}
            onPress={() => {
              handleNavigate(`/desk/${doctype}`);
            }}
            aria-label={t('Back to {{doctype}} list', { doctype: displayName })}
            data-testid="desk-form-back">
            {displayName}
          </Button>
        }
        header={
          // DG-A11Y-02: the document name (or "New <DocType>") is the page's
          // single h1; schema-form section headings step to h2 below it.
          // Same t("New") key as the breadcrumb leaf above.
          <PageHeader
            title={isCreate ? `${t('New')} ${displayName}` : (name ?? displayName)}
            divider={false}
          />
        }
        // Edit mode: the live document sidebar rides the aside slot; the
        // template stacks it below the form on compact/medium (LC-29 — a
        // hidden aside is a VIOLATION). Create mode has no doc to describe.
        aside={
          !isCreate && name ? (
            <DeskFormSidebar
              doctype={displayName}
              name={name}
            />
          ) : undefined
        }>
        <FrappeForm
          doctype={displayName}
          name={isCreate ? undefined : name}
          showToolbar
          // The desk page owns sidebar placement via the template aside above;
          // FrappeForm's inline rail stays off so the sidebar renders once.
          showSidebar={false}
          showTimeline
          onSave={(doc) => {
            if (isCreate && doc.name) {
              handleNavigate(`/desk/${doctype}/${doc.name}`);
            }
          }}
          onCancel={() => {
            handleNavigate(`/desk/${doctype}`);
          }}
          onDelete={() => {
            handleNavigate(`/desk/${doctype}`);
          }}
          onAmend={() => {
            handleNavigate(`/desk/${doctype}/new`);
          }}
        />
      </DetailPageLayout>
    </DeskShell>
  );
}
