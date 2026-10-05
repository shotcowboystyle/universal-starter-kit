// Headless math core (pure, renderer-agnostic)
export {
  approximateTextWidth,
  arcCentroid,
  arcPath,
  areaPath,
  createBandScale,
  createLinearScale,
  createPointScale,
  createTimeScale,
  formatAxisTick,
  formatChartValue,
  getLinearTicks,
  getTimeTicks,
  linePath,
  pieSlices,
  truncateLabel,
  valueDomain,
  type ArcPathInput,
  type AreaPathOptions,
  type BandScaleInput,
  type LinearScaleInput,
  type LinePathOptions,
  type PieSlice,
  type PieSliceOptions,
  type PointScaleInput,
  type TimeScaleInput,
  type ValueDomainOptions,
} from './math';

// Accessible summaries (Axiom 12)
export { describeChart, describeDatum, type DescribeChartInput, type DescribeDatumInput } from './accessibility';

// Data contracts
export type { ChartCurve, ChartDatum, ChartDatumEvents, ChartSize, PixelPoint, PlotArea } from './types';

// Shared layout/color plumbing (composed charts + consumers that pin a domain)
export {
  computeCartesianPlot,
  resolveSeriesFills,
  thinCategories,
  type CartesianPlotInput,
  type SeriesFillsInput,
} from './composeChart';

// Theming (chrome from knobs + ramps; series from useChartPalette)
export { useChartTheme, type ChartTheme } from './useChartTheme';

// Primitives
export { ChartSurface, type ChartSurfaceProps } from './ChartSurface';
export { XAxis, YAxis, type XAxisProps, type YAxisProps } from './Axis';
export {
  AreaSeries,
  BarSeries,
  LineSeries,
  PieSeries,
  type AreaSeriesProps,
  type BarSeriesProps,
  type LineSeriesProps,
  type PieSeriesProps,
} from './series';

// Composed charts
export { BarChart, type BarChartProps } from './BarChart';
export { AreaChart, LineChart, type AreaChartProps, type LineChartProps } from './LineChart';
export { PieChart, type PieChartProps } from './PieChart';
export { Sparkline, type SparklineProps } from './Sparkline';

export { ChartDataView, type ChartDataViewProps } from './ChartDataView';
