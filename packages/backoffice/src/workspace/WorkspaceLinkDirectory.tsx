import { SearchInput, useViewportGtSm } from '@repo/forms';
import { FOCUS_RING_MIN_WIDTH, ensureCompositeFocusRing, useResolvedKnobs } from '@repo/theme';
/**
 * "Browse all" disclosure for the workspace link farm (MOD-11): the grouped
 * link cards render inside one collapsible region with a local type-to-filter
 * input, so 20–30 links stay fully reachable and searchable (capability
 * parity with desk) without owning the top of the landing page. Expanded by
 * default on desktop-width viewports, collapsed on phones and native.
 *
 * LC-71: Filter links SearchInput rings the whole box (magnifier included).
 * The inner native field paints no outline; Accordion content keeps padding
 * so a clip ancestor cannot sever the box ring.
 */
import { EmptyState, Accordion, YStack } from '@repo/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { filterLinkGroup } from './parse-content';
import type { WorkspaceLinkGroup } from './types';
import { WorkspaceGrid } from './WorkspaceGrid';
import type { WorkspaceGridItem } from './WorkspaceGrid';
import { WorkspaceLinkCard } from './WorkspaceLinkCard';

export { filterLinkGroup } from './parse-content';

export interface WorkspaceLinkDirectoryItem {
  /** Stable key from the authored card block. */
  key: string;
  /** Authored 12-column span (defaults to 4, desk's card width). */
  col?: number;
  group: WorkspaceLinkGroup;
}

export interface WorkspaceLinkDirectoryProps {
  items: WorkspaceLinkDirectoryItem[];
}

const DIRECTORY_VALUE = 'links';

export const WorkspaceLinkDirectory = ({ items }: WorkspaceLinkDirectoryProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const viewportGtSm = useViewportGtSm();
  const [filter, setFilter] = useState('');
  // Uncontrolled-once default: open on desktop-width viewports, collapsed on
  // phones/native (SPA render — the viewport is known at first render).
  // Later resizes don't override the user's toggle.
  const [openValue, setOpenValue] = useState(() => (viewportGtSm ? DIRECTORY_VALUE : ''));
  ensureCompositeFocusRing();

  const totalLinks = useMemo(() => items.reduce((sum, item) => sum + item.group.links.length, 0), [items]);

  const filtering = filter.trim().length > 0;

  const filteredItems = useMemo<WorkspaceGridItem[]>(
    () =>
      items.flatMap((item) => {
        const group = filterLinkGroup(item.group, filter);
        if (!group) {
          return [];
        }
        return [
          {
            key: item.key,
            col: item.col ?? 4,
            node: (
              <WorkspaceLinkCard
                group={group}
                collapse={!filtering}
              />
            ),
          },
        ];
      }),
    [items, filter, filtering],
  );

  return (
    <Accordion
      type="single"
      collapsible
      variant="card"
      value={openValue}
      onValueChange={setOpenValue}>
      <Accordion.Item value={DIRECTORY_VALUE}>
        <Accordion.Trigger
          // Count-based plural via i18next suffix resolution ("1 link" /
          // "N links"); defaultValue_* carries the en fallback per form.
          description={t('workspaceBrowseAllCount', {
            count: totalLinks,
            defaultValue_one: '{{count}} link',
            defaultValue_other: '{{count}} links',
          })}>
          {t('workspaceBrowseAll', 'Browse all')}
        </Accordion.Trigger>
        <Accordion.Content>
          <YStack {...knobProps.gap}>
            {/* LC-71: 2px pad = default ring offset, so Accordion's clip
                cannot cut the whole-box ring. Inner Area outline is
                suppressed — the Box (magnifier included) carries it. */}
            <YStack
              padding={FOCUS_RING_MIN_WIDTH}
              overflow="visible"
              data-testid="workspace-filter-links">
              <SearchInput
                value={filter}
                onChange={setFilter}
                debounceMs={0}
                compact
                placeholder={t('workspaceFilterLinks', 'Filter links...')}
                aria-label={t('workspaceFilterLinks', 'Filter links...')}
                inputProps={{
                  className: 'mp-input-area',
                  outlineWidth: 0,
                  outlineStyle: 'none',
                  outlineColor: 'transparent',
                }}
              />
            </YStack>
            {filteredItems.length === 0 ? (
              <EmptyState
                compact
                title={t('workspaceFilterNoMatch', 'No links match "{{query}}"', {
                  query: filter.trim(),
                })}
              />
            ) : (
              <WorkspaceGrid items={filteredItems} />
            )}
          </YStack>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
};
