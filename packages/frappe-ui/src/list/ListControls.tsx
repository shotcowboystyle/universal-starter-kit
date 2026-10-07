import { Badge, Separator, Tooltip, XStack, YStack } from '@repo/ui';
import { Button, SearchInput, Select } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { DiceFiveIcon, HeartIcon } from '@phosphor-icons/react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { FacetRail } from './FacetRail';
import { isListNarrowed } from './listState';
import type { FrappeListControls } from './listState';
import { RangeFilter, rangeCeiling } from './RangeFilter';
import type { ListControlsResult } from './useListControls';

export interface ListControlsProps {
  controls: FrappeListControls;
  list: ListControlsResult;
  /** DOM id of the search box's wrapper, which the "/" shortcut focuses. */
  searchId: string;
  searchPlaceholder?: string;
  showSearch: boolean;
  showFavorites: boolean;
  /** Present when the list offers a random pick. */
  shuffle?: { open: boolean; toggle: () => void; panelId: string };
  /** The random pick, under the search row while open. */
  shufflePanel?: React.ReactNode;
  /** A hairline under the band, when the list below paints no surface. */
  separator: boolean;
  testID: string;
}

const searchBasis = 260;
const searchMinWidth = 220;
const sortMinWidth = 170;
const rangeMaxWidth = 340;

/**
 * The band above a list: search growing on the left, sort, favorites and
 * shuffle anchored right; then one chip rail per facet; then the range
 * sliders with Clear filters. Under sm the search takes its own row.
 */
export function ListControls({
  controls,
  list,
  searchId,
  searchPlaceholder,
  showSearch,
  showFavorites,
  shuffle,
  shufflePanel,
  separator,
  testID,
}: ListControlsProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { state, update, favorites } = list;
  const sorts = controls.sorts ?? [];
  const narrowed = isListNarrowed(state);
  const favoritesLabel = t('Favorites');

  return (
    <>
      <YStack
        {...knobProps.gap}
        testID={`${testID}-controls`}>
        <XStack
          {...knobProps.gap}
          alignItems="center"
          flexWrap="wrap"
          justifyContent="space-between">
          {showSearch ? (
            <XStack
              id={searchId}
              flexGrow={1}
              flexShrink={1}
              flexBasis={searchBasis}
              minWidth={searchMinWidth}
              alignItems="center"
              $max-sm={{ flexBasis: '100%', maxWidth: '100%' }}>
              <YStack
                flexGrow={1}
                flexShrink={1}
                minWidth={0}>
                <SearchInput
                  value={list.searchText}
                  onChange={list.setSearchText}
                  onSearch={(text) => {
                    update({ search: text });
                  }}
                  placeholder={searchPlaceholder ?? t('Search...')}
                  aria-label={searchPlaceholder ?? t('Search...')}
                  debounceMs={200}
                  compact
                  clearable
                />
              </YStack>
            </XStack>
          ) : null}
          <XStack
            {...knobProps.gap}
            alignItems="center"
            flexWrap="wrap"
            $max-sm={{ width: '100%' }}>
            {sorts.length > 0 ? (
              <XStack
                minWidth={sortMinWidth}
                flexGrow={1}
                flexShrink={1}>
                <Select
                  value={state.sort}
                  onChange={(value) => {
                    update({ sort: String(value) });
                  }}
                  options={sorts.map((sort) => ({ label: sort.label, value: sort.value }))}
                  placeholder={t('Sort by')}
                  aria-label={t('Sort by')}
                />
              </XStack>
            ) : null}
            {showFavorites ? (
              <Badge count={favorites.count}>
                <Tooltip content={t('Show only your favorites')}>
                  <Button
                    outlined={!state.favoritesOnly}
                    theme={state.favoritesOnly ? 'accent' : undefined}
                    onPress={() => {
                      update({ favoritesOnly: !state.favoritesOnly });
                    }}
                    aria-pressed={state.favoritesOnly}
                    aria-label={
                      favorites.count > 0 ? t('Favorites ({{count}})', { count: favorites.count }) : favoritesLabel
                    }
                    icon={
                      <HeartIcon
                        size={16}
                        weight={state.favoritesOnly ? 'fill' : 'regular'}
                      />
                    }
                    testID={`${testID}-favorites-filter`}>
                    {favoritesLabel}
                  </Button>
                </Tooltip>
              </Badge>
            ) : null}
            {shuffle ? (
              <Tooltip content={t('Open a random record')}>
                <Button
                  outlined={!shuffle.open}
                  theme={shuffle.open ? 'accent' : undefined}
                  circular
                  onPress={shuffle.toggle}
                  icon={<DiceFiveIcon size={16} />}
                  aria-label={t('Surprise me')}
                  aria-expanded={shuffle.open}
                  aria-controls={shuffle.panelId}
                  testID={`${testID}-shuffle-toggle`}
                />
              </Tooltip>
            ) : null}
          </XStack>
        </XStack>
        {shufflePanel}
        {(controls.facets ?? []).map((facet) => {
          const reading = list.facets[facet.param];
          return (
            <FacetRail
              key={facet.param}
              label={facet.label}
              value={state.facets[facet.param] ?? ''}
              onChange={(value) => {
                update({ facets: { [facet.param]: value } });
              }}
              testID={`${testID}-${facet.param}`}
              options={[
                {
                  value: '',
                  label: facet.allLabel ?? t('All'),
                  count: list.total,
                },
                ...facet.options.map((value) => ({
                  value,
                  label: facet.optionLabel?.(value) ?? value,
                  tint: facet.tint?.(value),
                  count: reading?.counts[value],
                })),
              ]}
            />
          );
        })}
        {(controls.ranges?.length ?? 0) > 0 || narrowed ? (
          <XStack
            {...knobProps.gap}
            alignItems="center"
            flexWrap="wrap"
            justifyContent="space-between">
            {(controls.ranges ?? []).map((range) => (
              <XStack
                key={range.param}
                maxWidth={rangeMaxWidth}
                flexGrow={1}
                $max-sm={{ maxWidth: '100%', width: '100%' }}>
                <RangeFilter
                  label={range.label}
                  value={state.ranges[range.param] ?? 0}
                  max={rangeCeiling(list.highest[range.param] ?? 0)}
                  step={range.step}
                  onChange={(value) => {
                    update({ ranges: { [range.param]: value } });
                  }}
                />
              </XStack>
            ))}
            <XStack
              {...knobProps.gap}
              alignItems="center"
              flexShrink={0}>
              {narrowed ? (
                <Button
                  size="$2"
                  chromeless
                  onPress={list.clear}
                  testID={`${testID}-clear`}>
                  {t('Clear filters')}
                </Button>
              ) : null}
            </XStack>
          </XStack>
        ) : null}
      </YStack>
      {separator ? <Separator /> : null}
    </>
  );
}
