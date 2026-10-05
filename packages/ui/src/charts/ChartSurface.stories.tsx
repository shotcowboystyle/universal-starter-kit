import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { Card } from '../surfaces';

import { ChartSurface } from './ChartSurface';
import { createBandScale, createLinearScale } from './math';
import { Circle, Line, Rect } from './svg';
import type { ChartSize } from './types';
import { useChartTheme } from './useChartTheme';

const bars = [
  { label: 'Mon', value: 3 },
  { label: 'Tue', value: 7 },
  { label: 'Wed', value: 5 },
  { label: 'Thu', value: 9 },
  { label: 'Fri', value: 6 },
];

/**
 * The point of the surface is that children get PIXELS, not a 0-100 viewBox:
 * scales resolve against the measured viewport, so strokes stay 1px and hit
 * targets stay honest at any container width.
 */
function Marks({ size }: { size: ChartSize }) {
  const { palette, gridColor } = useChartTheme();
  const x = createBandScale({
    domain: bars.map((bar) => bar.label),
    range: [8, size.width - 8],
  });
  const y = createLinearScale({ domain: [0, 10], range: [size.height - 8, 8] });
  return (
    <>
      <Line x1={8} y1={size.height - 8} x2={size.width - 8} y2={size.height - 8} stroke={gridColor} strokeWidth={1} />
      {bars.map((bar) => (
        <Rect
          key={bar.label}
          x={x(bar.label) ?? 0}
          y={y(bar.value)}
          width={x.bandwidth()}
          height={size.height - 8 - y(bar.value)}
          fill={palette.single}
        />
      ))}
    </>
  );
}

function Dots({ size }: { size: ChartSize }) {
  const { palette } = useChartTheme();
  return (
    <>
      {bars.map((bar, index) => (
        <Circle
          key={bar.label}
          cx={((index + 1) / (bars.length + 1)) * size.width}
          cy={size.height / 2}
          r={6 + index * 2}
          fill={palette.categorical[index % palette.categorical.length]}
        />
      ))}
    </>
  );
}

const meta: Meta<typeof ChartSurface> = {
  title: 'Components/ChartSurface',
  component: ChartSurface,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The responsive SVG viewport every chart in this package draws into. It measures its own width through `onLayout` (ResizeObserver-backed on web) and hands children a pixel-space `{ width, height }`, so scales land on real device pixels: strokes stay crisp, nothing is stretched by `preserveAspectRatio`, and a 44px touch target really is 44px. `label` is the generated accessible summary and renders as `role="img"`, so the chart is one described image rather than a pile of unlabelled shapes. Pass an explicit `width` to bypass measurement for SSR, tests, and fixed layouts. The draw-in fade drops entirely at `animation="none"` or OS reduced motion.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    height: { control: { type: 'range', min: 80, max: 320, step: 10 } },
    width: { control: 'number' },
  },
};
export default meta;

type Story = StoryObj<typeof ChartSurface>;

export const Default: Story = {
  name: 'Main',
  args: { label: 'Sessions per weekday, peaking Thursday at 9.', height: 200 },
  render: (args) => (
    <YStack maxWidth={560}>
      <Card>
        <ChartSurface {...args}>{(size) => <Marks size={size} />}</ChartSurface>
      </Card>
    </YStack>
  ),
};

export const Responsive: Story = {
  name: 'Tracks the container',
  parameters: {
    docs: {
      description: {
        story:
          'Same surface, three container widths. No `width` prop: each instance measures its own parent, so the band scale re-solves instead of scaling a fixed viewBox.',
      },
    },
  },
  render: () => (
    <YStack gap="$4">
      {[520, 320, 200].map((width) => (
        <Card key={width} width={width}>
          <YStack gap="$2">
            <Paragraph size="$2">{`${width}px container`}</Paragraph>
            <ChartSurface label={`Sessions per weekday at ${width}px`} height={140}>
              {(size) => <Marks size={size} />}
            </ChartSurface>
          </YStack>
        </Card>
      ))}
    </YStack>
  ),
};

export const FixedWidth: Story = {
  name: 'Explicit width',
  parameters: {
    docs: {
      description: {
        story:
          'An explicit `width` bypasses measurement entirely — the path SSR and tests take, where no layout pass ever runs.',
      },
    },
  },
  render: () => (
    <Card alignSelf="flex-start">
      <ChartSurface label="Five categorical dots" width={360} height={120}>
        {(size) => <Dots size={size} />}
      </ChartSurface>
    </Card>
  ),
};
