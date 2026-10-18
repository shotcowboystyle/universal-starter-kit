import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import {
  BarSeries,
  ChartSurface,
  Text,
  Tooltip,
  XAxis,
  XStack,
  YAxis,
  YStack,
  approximateTextWidth,
  createBandScale,
  createLinearScale,
  describeChart,
  formatChartValue,
  getLinearTicks,
  useChartTheme,
} from '@repo/ui';
import type { ChartDatum } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { childBars } from './recordData';
import type { FrappeRecordBarsSection } from './recordSections';

const chartHeight = 220;
const chartTicks = 4;

/**
 * Bars on a domain pinned to 0..max, composed from the catalog chart
 * primitives: the packaged BarChart scales to each dataset's own maximum,
 * which makes two records' bars incomparable. `nice: false` keeps the
 * ceiling exactly `max`.
 */
function FixedScaleBars({
  data,
  max,
  label,
  testID,
}: {
  data: ChartDatum[];
  max: number;
  label: string;
  testID?: string;
}) {
  const { palette, labelFontSize } = useChartTheme();
  const fills = data.map(() => palette.single);
  const domain: [number, number] = [0, max];
  return (
    <ChartSurface
      label={label}
      height={chartHeight}
      testID={testID}>
      {(size) => {
        const marginScale = createLinearScale({ domain, range: [0, 1], nice: false });
        const tickLabels = getLinearTicks(marginScale, chartTicks).map((value) => formatChartValue(value));
        const widestTick = Math.max(0, ...tickLabels.map((tick) => approximateTextWidth(tick, labelFontSize)));
        const top = Math.ceil(labelFontSize / 2) + 2;
        const right = 4;
        const bottom = 4 + 3 + Math.ceil(labelFontSize * 1.15);
        const left = Math.ceil(widestTick) + 4 + 3 + 2;
        const plot = {
          x: left,
          y: top,
          width: Math.max(0, size.width - left - right),
          height: Math.max(0, size.height - top - bottom),
        };
        if (plot.width <= 0 || plot.height <= 0 || data.length === 0) {
          return null;
        }
        const xScale = createBandScale({
          domain: data.map((datum) => datum.label),
          range: [plot.x, plot.x + plot.width],
        });
        const yScale = createLinearScale({
          domain,
          range: [plot.y + plot.height, plot.y],
          nice: false,
        });
        return (
          <>
            <YAxis
              plot={plot}
              scale={yScale}
              ticks={chartTicks}
              tickFormat={(value) => formatChartValue(value)}
            />
            <BarSeries
              data={data}
              xScale={xScale}
              yScale={yScale}
              plot={plot}
              fills={fills}
            />
            <XAxis
              plot={plot}
              scale={xScale}
            />
          </>
        );
      }}
    </ChartSurface>
  );
}

/**
 * A child table's numbers as bars on one shared scale: the sum above, the
 * chart, then each exact value in a chip (the axis only approximates).
 */
export function RecordBars({
  rows,
  section,
  testID,
}: {
  rows: readonly Record<string, unknown>[];
  section: FrappeRecordBarsSection;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { knobProps: nested } = useResolvedKnobs({ compact: true });
  const { bars, total } = childBars(rows, section);
  const name = (key: string) => section.barLabel?.(key) ?? key;
  const data = bars.map((bar) => ({ label: name(bar.key), value: bar.value }));

  if (bars.length === 0) {
    return (
      <Text
        {...nested.label}
        {...nested.body}
        color="$color10">
        {section.empty ?? t('None yet')}
      </Text>
    );
  }

  return (
    <YStack {...knobProps.gapLg}>
      <XStack
        {...knobProps.gap}
        alignItems="baseline"
        justifyContent="space-between"
        flexWrap="wrap">
        <YStack>
          <Text
            {...nested.label}
            color="$color10"
            textTransform="uppercase"
            letterSpacing={1}>
            {section.totalLabel ?? t('Total')}
          </Text>
          <Text
            fontSize="$10"
            fontWeight="700">
            {total}
          </Text>
        </YStack>
        {section.description ? (
          <Text
            {...nested.label}
            color="$color10"
            flexShrink={1}
            maxWidth={sizeRecipeEscape(420, 'chart caption: a readable measure beside the total')}>
            {section.description}
          </Text>
        ) : null}
      </XStack>
      <FixedScaleBars
        data={data}
        max={section.max}
        testID={testID}
        label={[
          describeChart({ typeLabel: t('Bar chart'), title: section.title, data }),
          t('Values on a fixed 0 to {{max}} scale.', { max: section.max }),
        ].join(' ')}
      />
      <XStack
        {...nested.gap}
        flexWrap="wrap">
        {bars.map((bar) => (
          <Tooltip
            key={bar.key}
            content={t('{{name}}: {{value}}', { name: name(bar.key), value: bar.value })}>
            <XStack
              {...nested.borderRadius}
              backgroundColor="$color2"
              borderWidth={0}
              paddingHorizontal="$2"
              paddingVertical="$0.5"
              gap="$1"
              alignItems="baseline"
              cursor="help">
              <Text
                {...nested.label}
                {...nested.body}
                color="$color10">
                {name(bar.key)}
              </Text>
              <Text
                {...nested.label}
                fontWeight="700">
                {bar.value}
              </Text>
            </XStack>
          </Tooltip>
        ))}
      </XStack>
    </YStack>
  );
}
