import { useCallback, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { YStack, type YStackProps } from 'tamagui';

import { useChartDataViewProps } from './ChartDataView';
import { Svg, chartRootA11yProps, type ChartProofDeclaration } from './svg';
import type { ChartSize } from './types';
import { useChartTheme } from './useChartTheme';

export interface ChartSurfaceProps extends Omit<YStackProps, 'children' | 'width' | 'height'> {
  /**
   * Generated accessible summary for the whole chart (Axiom 12) — rendered
   * as `role="img"` + label. Build it with `describeChart()`.
   */
  label: string;
  /** Explicit chart classification; low-level custom surfaces remain unclassified. */
  proof?: ChartProofDeclaration;
  /** Drawing height in px (default 200). */
  height?: number;
  /**
   * Explicit width bypasses `onLayout` measurement (SSR, tests, fixed
   * layouts). Omit it to track the parent width responsively.
   */
  width?: number;
  /** Pixel-space render prop — receives the measured viewport. */
  children: (size: ChartSize) => ReactNode;
}

/**
 * Responsive SVG chart viewport.
 *
 * Measures its own width via `onLayout` (ResizeObserver-backed on web, native
 * layout on RN) and hands children a pixel-space viewport, so scales resolve
 * to real device pixels: strokes stay crisp, no `preserveAspectRatio="none"`
 * distortion, and touch-target floors are true 44px.
 *
 * Draw-in: the surface carries the knob `transition` with a mount
 * `enterStyle` (fade + rise). Both are omitted entirely at `animation=none`
 * or OS reduced motion (styles never render
 * without a driver).
 */
export function ChartSurface({
  label,
  proof,
  height = 200,
  width: widthProp,
  children,
  ...stackProps
}: ChartSurfaceProps) {
  const dataViewProps = useChartDataViewProps();
  const { transition, animationEnabled } = useChartTheme();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = widthProp ?? measuredWidth;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setMeasuredWidth((prev) => (Math.abs(prev - next) >= 0.5 ? next : prev));
  }, []);

  return (
    <YStack
      width="100%"
      height={height}
      overflow="hidden"
      onLayout={widthProp === undefined ? handleLayout : undefined}
      {...(animationEnabled ? { transition, enterStyle: { opacity: 0, y: 6 } } : {})}
      {...stackProps}>
      {width > 0 ? (
        <Svg width={width} height={height} {...chartRootA11yProps(label, proof)} {...dataViewProps}>
          {children({ width, height })}
        </Svg>
      ) : null}
    </YStack>
  );
}
