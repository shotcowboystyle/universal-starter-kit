import type { shorthands as _shorthands } from '@tamagui/shorthands';

export { Alert } from './Alert';
export type { AlertFrameProps, AlertIntent, AlertProps } from './Alert';
export {
  SortableList,
  SortableHandle,
  SortableHandleWell,
  SortableSessionProvider,
  useSortableRows,
} from './SortableList';
export type { SortableListProps, SortableDisabledStyle, SortableSession, UseSortableRowsOptions } from './SortableList';
export { Badge } from './Badge';
export type {
  BadgeColor,
  BadgeIndicatorProps,
  BadgePosition,
  BadgeProps,
  BadgeVariant,
  BadgeWrapperProps,
} from './Badge';
export { Carousel } from './Carousel';
export type { CarouselContainerProps, CarouselProps, CarouselSlideProps } from './Carousel';
export { Chip, ChipFrame, chipIconSize, ChipText, chipTextSize, chipTone } from './Chip';
export type { ChipColor, ChipFrameProps, ChipProps, ChipSize, ChipTone, ChipVariant } from './Chip';
export { CopyField } from './CopyField';
export type { CopyFieldProps } from './CopyField';
export { DotIndicator } from './DotIndicator';
export type { DotIdiom, DotIndicatorProps, DotProps, DotsContainerProps, DotVariant } from './DotIndicator';
export { DropdownMenu } from './DropdownMenu';
export type {
  DropdownMenuCheckboxItemProps,
  DropdownMenuCloseAutoFocusEvent,
  DropdownMenuContentProps,
  DropdownMenuEntry,
  DropdownMenuItemProps,
  DropdownMenuItemSpec,
  DropdownMenuLabelProps,
  DropdownMenuPlacement,
  DropdownMenuProps,
  DropdownMenuRowProps,
  DropdownMenuSeparatorProps,
  DropdownMenuTriggerProps,
} from './DropdownMenu';
export { ContextMenu } from './ContextMenu';
export type {
  ContextMenuCheckboxItemProps,
  ContextMenuContentProps,
  ContextMenuEntry,
  ContextMenuItemProps,
  ContextMenuItemSpec,
  ContextMenuLabelProps,
  ContextMenuProps,
  ContextMenuSeparatorProps,
  ContextMenuTriggerProps,
} from './ContextMenu';
export {
  formatMeterValue,
  Meter,
  METER_RADIUS_CLASS,
  METER_ZONE_PAINT,
  meterTrackHeightPx,
  resolveMeterRailRadius,
  resolveMeterZone,
} from './Meter';
export type { MeterFormat, MeterLayout, MeterProps, MeterZone } from './Meter';
export { ProgressSteps } from './ProgressSteps';
export type { ProgressStep, ProgressStepsProps } from './ProgressSteps';
export { TreeSelect } from './TreeSelect';
export type { TreeSelectNode, TreeSelectProps } from './TreeSelect';
export { Quote } from './Quote';
export type { QuoteProps } from './Quote';
export { ThemePlayground } from './ThemePlayground';
export type { ThemePlaygroundProps } from './ThemePlayground';
export { Skeleton, SkeletonCircle, SkeletonGroup, SkeletonText } from './Skeleton';
export type { SkeletonFrameProps, SkeletonProps, SkeletonTextSize, SkeletonVariant } from './Skeleton';
export { SkipLink } from './SkipLink';
export type { SkipLinkProps, SkipLinkSurfaceProps } from './SkipLink';
export {
  dismissAllToasts,
  dismissToast,
  nativeToastA11y,
  nativeToastControlA11y,
  showToast,
  TOAST_ACTION_MIN_MS,
  TOAST_DEFAULT_MS,
  TOAST_ERROR_MS,
  TOAST_WARNING_MS,
} from './Toast';
export type {
  ToastActionOptions,
  ToastEntry,
  ToastIntent,
  ToastPlacement,
  ToastShowOptions,
  UseToastResult,
} from './Toast';
export { Video } from './Video';
export type { VideoProps } from './Video';
export {
  ConfirmDialog,
  dismissFeedback,
  dismissFeedbackByRegion,
  dismissFeedbackBySurface,
  getFeedback,
  notify,
  NotifyHost,
  NotifyRegion,
  pushFeedback,
  resetFeedback,
  routeNotify,
  subscribeFeedback,
} from './feedback';
export type {
  ConfirmDialogProps,
  FeedbackEntry,
  NotifyAction,
  NotifyEvent,
  NotifyHostProps,
  NotifyRoute,
  NotifyScope,
  NotifySeverity,
  NotifySurface,
  NotifyToastIntent,
} from './feedback';
export {
  __resetActionDevWarnSeen,
  ActionBar,
  actionDevWarn,
  DestructiveAction,
  formatActionLabel,
  resolveDestructiveSeverity,
  severityRequiresConfirm,
  severityUsesDangerTone,
} from './actions';
export type {
  ActionBarAlign,
  ActionBarProps,
  ActionDevWarnCode,
  ActionDevWarnDetail,
  ActionLabelParts,
  DestructiveActionProps,
  DestructiveConfirmContext,
  DestructiveSeverity,
  DestructiveSeverityHints,
} from './actions';
export { Wheel } from './Wheel';
export type { WheelContainerProps, WheelHighlightEdges, WheelItem, WheelItemProps, WheelProps } from './Wheel';
export { ErrorBoundary } from './ErrorBoundary/index';
export type { ErrorBoundaryProps } from './ErrorBoundary/index';
export {
  Code,
  CodeBlock,
  CodeInline,
  highlightCode,
  HighlightedCode,
  houseSyntaxTheme,
  Pre,
  ShikiContext,
  useShikiTokens,
} from './code/index';
export type {
  CodeBlockProps,
  CodeInlineProps,
  CodeProps,
  HighlightedCodeProps,
  HighlightLine,
  HighlightToken,
  HouseSyntaxTheme,
  HouseSyntaxThemeSetting,
  ShikiContextValue,
} from './code/index';
// Forms are now in @repo/forms package
// Table components live outside this package (out of scope)
export {
  composeDocumentTitle,
  copyToClipboard,
  DOCUMENT_TITLE_SEPARATOR,
  useAssets,
  useClipboard,
  useDirection,
  useDocumentTitle,
} from './hooks/index';
export type {
  Direction,
  DocumentTitlePart,
  DocumentTitleTrail,
  UseClipboardOptions,
  UseDocumentTitleOptions,
} from './hooks/index';
export { CheckRegular, Eye, EyeOff, Github, Info, Mail, MinusRegular, Pencil, themed } from './icons/index';
export { Svg, SvgUri } from './images/index';
export type { SvgProps, SvgUriProps } from './images/index';
export {
  __resetAsyncDevWarnSeen,
  AsyncBoundary,
  AsyncSkeleton,
  Attachments,
  Breadcrumbs,
  CONTENT_MAX_WIDTH,
  createWithDebugLayout,
  DebugLayout,
  DetailPageLayout,
  EmptyState,
  FeedLayout,
  formatRelativeTimestamp,
  getEntryDisplayName,
  KeyboardAvoidingWrapper,
  ListDetailLayout,
  ListPageLayout,
  PageHeader,
  PageHeadingScope,
  PageSection,
  PaneScaffold,
  prettifyAuthorName,
  ReadingWidth,
  resolveAsyncStatus,
  SafeAreaWrapper,
  Screen,
  ScreenToolbar,
  SettingsPageLayout,
  Sidebar,
  SupportingPaneLayout,
  Tags,
  threadEntries,
  Timeline,
  Toolbar,
  useAsyncBoundary,
  useAsyncCount,
  usePageChromeInset,
  useRegisterPageHeading,
  ViewSwitcher,
  withDebugLayout,
} from './layouts/index';
export type {
  AsyncBoundaryContextValue,
  AsyncBoundaryLayout,
  AsyncBoundaryProps,
  AsyncStatus,
  AttachmentItem,
  AttachmentsProps,
  BreadcrumbItem,
  BreadcrumbsProps,
  DebugLayoutProps,
  DetailPageLayoutProps,
  EmptyStateProps,
  FeedLayoutProps,
  KeyboardAvoidingBehavior,
  KeyboardAvoidingWrapperProps,
  ListDetailLayoutProps,
  ListPageLayoutProps,
  PageHeaderProps,
  PageHeadingLevel,
  PageHeadingScopeProps,
  PageSectionProps,
  PaneOrientation,
  PaneRole,
  PaneScaffoldProps,
  ReadingWidthProps,
  SafeAreaEdge,
  SafeAreaMode,
  SafeAreaWrapperProps,
  ScreenProps,
  ScreenToolbarProps,
  SettingsPageLayoutProps,
  SidebarItem,
  SidebarProps,
  SidebarSection,
  SupportingPaneLayoutProps,
  TagItem,
  TagsProps,
  TagVariant,
  TimelineEntry,
  TimelineEntryType,
  TimelineHeadingLevel,
  TimelineProps,
  TimelineThread,
  ToolbarAction,
  ToolbarActionVariant,
  ToolbarProps,
  VersionChange,
  ViewOption,
  ViewSwitcherProps,
} from './layouts/index';
// MDX components live outside this package (out of scope)
export {
  DialogRegionContext,
  DialogShowFocus,
  KnobCard,
  // oxlint-disable-next-line typescript/no-deprecated -- public deprecated alias of DialogContent kept for existing consumers
  KnobDialogContent,
  // oxlint-disable-next-line typescript/no-deprecated -- public deprecated alias of Panel kept for existing consumers
  KnobPanel,
  // oxlint-disable-next-line typescript/no-deprecated -- public deprecated alias of PopoverContent kept for existing consumers
  KnobPopoverContent,
  // oxlint-disable-next-line typescript/no-deprecated -- public deprecated alias of SheetFrame kept for existing consumers
  KnobSheetFrame,
  useDialogRegionContext,
  useIsInDialogRegion,
} from './surfaces';
export type { DialogRegionContextValue, KnobCardProps } from './surfaces';
export { SheetModal } from './SheetModal';
export type { SheetModalProps } from './SheetModal';
export {
  addDays,
  aggregateData,
  alignMatrixRange,
  approximateTextWidth,
  arcCentroid,
  arcPath,
  AreaChart,
  areaPath,
  AreaSeries,
  BarChart,
  barGeometry,
  BarSeries,
  bucketName,
  bucketStart,
  calculatePercentageChange,
  calculateTrend,
  Calendar,
  ChartCard,
  ChartDataView,
  ChartSurface,
  clampResizeDayDelta,
  computeCartesianPlot,
  computeEventMoveRange,
  computeGanttRange,
  computeMatrixRange,
  computeResizeRange,
  createBandScale,
  createLinearScale,
  createPointScale,
  createRangeFromDrag,
  createTimeScale,
  Dashboard,
  dateLineX,
  dateToX,
  dayDiff,
  describeChart,
  describeDatum,
  dxToDayDelta,
  eventAccessibleLabel,
  eventChipTextColor,
  findDayKeyAtPoint,
  formatAxisTick,
  formatChartValue,
  formatRangeLabel,
  formatSpanLabel,
  formatTimeRangeLabel,
  ganttTaskAccessibleLabel,
  GanttView,
  generateBuckets,
  generateTicks,
  getLinearTicks,
  getTimeTicks,
  ImageGrid,
  isBoundedSpan,
  isEternalSpan,
  Kanban,
  KPICard,
  layoutDayBlocks,
  LineChart,
  linePath,
  LineSeries,
  List,
  ListCard,
  ListRow,
  ListRowMeta,
  localDateKey,
  matrixCellIntensity,
  matrixCellKey,
  matrixMaxValue,
  MatrixView,
  moveFocusDate,
  moveFocusSlot,
  moveRangeToSlot,
  MS_PER_DAY,
  nextBucketStart,
  normalizeSpanEdges,
  openBarGeometry,
  openSpanExtent,
  openSpanExtents,
  openSpanLabelParts,
  PieChart,
  PieSeries,
  pieSlices,
  ProgressCard,
  rangeDays,
  renumberIdx,
  ReportBuilder,
  resizeSpanByDays,
  resolveSeriesFills,
  resolveTrendColor,
  scrollAnchorX,
  shiftSpanByDays,
  ShortcutCard,
  snapMinutes,
  spanInclusiveDays,
  Sparkline,
  startOfDay,
  startOfMonth,
  startOfWeek,
  summarizeMatrixCells,
  thinCategories,
  todayLineX,
  TreeView,
  truncateLabel,
  useChartTheme,
  useListItemState,
  valueDomain,
  XAxis,
  xToDate,
  YAxis,
} from './views/index';
export type {
  ArcPathInput,
  AreaChartProps,
  AreaPathOptions,
  AreaSeriesProps,
  BandScaleInput,
  BarChartProps,
  BarSeriesProps,
  CalendarDayLayout,
  CalendarEvent,
  CalendarEventDraft,
  CalendarEventMoveRange,
  CalendarProps,
  CalendarRange,
  CalendarViewType,
  CartesianPlotInput,
  ChartCardProps,
  ChartConfig,
  ChartCurve,
  ChartDataPoint,
  ChartDataViewProps,
  ChartDatum,
  ChartDatumEvents,
  ChartSize,
  ChartSurfaceProps,
  ChartTheme,
  ChartType,
  DashboardListItem,
  DashboardProps,
  DashboardWidget,
  DescribeChartInput,
  DescribeDatumInput,
  GanttBarGeometry,
  GanttItemMoveRange,
  GanttOpenBarGeometry,
  GanttOpenSpan,
  GanttRange,
  GanttResizeEdge,
  GanttSpan,
  GanttSpanRef,
  GanttTask,
  GanttTaskSpan,
  GanttTick,
  GanttViewProps,
  GanttZoom,
  GroupByConfig,
  ImageGridHotkeys,
  ImageGridProps,
  KanbanColumn,
  KanbanHotkeys,
  KanbanProps,
  KPICardConfig,
  KPICardProps,
  LinearScaleInput,
  LineChartProps,
  LinePathOptions,
  LineSeriesProps,
  ListCardProps,
  ListConfig,
  ListHotkeys,
  ListItemState,
  ListProps,
  ListRowProps,
  MatrixBucket,
  MatrixBucketRule,
  MatrixCell,
  MatrixCellRef,
  MatrixCellSummary,
  MatrixIntent,
  MatrixLegendItem,
  MatrixRange,
  MatrixRow,
  MatrixViewProps,
  PieChartProps,
  PieSeriesProps,
  PieSlice,
  PieSliceOptions,
  PixelPoint,
  PlotArea,
  PointScaleInput,
  ProgressCardProps,
  ProgressConfig,
  ReportBuilderProps,
  ReportColumn,
  SeriesFillsInput,
  ShortcutCardProps,
  ShortcutConfig,
  SparklineProps,
  TimedBlockLayout,
  TimeScaleInput,
  TreeNode,
  TreeViewDisplay,
  TreeViewHotkeys,
  TreeViewProps,
  TrendDirection,
  ValueDomainOptions,
  XAxisProps,
  YAxisProps,
} from './views/index';
// Wizard is house-only: nothing in the curated ./tamagui surface shadows these
// names, so without an explicit export the component is unreachable from the
// package; consumers import all four names.
export { Wizard } from './Wizard';
export type { WizardFormLike, WizardProps, WizardStatus, WizardStep } from './Wizard';
export { unwrapText } from './utils/unwrap-text';
export { Pagination, getPaginationItems } from './Pagination';
export type { PaginationProps, PaginationItem } from './Pagination';
export { Accordion, useAccordionTriggerInk } from './Accordion';
export type {
  AccordionProps,
  AccordionVariant,
  AccordionType,
  AccordionSingleModeProps,
  AccordionMultipleModeProps,
  AccordionItemProps,
  AccordionTriggerProps,
  AccordionContentProps,
} from './Accordion';
export { AnimateHeight, settleMs } from './AnimateHeight';
export type { AnimateHeightProps } from './AnimateHeight';
// Explicit named export wins over the `export * from "tamagui"` star export
// (same pattern as Tooltip) so house Tabs shadows the tamagui primitive.
export { Tabs } from './Tabs';
export type { TabsProps, TabsItem, TabsVariant, TabsSize, TabsTriggerProps } from './Tabs';
export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipContentProps, TooltipArrowProps, TooltipTextProps } from './Tooltip';
// Explicit named exports win over the `export * from "tamagui"` star export
// (same pattern as Tabs/Tooltip) so the house knob-aware surfaces shadow the
// raw tamagui primitives (Card, CardHeader, CardFooter, DialogContent,
// PopoverContent). The unthemed originals stay reachable via `tamagui`.
export { Card, CardFooter, CardHeader } from './Card';
export type { CardFooterProps, CardHeaderProps, CardProps, SurfaceTier } from './Card';
export {
  DialogContent,
  DialogOverlay,
  AlertDialogContent,
  AlertDialogOverlay,
  PopoverContent,
  SheetFrame,
  Panel,
} from './surfaces';
// Curated tamagui surface — replaces the old `export * from "tamagui"` star
// export that leaked raw interactive primitives (Checkbox, Switch, Select, …)
// under the house package name. See ./tamagui.ts for the allowlist rules and
// tamagui.test.ts for the guardrail locking it.
export {
  AlertDialog,
  AnimatePresence,
  Circle,
  Collapsible,
  createStyledContext,
  Dialog,
  getToken,
  getTokens,
  getTokenValue,
  Group,
  isClient,
  isWeb,
  LinearGradient,
  ListItem,
  Popover,
  Portal,
  PortalProvider,
  ScrollView,
  Sheet,
  Spacer,
  Square,
  styled,
  TamaguiAnchor,
  TamaguiButton,
  TamaguiCheckbox,
  TamaguiH1,
  TamaguiH2,
  TamaguiH3,
  TamaguiH4,
  TamaguiH5,
  TamaguiH6,
  TamaguiHeading,
  TamaguiInput,
  TamaguiLabel,
  TamaguiParagraph,
  TamaguiProgress,
  TamaguiProvider,
  TamaguiRadioGroup,
  TamaguiSelect,
  TamaguiSeparator,
  TamaguiSizableText,
  TamaguiSlider,
  TamaguiSpinner,
  TamaguiSwitch,
  TamaguiText,
  TamaguiTextArea,
  TamaguiToggleGroup,
  Theme,
  Unspaced,
  useControllableState,
  useDidFinishSSR,
  useEvent,
  useMedia,
  usePropsAndStyle,
  useTheme,
  useThemeName,
  View,
  VisuallyHidden,
  withStaticProperties,
  XGroup,
  XStack,
  YGroup,
  YStack,
} from './tamagui';
export type {
  CircleProps,
  ColorTokens,
  DialogProps,
  FontSizeTokens,
  GetProps,
  GetRef,
  GroupProps,
  LinearGradientProps,
  ListItemProps,
  PopoverProps,
  RadiusTokens,
  ScrollViewProps,
  SheetProps,
  SizeTokens,
  SpaceTokens,
  SquareProps,
  TamaguiConfig,
  TamaguiElement,
  TamaguiProviderProps,
  TamaguiTextElement,
  ThemeName,
  ThemeProps,
  ViewProps,
  XStackProps,
  YStackProps,
} from './tamagui';

// The local Toast module (star-exported above) must win over any toast names;
// re-export it explicitly so the bare `Toast` name is unambiguous.
export { Toast, ToastViewport, useToast } from './Toast';
export type { ToastProps, ToastViewportProps } from './Toast';

// lucide hamburger icon — alias bare `Menu` explicitly. Tamagui Menu /
// create-menu are unused leftovers and stay off the house barrel.
export { MenuIcon as Menu, MenuIcon } from './icons/lucide';

// Raw @tamagui/toast primitives for consumers that need the imperative
// controller/state API or the unshadowed Toast compound (house Toast above
// wins for the bare `Toast` name). Prefer useToast() for new code.
export { Toast as TamaguiToast, useToastController, useToastState } from '@tamagui/toast';

// Shadow tamagui Avatar / Fieldset with house gallery components.
export { Avatar, getInitials } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { Fieldset } from '@repo/forms';
export type { FieldsetProps } from '@repo/forms';
export { ContextualSaveBar, clientKnownIdentity, commitImmediateField } from '@repo/forms';
export type { ContextualSaveBarProps, NavigationBlocker, UseNavigationBlocker } from '@repo/forms';

// Shadow tamagui Spinner with the knob-consuming forms Spinner (census
// 2026-08-13): raw Spinner keeps spinning at animation "none" /
// prefers-reduced-motion and ignores the size knob; the forms house version
// gates its motion on knobProps.transition, maps the size knob's top step to
// "large", and carries role="status" a11y. The curated ./tamagui surface no
// longer exports the bare name; raw stays reachable as TamaguiSpinner.
export { Spinner } from '@repo/forms';
export type { SpinnerProps } from '@repo/forms';

// Shadow tamagui Button with the house wrapper over the forms Button
// (knob fragments + press floor + icon slot, plus the raw
// `variant="outlined"` prop-compat). The curated ./tamagui surface no
// longer exports the bare name; raw stays reachable as TamaguiButton.
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Shadow tamagui Text and Heading with the house versions. ./tamagui.ts says
// so in its own words -- "Bare Text/SizableText/Paragraph/Anchor are the house
// shadows in ./Text.tsx and bare Heading/H1-H6 the house shadows in
// ./Heading.tsx" -- and exports only the Tamagui*-prefixed escape hatches.
// An earlier commit removed these lines from this barrel, which left the bare names
// exported by NOBODY: consumers that import them
// stopped building, and tamagui.test.ts's "keeps house shadows as the
// house versions" guardrail started failing. Raw stays reachable as
// TamaguiText / TamaguiHeading / TamaguiH1.
export { Anchor, Paragraph, SizableText, Text } from './Text';
export type { AnchorProps, ParagraphProps, SizableTextProps, TextProps } from './Text';
export { H1, H2, H3, H4, H5, H6, Heading } from './Heading';
export type { HeadingProps } from './Heading';

// Shadow tamagui Separator with the house Separator. Two reasons,
// both measured: a bare name a house barrel exports is a
// catalog part, and this one resolved to a raw primitive; and
// the raw primitive is a `flex: 1` item, so the rule can absorb free space.
// The house rule is a painted 1px line in $borderColor (measured law:
// 1px never 0.5px; quiet = opacity 0.5, never a lighter color) that cannot
// flex-grow. The curated ./tamagui surface no longer exports the bare name;
// raw stays reachable as TamaguiSeparator.
//
// Correction 2026-09-01: the ticket's "96 of 96 paint nothing" was a probe
// artifact, not a defect — see ./Separator/index.tsx for the measurement.
export { Separator } from './Separator';
export type { SeparatorProps } from './Separator';

export type { ImageProps } from './images/Image';
export { Image } from './images/Image';

// The semantic color tiers and the section-heading metrics the catalog
// paints with. Named exports, not a star, so the curated surface stays
// explicit — these are token maps, not catalog parts: they render
// nothing and a consumer spreads them onto its own frames exactly as the
// catalog does. They were reachable only through the `./src/*` deep-path
// hatch before, which is why a consumer that wanted the SURFACE tier
// (`$color2` / `$color6`) rather than the CONTROL tier restated the two
// tokens by hand instead of importing the layer that defines them.
// A semantic layer whose own header says "use these instead of hardcoding $color3, $color10" has
// to be importable by a stable name.
export { componentColors, sectionHeading } from './component-colors';

// ---------------------------------------------------------------------------
// Tamagui shorthand type augmentation
//
// Adds shorthand prop types (bg, ai, jc, p, m, etc.) to all Tamagui
// components for every consumer of @repo/ui.
//
// We intentionally augment with ONLY the shorthands rather than a full
// createTamagui config to avoid triggering TamaDefer resolution changes
// that break styled() component types across workspace boundaries.
// ---------------------------------------------------------------------------
declare module '@tamagui/web' {
  interface TamaguiCustomConfig {
    shorthands: typeof _shorthands;
  }
}
