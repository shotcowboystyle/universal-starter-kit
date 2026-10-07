/**
 * Workspace link card — desk parity for the `card` content block: a titled
 * card listing the Link rows that follow the matching "Card Break" row in
 * the `links` child table. DocType links navigate to the doctype list;
 * Report/Page links go through the slug router best-effort (see
 * `resolveLinkTarget`).
 *
 * LC-72 CONTAINER-CLIP: the Card frame is the stacked group. Rows stay
 * square; overflow:hidden on the card cuts the last row's hover/ring to
 * the outer radius. Keyboard ring is inset so the clip does not sever it
 * (LC-71). Desk's Card Break `link_count` collapses long lists behind
 * "+ N more" (capability parity with the links widget).
 *
 * Rendering gates: link rows targeting doctypes outside the provider's
 * `doctypes` scope are hidden, and DocType/Report rows (list-surface
 * navigations) are hidden entirely when the `views` capability is off.
 */
import { Card, Text, XStack, YStack } from '@repo/ui';
import { ensureFocusVisibleRing, getGroupPosition, useResolvedKnobs } from '@repo/theme';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBackofficeCapabilities,
  useBackofficeNavigator,
  useBackofficePaths,
  useIsDoctypeAllowed,
} from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { createBackofficePaths } from '../navigation/paths';
import type { BackofficePaths } from '../navigation/paths';

import { collapseLinkRows } from './parseContent';
import type { WorkspaceLinkGroup, WorkspaceLinkRow } from './types';

const defaultPaths = createBackofficePaths();

/**
 * Resolve a Workspace Link row to a router path (basePath-aware when the
 * provider's `paths` are passed; defaults to the canonical "/backoffice").
 * - DocType → paths.list(link_to)
 * - Report → paths.list(link_to) fallback (no query-report route yet — the
 *   slug router decides; documented gap)
 * - Page → `{base}/<link_to>` (page names are already slugs)
 * - anything else → disabled
 */
export function resolveLinkTarget(
  row: WorkspaceLinkRow,
  paths: BackofficePaths = defaultPaths,
): {
  path?: string;
  disabled?: boolean;
} {
  const target = row.link_to ?? '';
  if (!target) {
    return { disabled: true };
  }
  const prefix = paths.base === '/' ? '' : paths.base;
  switch (row.link_type) {
    case 'DocType': {
      return { path: paths.list(target) };
    }
    case 'Report': {
      return { path: paths.list(target) };
    }
    case 'Page': {
      return { path: `${prefix}/${target}` };
    }
    default: {
      return { disabled: true };
    }
  }
}

function activateOnEnterOrSpace(onPress: () => void) {
  return ((e: { key?: string; preventDefault?: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.();
      onPress();
    }
  }) as unknown as () => void;
}

function LinkRow({
  row,
  index,
  total,
  pad,
}: {
  row: WorkspaceLinkRow;
  index: number;
  total: number;
  pad: string | number;
}) {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { knobProps } = useResolvedKnobs();
  const target = resolveLinkTarget(row, paths);
  const position = getGroupPosition(index, total);
  const disabled = !!target.disabled;
  const go = () => {
    if (!disabled && target.path) {
      navigator.navigate(target.path);
    }
  };
  return (
    <XStack
      onPress={disabled ? undefined : go}
      disabled={disabled}
      opacity={disabled ? 0.5 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      paddingVertical="$1.5"
      paddingHorizontal={pad}
      minHeight="$3"
      alignItems="center"
      role="link"
      aria-label={row.label}
      overflow="hidden"
      borderRadius={0}
      {...{ 'data-group-position': position }}
      hoverStyle={disabled ? undefined : { backgroundColor: '$color3' }}
      pressStyle={disabled ? undefined : { backgroundColor: '$color4' }}
      tabIndex={disabled ? undefined : 0}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      onKeyDown={disabled ? undefined : activateOnEnterOrSpace(go)}>
      <Text
        {...knobProps.label}
        fontWeight="400"
        color={disabled ? '$color10' : '$color12'}
        numberOfLines={1}
        flexShrink={1}>
        {row.label}
      </Text>
    </XStack>
  );
}

export interface WorkspaceLinkCardProps {
  group: WorkspaceLinkGroup;
  /**
   * When true (default), honor Card Break `link_count` and collapse extra
   * links behind "+ N more". The directory turns this off while a filter
   * is active so matching rows are never hidden.
   */
  collapse?: boolean;
}

export function WorkspaceLinkCard({ group, collapse = true }: WorkspaceLinkCardProps) {
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { views } = useBackofficeCapabilities();
  const isDoctypeAllowed = useIsDoctypeAllowed();
  const [expanded, setExpanded] = useState(false);
  const pad = knobProps.panelPadding.padding;

  // Visibility gates: doctype scope + the views capability (DocType/Report
  // rows navigate to list surfaces). Defaults (scope open, views on) keep
  // every authored row, desk parity.
  const visibleLinks = group.links.filter((row) => {
    if (row.link_type === 'DocType' || row.link_type === 'Report') {
      if (!views.enabled) {
        return false;
      }
      if (row.link_type === 'DocType' && row.link_to && !isDoctypeAllowed(row.link_to)) {
        return false;
      }
    }
    return true;
  });

  const preview = collapseLinkRows(visibleLinks, group.breakRow.link_count, {
    collapse,
    expanded,
  });
  const { shown } = preview;
  const { hiddenCount } = preview;
  const { showMore } = preview;
  const rowTotal = shown.length + (showMore ? 1 : 0);

  return (
    // LC-10 FRAME-CONTAINMENT: no `height="100%"` — a cyclic percentage
    // against the auto-height grid row zeroed the card's intrinsic height
    // (with the basis-0 inner column) and the links painted past the card
    // border. flexGrow (basis auto) equalizes heights in the stretched grid
    // cell while the content keeps its intrinsic size.
    //
    // LC-72 CONTAINER-CLIP: eject Card's default panelPadding so link-row
    // hover/ring can span the frame; overflow:hidden cuts the last row to
    // the card radius. Caption keeps its own inset.
    <Card
      flexGrow={1}
      padding={0}
      overflow="hidden">
      <YStack
        paddingHorizontal={pad}
        paddingTop={pad}
        paddingBottom="$2">
        {/* Catalog list-group caption (Sidebar section-label treatment):
            small-caps muted label, no underline rule — a full-width rule
            under uneven columns read as table chrome (Axiom 16). */}
        <Text
          {...knobProps.label}
          fontWeight="400"
          textTransform="uppercase"
          color="$color11">
          {group.label}
        </Text>
      </YStack>
      {visibleLinks.length === 0 ? (
        <YStack
          paddingHorizontal={pad}
          paddingBottom={pad}>
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('workspaceCardEmpty', 'No links in this section')}
          </Text>
        </YStack>
      ) : (
        <YStack paddingBottom={showMore ? 0 : undefined}>
          {shown.map((row, index) => (
            <LinkRow
              key={row.name}
              row={row}
              index={index}
              total={rowTotal}
              pad={pad}
            />
          ))}
          {showMore ? (
            <XStack
              onPress={() => {
                setExpanded((value) => !value);
              }}
              cursor="pointer"
              paddingVertical="$1.5"
              paddingHorizontal={pad}
              minHeight="$3"
              alignItems="center"
              role="button"
              aria-expanded={expanded}
              overflow="hidden"
              borderRadius={0}
              {...{ 'data-group-position': getGroupPosition(shown.length, rowTotal) }}
              hoverStyle={{ backgroundColor: '$color3' }}
              pressStyle={{ backgroundColor: '$color4' }}
              tabIndex={0}
              outlineWidth={0}
              focusStyle={{ outlineWidth: 0 }}
              focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
              onKeyDown={activateOnEnterOrSpace(() => {
                setExpanded((value) => !value);
              })}>
              <Text
                {...knobProps.label}
                fontWeight="400"
                color="$color11">
                {expanded
                  ? t('workspaceCardShowLess', 'Show less')
                  : t('workspaceCardMore', '+ {{count}} more', { count: hiddenCount })}
              </Text>
            </XStack>
          ) : null}
        </YStack>
      )}
    </Card>
  );
}
