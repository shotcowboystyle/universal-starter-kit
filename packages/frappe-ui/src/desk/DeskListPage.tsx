/**
 * DeskListPage - Page component for Frappe Desk list views.
 *
 * Composes the canonical `ListPageLayout` page template (LC-29 PAGE-TEMPLATE)
 * inside DeskShell: PageHeader (the page's single h1, DG-A11Y-02), then a
 * flex content region hosting FrappeListView. The list view owns its own
 * filter/search toolbar band and internal scrolling, so the template renders
 * without a page-level scroll container (`scroll={false}`).
 *
 * Accepts `doctype` as a prop (route files read params and pass them through).
 */

import { formCommonColors } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { ListPageLayout, PageHeader } from '@repo/ui';
import type { BreadcrumbItem } from '@repo/ui';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';

import { FrappeListView } from '../FrappeListView';

import { DeskShell } from './DeskShell';
import { addToRecent } from './DeskSidebar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeskListPageProps {
  /** DocType slug from route params (e.g. "pokemon", "poke-type") */
  doctype: string;
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

export function DeskListPage({ doctype, onNavigate }: DeskListPageProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();

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

  const displayName = toDisplayName(doctype);

  const breadcrumbs: BreadcrumbItem[] = [{ label: t('Desk'), href: '/desk' }, { label: displayName }];

  const handleNavigate = (path: string) => {
    onNavigate?.(path);
  };

  const handleItemClick = (doc: Partial<{ name: string; doctype: string }>) => {
    if (!doc.name) {
      return;
    }
    const path = `/desk/${doctype}/${doc.name}`;
    addToRecent({ label: `${displayName}: ${doc.name}`, path });
    handleNavigate(path);
  };

  const handleAdd = () => {
    handleNavigate(`/desk/${doctype}/new`);
  };

  return (
    <DeskShell
      breadcrumbs={breadcrumbs}
      onNavigate={handleNavigate}
      activePath={`/desk/${doctype}`}>
      {/* LC-29 PAGE-TEMPLATE: the canonical list-page scaffold owns max-width,
          padding, and the header/toolbar/content regions. scroll={false}
          because FrappeListView virtualizes and scrolls internally — the
          content region needs a bounded height, not a page ScrollView. */}
      <ListPageLayout
        scroll={false}
        header={
          // DG-A11Y-02: the doctype name is the page's single h1. The list
          // toolbar band below draws its own rule, so no header divider.
          <PageHeader
            title={displayName}
            divider={false}
          />
        }>
        {/* overflow=hidden bounds the flex chain (web min-height:auto) so the
            virtual list gets a fixed viewport instead of growing the page. */}
        <FrappeListView
          doctype={displayName}
          onItemClick={handleItemClick}
          onAdd={handleAdd}
          showToolbar
          overflow="hidden"
        />
      </ListPageLayout>
    </DeskShell>
  );
}
