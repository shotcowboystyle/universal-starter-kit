import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, Theme, XStack, YStack } from 'tamagui';

import { Card } from '../surfaces';
import { KPICard } from '../views/Dashboard';

import { BarChart } from './BarChart';
import { ChartDataView } from './ChartDataView';
import { AreaChart, LineChart } from './LineChart';
import { PieChart } from './PieChart';
import { Sparkline } from './Sparkline';
import { chartWebProps } from './svg';
import type { ChartDatum } from './types';

const monthly: ChartDatum[] = [
  { label: 'Jan', value: 420 },
  { label: 'Feb', value: 380 },
  { label: 'Mar', value: 640 },
  { label: 'Apr', value: 520 },
  { label: 'May', value: 870 },
  { label: 'Jun', value: 760 },
];

const categories: ChartDatum[] = [
  { label: 'Open', value: 34 },
  { label: 'In Progress', value: 21 },
  { label: 'Blocked', value: 8 },
  { label: 'Review', value: 13 },
  { label: 'Done', value: 55 },
];

const trend = [4, 6, 5, 9, 7, 11, 10, 14, 12, 16];

const meta: Meta = {
  title: 'Components/Charts',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Universal chart catalog: headless d3 math rendered through react-native-svg (plain inline SVG on web). Series colors come from the canonical chart palette; chrome follows knobs and the theme ramps.',
      },
    },
  },
};
export default meta;

export const Bar = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <BarChart data={monthly} title="Revenue" onDatumPress={action('onDatumPress')} />
    </YStack>
  ),
};

export const BarCategorical = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <BarChart data={categories} categorical title="Tickets by status" />
    </YStack>
  ),
};

export const Line = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <LineChart data={monthly} title="Revenue" onDatumPress={action('onDatumPress')} />
    </YStack>
  ),
};

export const Area = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <AreaChart data={monthly} curve="monotone" title="Revenue" />
    </YStack>
  ),
};

export const Pie = {
  render: () => (
    <YStack maxWidth={560}>
      <PieChart data={categories} title="Tickets by status" onDatumPress={action('onDatumPress')} />
    </YStack>
  ),
};

export const Donut = {
  render: () => (
    <YStack maxWidth={560}>
      <PieChart data={categories} donut title="Tickets by status" />
    </YStack>
  ),
};

export const GapBoundaries = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <PieChart data={categories} height={160} title="Pie boundary gaps" />
      <PieChart data={categories} height={160} donut title="Donut boundary gaps" />
    </YStack>
  ),
};

export const GapThinSlices = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <PieChart
        data={[
          { label: 'Large', value: 9999 },
          { label: 'Small', value: 1 },
        ]}
        title="Thin positive slice preserved"
      />
      <PieChart
        data={[
          { label: 'Large', value: 9999 },
          { label: 'Small', value: 1 },
        ]}
        donut
        title="Thin positive donut preserved"
      />
    </YStack>
  ),
};

export const GapSingleDatum = {
  render: () => <PieChart data={[{ label: 'Only', value: 100 }]} title="Single full circle" />,
};

export const GapExplicitZero = {
  render: () => <PieChart data={categories} padAngle={0} title="Explicit touching slices" />,
};

export const SparklineRow = {
  name: 'Sparkline',
  render: () => (
    <XStack maxWidth={560} gap="$4" alignItems="center">
      <ChartDataView data={trend} title="Weekly active">
        {({ action, data }) => (
          <YStack flex={1} gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize="$2">Weekly active</Text>
              {action}
            </XStack>
            <Sparkline data={data} title="Weekly active" />
          </YStack>
        )}
      </ChartDataView>
      <ChartDataView data={trend} title="No area">
        {({ action, data }) => (
          <YStack flex={1} gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize="$2">No area</Text>
              {action}
            </XStack>
            <Sparkline data={data} showArea={false} title="Weekly active" />
          </YStack>
        )}
      </ChartDataView>
    </XStack>
  ),
};

/** Explicit data colors are values, not chrome — they pass through (Axiom 11). */
export const DataColors = {
  render: () => (
    <YStack maxWidth={560} gap="$4">
      <BarChart
        data={[
          { label: 'A', value: 30, color: '#8250df' },
          { label: 'B', value: 45, color: '#1a7f37' },
          { label: 'C', value: 25 },
        ]}
        title="Explicit data colors"
      />
    </YStack>
  ),
};

export const DarkScheme = {
  render: () => (
    <Theme name="dark">
      <Card maxWidth={560}>
        <YStack gap="$4">
          <BarChart data={monthly} title="Revenue" />
          <PieChart data={categories} donut title="Tickets by status" />
        </YStack>
      </Card>
    </Theme>
  ),
};

export const TintRed = {
  render: () => (
    <Theme name="red">
      <Card maxWidth={560}>
        <YStack gap="$4">
          <BarChart data={monthly} title="Revenue" />
          <LineChart data={monthly} title="Revenue" />
          <PieChart data={categories} title="Tickets by status" />
        </YStack>
      </Card>
    </Theme>
  ),
};

export const TintGray = {
  render: () => (
    <Theme name="gray">
      <Card maxWidth={560}>
        <YStack gap="$4">
          <BarChart data={monthly} title="Revenue" />
          <PieChart data={categories} title="Tickets by status" />
        </YStack>
      </Card>
    </Theme>
  ),
};

/** animation=none: no draw-in, no motion (A-CONTINUOUS floor). */
export const AnimationNone = {
  render: () => (
    <Preset overrides={{ animation: 'none' }}>
      <YStack maxWidth={560} gap="$4">
        <BarChart data={monthly} title="Revenue" />
        <AreaChart data={monthly} title="Revenue" />
      </YStack>
    </Preset>
  ),
};

/** Phone-width column — nothing overflows or clips at 320px. */
export const NarrowViewport = {
  render: () => (
    <YStack width={320} gap="$4">
      <BarChart data={monthly} title="Revenue" />
      <LineChart data={monthly} title="Revenue" />
      <PieChart data={categories} donut title="Tickets by status" />
      <ChartDataView data={trend} title="Weekly active">
        {({ action, data }) => (
          <YStack gap="$2">
            <XStack justifyContent="space-between">
              <Text>Weekly active</Text>
              {action}
            </XStack>
            <Sparkline data={data} title="Weekly active" />
          </YStack>
        )}
      </ChartDataView>
    </YStack>
  ),
};

export const CompleteDataView = {
  render: () => (
    <YStack width="100%" maxWidth={560} gap="$4">
      <BarChart
        data={Array.from({ length: 13 }, (_, index) => ({
          label: `Region ${index + 1}`,
          value: (index + 1) * 125,
        }))}
        title="Regional revenue"
        label="Regional revenue overview"
      />
      <ChartDataView
        data={Array.from({ length: 80 }, (_, index) => ({
          label: `Day ${index + 1}`,
          value: index * 3 + 1,
        }))}
        title="Daily activity">
        {({ action, data }) => (
          <YStack gap="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text>Daily activity</Text>
              {action}
            </XStack>
            <Sparkline data={data} title="Daily activity" showArea={false} />
          </YStack>
        )}
      </ChartDataView>
    </YStack>
  ),
};

function MetricDataHarness({
  longTitle = false,
  consumerPress = false,
}: {
  longTitle?: boolean;
  consumerPress?: boolean;
}) {
  const [navigationCount, setNavigationCount] = useState(0);
  const [consumerCount, setConsumerCount] = useState(0);
  return (
    <YStack width="100%" maxWidth={360} gap="$3">
      <KPICard
        config={{
          id: 'revenue',
          title: longTitle ? 'Revenue from annual enterprise subscriptions' : 'Revenue',
          value: 240000,
          format: 'currency',
          sparkline: trend,
          onClick: () => {
            setNavigationCount((count) => count + 1);
          },
        }}
        {...(consumerPress
          ? {
              onPress: () => {
                setConsumerCount((count) => count + 1);
              },
            }
          : {})}
      />
      <Text>{`Metric navigation count: ${navigationCount}`}</Text>
      {consumerPress ? <Text>{`Consumer navigation count: ${consumerCount}`}</Text> : null}
    </YStack>
  );
}
export const MetricDataActions = { render: () => <MetricDataHarness /> };

export const GapPatternBackdrop = {
  render: () => (
    <YStack width="100%" maxWidth={560} gap="$4">
      {[false, true].map((donut) => (
        <YStack key={String(donut)} position="relative" {...chartWebProps({ 'data-mpo-chart-backdrop': 'patterned' })}>
          <YStack position="absolute" top={0} left={0} width={160} height={160} pointerEvents="none">
            {Array.from({ length: 10 }, (_, index) => (
              <YStack key={index} height={16} backgroundColor={index % 2 ? '$color5' : '$color2'} />
            ))}
          </YStack>
          <PieChart
            data={categories}
            height={160}
            donut={donut}
            title={donut ? 'Donut on striped backdrop' : 'Pie on striped backdrop'}
          />
        </YStack>
      ))}
    </YStack>
  ),
};

export const MetricDataLongTitle = { render: () => <MetricDataHarness longTitle /> };
export const MetricDataPressOverride = { render: () => <MetricDataHarness consumerPress /> };

export const FixedWidthData = {
  render: () => {
    const data = [
      {
        label: 'International enterprise subscriptions for the previous fiscal year',
        value: 12345678901234,
      },
      {
        label: 'Domestic enterprise subscriptions for the current fiscal year',
        value: 23456789012345,
      },
      { label: 'Unbroken formatted value', value: 1 },
    ];
    const valueFormatter = (value: number) =>
      value === 1 ? '1'.repeat(120) : `${value.toFixed(2)} USD per reporting quarter`;
    return (
      <YStack width="100%" maxWidth={900} gap="$4">
        <BarChart
          width={300}
          data={data}
          title="Fixed width revenue"
          label="Revenue bars"
          valueFormatter={valueFormatter}
          showXAxis={false}
          showYAxis={false}
        />
        <LineChart
          width={300}
          data={data}
          title="Fixed width trend"
          label="Revenue trend"
          valueFormatter={valueFormatter}
          showXAxis={false}
          showYAxis={false}
        />
      </YStack>
    );
  },
};
