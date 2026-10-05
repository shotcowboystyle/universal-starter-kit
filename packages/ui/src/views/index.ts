export {
  List,
  ListRow,
  ListRowMeta,
  useListItemState,
  type ListProps,
  type ListHotkeys,
  type ListItemState,
  type ListRowProps,
} from './List';
export { Kanban, type KanbanProps, type KanbanColumn, type KanbanHotkeys } from './Kanban';
export {
  Calendar,
  computeEventMoveRange,
  eventChipTextColor,
  findDayKeyAtPoint,
  type CalendarProps,
  type CalendarEvent,
  type CalendarEventMoveRange,
  type CalendarEventDraft,
  type CalendarDayLayout,
  type CalendarViewType,
} from './Calendar';
export {
  snapMinutes,
  layoutDayBlocks,
  computeResizeRange,
  moveRangeToSlot,
  createRangeFromDrag,
  moveFocusDate,
  moveFocusSlot,
  eventAccessibleLabel,
  formatTimeRangeLabel,
  type TimedBlockLayout,
  type CalendarRange,
} from './calendarMath';
export { TreeView, type TreeViewProps, type TreeNode, type TreeViewHotkeys, type TreeViewDisplay } from './TreeView';
export { ImageGrid, type ImageGridProps, type ImageGridHotkeys } from './ImageGrid';
// ProgressCard/ShortcutCard/ListCard ride this barrel on purpose (the
// ProgressCard export gap): Dashboard.tsx exports them but they
// were reachable only through the deep path until the Meter extraction, and
// a later change collaterally dropped them again. Meter.test.tsx imports them from
// here so the next revert fails a test instead of shipping.
export {
  Dashboard,
  KPICard,
  ChartCard,
  ProgressCard,
  ShortcutCard,
  ListCard,
  calculateTrend,
  calculatePercentageChange,
  aggregateData,
  resolveTrendColor,
  type DashboardProps,
  type DashboardWidget,
  type KPICardConfig,
  type KPICardProps,
  type ChartConfig,
  type ChartCardProps,
  type ChartDataPoint,
  type ChartType,
  type TrendDirection,
  type ProgressConfig,
  type ProgressCardProps,
  type ShortcutConfig,
  type ShortcutCardProps,
  type ListConfig,
  type ListCardProps,
  type DashboardListItem,
} from './Dashboard';
export { ReportBuilder, type ReportBuilderProps, type ReportColumn, type GroupByConfig } from './ReportBuilder';
export {
  GanttView,
  type GanttViewProps,
  type GanttTask,
  type GanttTaskSpan,
  type GanttSpanRef,
  type GanttItemMoveRange,
} from './Gantt';
// ganttMath is surfaced WHOLE, deliberately, against this barrel's otherwise
// curated style. It is pure, side-effect-free, DOM-free day math —
// there is nothing in it that is an implementation detail worth hiding, and
// the curated subset had already drifted into an asymmetry that cost a
// consumer real code: `dateToX` shipped and its inverse `xToDate` did not, so
// anything positioning by date could read the axis but not read a pointer back
// off it, which is the direction every drag, scrub and hit-test needs. The
// day-math helpers (`startOfDay`, `addDays`, `dayDiff`, `rangeDays`) go with
// them, because a consumer laying out its own timeline on `computeGanttRange`
// needs the same DST-safe local wall-clock arithmetic the module uses
// internally; re-deriving it is how two subtly different implementations of
// "add a day" end up in one app. `views.test.tsx` asserts this barrel
// re-exports every `ganttMath` export, so the next omission fails a test
// instead of shipping.
export {
  addDays,
  barGeometry,
  clampResizeDayDelta,
  computeGanttRange,
  dateLineX,
  dateToX,
  dayDiff,
  dxToDayDelta,
  formatRangeLabel,
  formatSpanLabel,
  ganttTaskAccessibleLabel,
  generateTicks,
  isBoundedSpan,
  isEternalSpan,
  MS_PER_DAY,
  normalizeSpanEdges,
  openBarGeometry,
  openSpanExtent,
  openSpanExtents,
  openSpanLabelParts,
  rangeDays,
  resizeSpanByDays,
  scrollAnchorX,
  shiftSpanByDays,
  spanInclusiveDays,
  startOfDay,
  startOfMonth,
  startOfWeek,
  todayLineX,
  xToDate,
  type GanttBarGeometry,
  type GanttOpenBarGeometry,
  type GanttOpenSpan,
  type GanttRange,
  type GanttResizeEdge,
  type GanttSpan,
  type GanttTick,
  type GanttZoom,
} from './ganttMath';
export { MatrixView, type MatrixViewProps, type MatrixRow, type MatrixCellRef, type MatrixLegendItem } from './Matrix';
// matrixMath is surfaced whole for the same reason ganttMath is: pure bucket
// math a consumer laying out its own grid on the same axis needs unchanged.
export {
  alignMatrixRange,
  bucketName,
  bucketStart,
  computeMatrixRange,
  generateBuckets,
  localDateKey,
  matrixCellIntensity,
  matrixCellKey,
  matrixMaxValue,
  nextBucketStart,
  summarizeMatrixCells,
  type MatrixBucket,
  type MatrixBucketRule,
  type MatrixCell,
  type MatrixCellSummary,
  type MatrixIntent,
  type MatrixRange,
} from './matrixMath';
// Kanban drag maths. Only the helper other packages consume is surfaced, in
// keeping with this barrel's curated style: the table package's
// ChildTable imports renumberIdx to renumber rows after a reorder, and failed
// to build without it.
export { renumberIdx } from './kanbanDnd';
// Universal chart catalog (d3 math + react-native-svg rendering). Charts are
// data views; the package barrel star-exports this module, so the charts
// submodule surfaces through the existing views barrel.
export * from '../charts';
