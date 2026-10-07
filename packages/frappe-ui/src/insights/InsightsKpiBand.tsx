import { KPICard, Sparkline, Text, XStack, YStack } from '@repo/ui';
import type { ChartConfig, KPICardConfig } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';

import { ChartCard } from '../ChartCard';

export interface InsightsTile {
  id: string;
  title: string;
  value: string | number;
  hint?: string;
  spark?: number[];
}

export interface InsightsKpiBandProps {
  hero: KPICardConfig;
  tiles: readonly InsightsTile[];
  charts: readonly ChartConfig[];
  testID?: string;
}

/**
 * A supporting metric beside the hero (LC-73): compact density and the
 * label type, painted below the page's 44px floor.
 */
function NestedKpi({ tile, testID }: { tile: InsightsTile; testID?: string }) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const nestedPx = knobProps.nestedControl.px;
  return (
    <YStack
      {...knobProps.cardSurface}
      backgroundColor="$color2"
      flexGrow={1}
      flexShrink={1}
      flexBasis={140}
      minWidth={0}
      justifyContent="space-between"
      {...knobProps.gap}
      data-nested-px={nestedPx}
      testID={testID}>
      <Text
        {...knobProps.label}
        color="$color10"
        numberOfLines={1}>
        {tile.title}
      </Text>
      <Text
        fontSize="$7"
        fontWeight="700"
        color="$color"
        numberOfLines={1}>
        {tile.value}
      </Text>
      {tile.hint ? (
        <Text
          {...knobProps.label}
          color="$color10"
          numberOfLines={1}>
          {tile.hint}
        </Text>
      ) : null}
      {tile.spark && tile.spark.length > 1 ? (
        <Sparkline
          data={tile.spark}
          height={nestedPx}
          showArea
          title={tile.title}
        />
      ) : null}
    </YStack>
  );
}

/**
 * The hero count with its denser companions, then the charts. Rows wrap on
 * flexBasis rather than riding the catalog Dashboard grid, whose percent
 * widths plus its gap overflow a row that sums to 100%. Every child shrinks
 * so a line narrower than one tile stays inside its frame (LC-10).
 */
export function InsightsKpiBand({ hero, tiles, charts, testID }: InsightsKpiBandProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gapLg}
      testID={testID}>
      <XStack
        {...knobProps.gap}
        flexWrap="wrap"
        alignItems="stretch">
        <KPICard
          config={hero}
          flexGrow={2}
          flexShrink={1}
          flexBasis={260}
        />
        {tiles.length > 0 ? (
          <XStack
            {...knobProps.gap}
            flexWrap="wrap"
            flexGrow={3}
            flexShrink={1}
            flexBasis={420}
            minWidth={0}>
            {tiles.map((tile) => (
              <NestedKpi
                key={tile.id}
                tile={tile}
                testID={testID ? `${testID}-kpi-${tile.id}` : undefined}
              />
            ))}
          </XStack>
        ) : null}
      </XStack>
      {charts.length > 0 ? (
        <XStack
          {...knobProps.gap}
          flexWrap="wrap"
          alignItems="stretch">
          {charts.map((chart, index) => (
            <ChartCard
              key={chart.id}
              config={chart}
              flexGrow={index === 0 ? 3 : 2}
              flexShrink={1}
              flexBasis={index === 0 ? 420 : 320}
              minWidth={0}
              minHeight={240}
            />
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}
