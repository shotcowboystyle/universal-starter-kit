import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { Card } from '../surfaces';

import { XAxis, YAxis } from './Axis';
import { ChartSurface } from './ChartSurface';
import { computeCartesianPlot } from './composeChart';
import { createBandScale, createLinearScale, formatAxisTick, getLinearTicks } from './math';
import type { ChartSize } from './types';
import { useChartTheme } from './useChartTheme';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const longLabels = ['Engineering', 'Customer Success', 'Finance and Legal', 'People Operations', 'Infrastructure'];

interface AxisFrameProps {
  size: ChartSize;
  categories: string[];
  domain: [number, number];
  showXLabels?: boolean;
  showYGrid?: boolean;
  showYLine?: boolean;
  showYTicks?: boolean;
  yTicks?: number;
}

/**
 * Both axes drawn against a real plot rectangle. The left margin is derived
 * from the widest y tick LABEL (computeCartesianPlot), not a magic number, so
 * the axis never clips its own text.
 */
function AxisFrame({
  size,
  categories,
  domain,
  showXLabels = true,
  showYGrid = true,
  showYLine = false,
  showYTicks = false,
  yTicks = 4,
}: AxisFrameProps) {
  const { labelFontSize } = useChartTheme();
  const marginScale = createLinearScale({ domain, range: [0, 1] });
  const tickValues = getLinearTicks(marginScale, yTicks);
  const plot = computeCartesianPlot(size, {
    showXAxis: true,
    showYAxis: true,
    yTickLabels: tickValues.map((value) => formatAxisTick(value)),
    fontSize: labelFontSize,
  });
  if (plot.width <= 0 || plot.height <= 0) {
    return null;
  }
  const xScale = createBandScale({
    domain: categories,
    range: [plot.x, plot.x + plot.width],
  });
  const yScale = createLinearScale({
    domain,
    range: [plot.y + plot.height, plot.y],
  });
  return (
    <>
      <YAxis
        plot={plot}
        scale={yScale}
        ticks={yTicks}
        showGrid={showYGrid}
        showLine={showYLine}
        showTicks={showYTicks}
      />
      <XAxis plot={plot} scale={xScale} showLabels={showXLabels} />
    </>
  );
}

const meta: Meta<typeof XAxis> = {
  title: 'Components/Axis',
  component: XAxis,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "The two axis primitives the cartesian charts compose. `XAxis` is categorical: a baseline, tick marks, and a label centred under each band or point, truncated with an ellipsis once it is wider than its step so nothing overflows the surface (LC-10). `YAxis` is continuous: nice d3 ticks, right-aligned labels in the left margin, and horizontal grid lines on by default with the axis line off, because the grid already carries the edge. All chrome resolves through `useChartTheme` — axis lines take the border role, grid the divider role, labels the muted text role at the AA floor. Tick numbers ride the charts package's own density register, the declared exemption to the house number channel.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof XAxis>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={560}>
      <Card>
        <ChartSurface label="Empty axis frame, weekdays across a 0 to 100 value axis." height={220}>
          {(size) => <AxisFrame size={size} categories={weekdays} domain={[0, 100]} />}
        </ChartSurface>
      </Card>
    </YStack>
  ),
};

export const AxisLineAndTicks: Story = {
  name: 'Grid off, axis line on',
  parameters: {
    docs: {
      description: {
        story:
          '`showGrid={false}` with `showLine` and `showTicks` on: the classic ticked frame for charts that must not carry horizontal rules across the plot.',
      },
    },
  },
  render: () => (
    <YStack maxWidth={560}>
      <Card>
        <ChartSurface label="Ticked axis frame with no grid." height={220}>
          {(size) => (
            <AxisFrame size={size} categories={weekdays} domain={[0, 100]} showYGrid={false} showYLine showYTicks />
          )}
        </ChartSurface>
      </Card>
    </YStack>
  ),
};

export const LabelTruncation: Story = {
  name: 'Long labels truncate',
  parameters: {
    docs: {
      description: {
        story:
          'Department names wider than their band. XAxis truncates each label to its step with an ellipsis rather than letting text collide or run off the surface.',
      },
    },
  },
  render: () => (
    <YStack gap="$4">
      {[520, 280].map((width) => (
        <Card key={width} width={width}>
          <YStack gap="$2">
            <Paragraph size="$2">{`${width}px container`}</Paragraph>
            <ChartSurface label={`Department axis at ${width}px`} height={180}>
              {(size) => <AxisFrame size={size} categories={longLabels} domain={[0, 40]} />}
            </ChartSurface>
          </YStack>
        </Card>
      ))}
    </YStack>
  ),
};

export const WideValueRange: Story = {
  name: 'Nice ticks on a wide range',
  parameters: {
    docs: {
      description: {
        story:
          'A 0 to 1,250,000 domain. YAxis asks d3 for nice ticks and formats them through the charts density register, so the left margin stays a handful of characters wide.',
      },
    },
  },
  render: () => (
    <YStack maxWidth={560}>
      <Card>
        <ChartSurface label="Weekday axis against a 0 to 1.25 million value axis." height={220}>
          {(size) => <AxisFrame size={size} categories={weekdays} domain={[0, 1250000]} yTicks={5} />}
        </ChartSurface>
      </Card>
    </YStack>
  ),
};
