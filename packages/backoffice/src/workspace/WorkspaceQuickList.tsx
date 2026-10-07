/**
 * Workspace quick list block — a compact live list of a doctype with the
 * row's `quick_list_filter` applied, plus a "View All" jump to the full
 * list page. Rows navigate to the document form. Rows show the document
 * name — desk shows the meta title field, which needs a DocType meta
 * fetch (documented simplification).
 */
import { Card, Separator, Text, XStack, YStack } from '@repo/ui';
import { FrappeList } from '@repo/frappe-ui';
import {
  TOUCH_HEIGHT_FLOOR,
  ensureFocusVisibleRing,
  FOCUS_RING_HALO_OFFSET,
  useResolvedKnobs,
} from '@repo/theme';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { parseFrappeFilters } from './parseContent';
import type { WorkspaceQuickListRow } from './types';

interface QuickListDoc {
  name: string;
  doctype: string;
}

// Generic JSX (`<FrappeList<QuickListDoc> …/>`) breaks one-dev's source
// annotation transform; instantiate the type argument outside JSX instead.
const QuickList = FrappeList<QuickListDoc>;

/** Fixed viewport for the compact list (~4 rows + load-more headroom). */
const QUICK_LIST_HEIGHT = 220;

export interface WorkspaceQuickListProps {
  row: WorkspaceQuickListRow;
}

export function WorkspaceQuickList({ row }: WorkspaceQuickListProps) {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);

  const filters = useMemo(() => parseFrappeFilters(row.quick_list_filter), [row.quick_list_filter]);

  const title = row.label ?? row.document_type;

  const pad = knobProps.panelPadding.padding;

  return (
    // LC-72 CONTAINER-CLIP: Card clips list-row hover/ring to the frame
    // radius. Default Card padding is ejected so rows can span the box;
    // the header keeps its own inset.
    <Card
      flexGrow={1}
      padding={0}
      overflow="hidden">
      <YStack
        paddingHorizontal={pad}
        paddingTop={pad}
        paddingBottom="$2"
        {...knobProps.gap}>
        <XStack
          justifyContent="space-between"
          alignItems="center"
          {...knobProps.gap}>
          <Text
            {...knobProps.heading}
            fontWeight="400"
            numberOfLines={1}
            flexShrink={1}>
            {title}
          </Text>
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color11"
            cursor="pointer"
            role="link"
            tabIndex={0}
            outlineWidth={0}
            focusStyle={{ outlineWidth: 0 }}
            // LC-71 §4 halo: inline text link ("View All" sits on the header
            // row beside the section title, not on its own ground).
            focusVisibleStyle={ensureFocusVisibleRing({
              outlineOffset: FOCUS_RING_HALO_OFFSET,
            })}
            hoverStyle={{ color: '$color12' }}
            onPress={() => {
              navigator.navigate(paths.list(row.document_type));
            }}>
            {t('workspaceQuickListViewAll', 'View All')}
          </Text>
        </XStack>
        <Separator />
      </YStack>
      {/* Fixed-height box: FrappeList's internal flex-basis:0 stack
          contributes no intrinsic height, so an unclamped Card collapses
          and the rows paint past the frame (LC-10). The box gives the
          flex chain a definite height to fill. Rows stay square — this
          box is the LC-72 clip container. */}
      <YStack
        height={QUICK_LIST_HEIGHT}
        overflow="hidden">
        <QuickList
          doctype={row.document_type}
          fields={['name']}
          filters={filters as ['name', string, unknown][] | undefined}
          pageSize={4}
          height={QUICK_LIST_HEIGHT}
          estimateSize={44}
          aria-label={title}
          renderItem={(item) => (
            <XStack
              paddingVertical="$2"
              paddingHorizontal={pad}
              minHeight={TOUCH_HEIGHT_FLOOR}
              alignItems="center"
              cursor="pointer"
              overflow="hidden"
              borderRadius={0}
              hoverStyle={{ backgroundColor: '$color3' }}
              pressStyle={{ backgroundColor: '$color4' }}
              tabIndex={0}
              outlineWidth={0}
              focusStyle={{ outlineWidth: 0 }}
              focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
              onPress={() => item.name && navigator.navigate(paths.form(row.document_type, item.name))}
              role="link"
              aria-label={item.name}>
              <Text
                {...knobProps.label}
                fontWeight="400"
                numberOfLines={1}
                flexShrink={1}>
                {item.name}
              </Text>
            </XStack>
          )}
        />
      </YStack>
    </Card>
  );
}
