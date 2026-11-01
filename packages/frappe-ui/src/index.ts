/**
 * `@repo/frappe-ui`
 *
 * Pre-wired Tamagui components for Frappe doctypes with live data.
 *
 * This package exports ONLY Frappe-specific components and wrappers.
 * Generic field, layout, filter, and form components have been migrated to:
 *   - @repo/forms (fields, SchemaForm, fieldRegistry)
 *   - @repo/table (ChildTable, TableInput, DataTable, …)
 *   - @repo/ui (Sidebar, Toolbar, ViewSwitcher, Breadcrumbs, etc.)
 *   - @repo/table (FilterManager, SavedFilterDropdown, useSavedFilters)
 */

import { lazy } from 'react';

// ---------------------------------------------------------------------------
// Frappe Provider
// ---------------------------------------------------------------------------

export {
  FrappeProvider,
  useFrappeConfig,
  useFrappeContext,
  type FrappeConfig,
  type FrappeProviderProps,
} from './FrappeProvider';
export {
  FrappeNavigationProvider,
  useRouteLoaderData,
  frappeRouteHref,
  frappeRouteTarget,
  useFrappeNavigation,
  useFrappeRouter,
  type FrappeNavigation,
  type FrappeRouter,
  type FrappeRouteTarget,
} from './frappe-navigation';
export { FrappeReconnectIndicator, type FrappeReconnectIndicatorProps } from './FrappeReconnectIndicator';
// Storybook story target (live bench through the SB proxy, fixtures
// otherwise) — exported so feature stories don't need local copies.
export {
  FrappeStoryProvider,
  frappeStoriesLive,
  frappeStoryBaseUrl,
  type FrappeStoryProviderProps,
} from './frappe-story-target';

// ---------------------------------------------------------------------------
// Frappe View Wrappers
// ---------------------------------------------------------------------------

export { FrappeTable, filterValueToFrappeTuple, type FrappeTableProps } from './FrappeTable';
export { FrappeForm, type FrappeConnectionRows, type FrappeFormProps } from './FrappeForm';
export {
  useFrappeForm,
  type FrappeFormConnectionConfig,
  type FrappeFormController,
  type FrappeFormFieldTarget,
  type FrappeFormMetaSource,
  type FrappeFormStatus,
  type UseFrappeFormOptions,
} from './use-frappe-form';
export {
  FrappeFormConnectionSection,
  FrappeFormConnections,
  type FrappeFormConnectionSectionProps,
  type FrappeFormConnectionsProps,
} from './FrappeFormConnections';
export {
  FormSidebar,
  type FormSidebarProps,
  type SidebarSection,
  type SidebarMetadataEntry,
  type SidebarPerson,
} from './FormSidebar';
export { FrappeList, type FrappeListProps } from './FrappeList';
export {
  FrappeListView,
  type FrappeListAction,
  type FrappeListCard,
  type FrappeListViewProps,
  type ListViewMode,
} from './FrappeListView';
export {
  isListNarrowed,
  listStateFilters,
  listStateFromParams,
  listStateOrderBy,
  listStateParams,
  type FrappeListControls,
  type FrappeListFacet,
  type FrappeListFilter,
  type FrappeListParams,
  type FrappeListRange,
  type FrappeListSort,
  type FrappeListState,
} from './list/list-state';
export {
  createFavoritesStore,
  favoritesKey,
  favoritesStore,
  toggleFavoriteIn,
  useFavorites,
  type FavoritesState,
  type UseFavorites,
} from './list/favorites';
export { FacetRail, type FacetRailOption, type FacetRailProps } from './list/FacetRail';
export { RangeFilter, rangeCeiling, type RangeFilterProps } from './list/RangeFilter';
export { ShufflePanel, type ShufflePanelProps } from './list/ShufflePanel';
export { FacetBadge, type FacetBadgeProps } from './list/FacetBadge';
export { ImageWell, type ImageWellProps } from './list/ImageWell';
export { RecordCard, type RecordCardBadge, type RecordCardProps } from './list/RecordCard';
export { recordTitle, type FrappeRecordLook, type FrappeRecordSlide } from './list/record-look';
export {
  FrappeRecordView,
  type FrappeRecordAction,
  type FrappeRecordBarsSection,
  type FrappeRecordRowsSection,
  type FrappeRecordSection,
  type FrappeRecordTab,
  type FrappeRecordViewProps,
} from './FrappeRecordView';
export { RecordBars } from './record/RecordBars';
export { FrappeInsights, type FrappeInsightsMetric, type FrappeInsightsProps } from './FrappeInsights';
export {
  useConnectionFilters,
  type ConnectionFiltersResult,
  type FrappeDoctypeFilter,
  type FrappeFieldFilter,
  type FrappeFilters,
} from './use-connection-filters';

export { FrappeKanban, type FrappeKanbanProps, type KanbanColumn, type KanbanCardRenderer } from './FrappeKanban';

export {
  FrappeCalendar,
  type FrappeCalendarProps,
  type CalendarViewType,
  type CalendarEventRenderer,
} from './FrappeCalendar';

export { FrappeGantt, type FrappeGanttProps } from './FrappeGantt';

export { resolveFrappeEventColor, frappeEventColorNames } from './frappe-event-color';

export { FrappeDashboard, type FrappeDashboardProps, type DashboardDataSource } from './FrappeDashboard';

// Sanitizing bridge — own file, not FrappeDashboard.tsx (t5). t4
// FrappeChartCard imports this module; re-exporting from the dashboard
// file was the catalog import defect.
export { ChartCard } from './ChartCard';

// The KPI/trend catalog is the components package's — re-export it from
// there, NOT through ./FrappeDashboard. The old bounce made the built
// FrappeDashboard.native module re-export names it does not define, and a
// native-conditions consumer that narrows @repo/ui
// (the GNOME shim aliases; metro with exact resolution) failed the whole
// barrel on that seam before anything rendered — measured 2026-08-13.
// One seam (components' own barrel) instead of two.
export {
  KPICard,
  calculateTrend,
  calculatePercentageChange,
  aggregateData,
  type DashboardWidget,
  type KPICardConfig,
  type KPICardProps,
  type ChartConfig,
  type ChartCardProps,
  type ChartDataPoint,
  type ChartType,
  type TrendDirection,
} from '@repo/ui';

export { FrappeKPICard, type FrappeKPICardProps, type FrappeKPIDataSource } from './FrappeKpiCard';

export { FrappeChartCard, type FrappeChartCardProps, type FrappeChartDataSource } from './FrappeChartCard';

// The composed doctype read (MPO-251) — the supported way to get rows out of
// a doctype when the panel shape has no shipped component. FrappeTable and
// the other live views read through it, so there is one implementation.
export {
  useFrappeRows,
  useFrappeConnection,
  DEFAULT_FRAPPE_ROWS_LIMIT,
  type FrappeRowsConnection,
  type FrappeRowsMessages,
  type UseFrappeRowsOptions,
  type UseFrappeRowsResult,
} from './use-frappe-rows';

// What a view lays itself out from when meta is refused (LC-96).
export {
  fieldsFromRecord,
  recordFieldKeys,
  recordKeyLabel,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- public export consumed by backoffice and apps; renaming breaks them
  useRecordShape,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- public export consumed by backoffice and apps; renaming breaks them
  type RecordShape,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- public export consumed by backoffice and apps; renaming breaks them
  type RecordShapeConnection,
} from './record-shape';
export { isPermissionError, refusalReason } from './live-errors';

export {
  useFrappeAggregate,
  type FrappeAggregateConnection,
  type FrappeAggregateGroup,
  type FrappeAggregateOperation,
  type FrappeAggregateSpec,
  type UseFrappeAggregateResult,
} from './use-frappe-aggregate';

export {
  useFrappeFacets,
  filtersExcludingField,
  isFacetFilterActive,
  toggleFacetFilter,
  scrubUserFacetRows,
  NO_TAGS_LABEL,
  type FrappeFacetFilter,
  type FrappeFacetFilters,
  type FrappeFacetOption,
  type FrappeFacetState,
  type FrappeFacetsConnection,
  type UseFrappeFacetsOptions,
  type UseFrappeFacetsResult,
} from './use-frappe-facets';

export { FrappeImageView, type FrappeImageViewProps } from './FrappeImageView';
export { FrappeTreeView, type FrappeTreeViewProps } from './FrappeTreeView';
export {
  FileBrowser,
  type FileBrowserFile,
  type FileBrowserLayout,
  type FileBrowserProps,
  type FileBrowserSelectionMode,
  type FileBrowserView,
} from './FileBrowser';
export { AttachLibrary, type AttachLibraryProps } from './FileBrowser/AttachLibrary';
export { FrappeConnectionIndicator, type FrappeConnectionIndicatorProps } from './FrappeConnectionIndicator';

export { SyncErrorNotice, type SyncErrorNoticeProps } from './SyncErrorNotice';

// ---------------------------------------------------------------------------
// Schema Form & Field Registry
// ---------------------------------------------------------------------------

// Shared depends_on expression evaluator (SchemaForm + backoffice form engine).
// Exported from the barrel because deep `/src/*` subpath imports do not resolve
// under the storybook workspace aliases (bare-name alias → src/index.ts).
export { compileDependsOn, evaluateDependsOn, type DependsDoc, type DependsEvaluator } from './depends-on';

export { SchemaForm, applyFieldOrder, applyOrderToSchema } from './schemaForm';
export type { SchemaFormProps, FormSchema, FormSection, FormColumn, FieldOverride } from './schemaForm';
export { SchemaWizard, schemaToWizardSteps } from './schemaForm/SchemaWizard';
export type { SchemaWizardProps } from './schemaForm/SchemaWizard';

export {
  registerField,
  getFieldComponent,
  initDefaultRegistry,
  childFieldsToColumns,
  childFieldsToDetailColumns,
  childCellHidden,
  fieldtypeToTableField,
} from './field-registry';
export { FieldOverridesProvider, useFieldResolver } from './field-overrides';
export type { FieldOverrides, FieldOverridesProviderProps } from './field-overrides';
export type { FieldRenderProps, FieldSchema, ChildTableFieldDef } from './field-registry';

export {
  resolveChoiceControl,
  parseChoiceOptions,
  SINGLE_RADIO_MAX,
  SINGLE_SELECT_MAX,
  MULTI_CHECKBOX_MAX,
} from './resolve-control';
export type { ChoiceControl, ChoiceOption, CommitMode, ResolveChoiceControlArgs } from './resolve-control';

// ---------------------------------------------------------------------------
// Frappe Field Type Renderers (map Frappe DocType field types to UI)
// ---------------------------------------------------------------------------

export { Barcode } from './fields/Barcode';
export { Check } from './fields/Check';
export type { CheckProps } from './fields/Check';
export { CodeEditorField, frappeCodeLanguage, type CodeEditorFieldProps } from './fields/CodeEditor';
export { Color } from './fields/Color';
export type { ColorProps } from './fields/Color';
export { Data } from './fields/Data';
export type { DataProps } from './fields/Data';
export { Date } from './fields/Date';
export type { DateProps } from './fields/Date';
export { DateRangeField, type DateRangeFieldProps } from './fields/DateRange';
export { Duration } from './fields/Duration';
export { FileUploadField, type FileUploadFieldProps } from './fields/FileUploadField';
export { TimePicker, type TimePickerProps } from './fields/TimePicker';
export { Geolocation } from './fields/Geolocation';
export { Heading } from './fields/Heading';
export { Html } from './fields/HTML';
export { Icon } from './fields/Icon';
export type { IconProps } from './fields/Icon';
export { LongText } from './fields/LongText';
export type { LongTextProps } from './fields/LongText';
export { MarkdownEditorField, type MarkdownEditorFieldProps } from './fields/MarkdownEditor';
export { MentionInputField, type MentionInputFieldProps } from './fields/MentionInput';
export { Numeric } from './fields/Numeric';
export type { NumericProps, NumericType } from './fields/Numeric';
export { OTPInputField, type OTPInputFieldProps } from './fields/OTPInput';
export { Password } from './fields/Password';
export type { PasswordProps } from './fields/Password';
export { Phone, type PhoneFieldProps } from './fields/Phone';
export { ProgressField, type ProgressFieldProps } from './fields/Progress';
export { RadioGroupField, type RadioGroupFieldProps } from './fields/RadioGroup';
export { Rating } from './fields/Rating';
export { ReadOnly } from './fields/ReadOnly';
export { Select } from './fields/Select';
export type { SelectProps } from './fields/Select';
export { Signature } from './fields/Signature';
export { SliderField, type SliderFieldProps } from './fields/Slider';
export { SmallText } from './fields/SmallText';
export type { SmallTextProps } from './fields/SmallText';
export { SwitchField, type SwitchFieldProps } from './fields/Switch';
// Lazy on purpose: a static re-export here defeats fieldRegistry's dynamic
// import and pins the TipTap/ProseMirror editor stack into every consumer's
// eager bundle (rolldown INEFFECTIVE_DYNAMIC_IMPORT; perf audit
// p-results/web-perf-audit.md §1.3). Render under <Suspense>.
export const TextEditor = lazy(async () => {
  const { TextEditor: component } = await import('./fields/TextEditor');
  return { default: component };
});
export { ToggleGroupField, type ToggleGroupFieldProps } from './fields/ToggleGroup';

// ---------------------------------------------------------------------------
// Frappe-Specific Fields (depend on Frappe APIs)
// ---------------------------------------------------------------------------

export { Link, type LinkProps } from './fields/Link';
export { DynamicLink, type DynamicLinkProps } from './fields/DynamicLink';
export { TableMultiSelect, type TableMultiSelectProps, type TableMultiSelectOption } from './fields/TableMultiSelect';
export { FileUpload, type FileUploadProps, type FrappeFileUploadHandler } from './fields/FileUpload';

// ---------------------------------------------------------------------------
// Desk Shell Components
// ---------------------------------------------------------------------------

export { Awesomebar, type AwesomebarProps } from './desk/awesomebar';
export {
  DeskSidebar,
  type DeskSidebarProps,
  addToRecent,
  addToFavorites,
  removeFromFavorites,
} from './desk/DeskSidebar';
export { DeskShell, type DeskShellProps } from './desk/DeskShell';
export { DeskListPage, type DeskListPageProps } from './desk/DeskListPage';
export { DeskFormPage, type DeskFormPageProps } from './desk/DeskFormPage';
export { DeskFormSidebar, type DeskFormSidebarProps } from './desk/DeskFormSidebar';

// ---------------------------------------------------------------------------
// Document Collaboration
// ---------------------------------------------------------------------------

export {
  FrappeAssignment,
  deriveAssignments,
  buildAssignmentTodo,
  type FrappeAssignmentProps,
  type FrappeAssignmentDerivation,
  type FrappeToDo,
} from './FrappeAssignment';
export { FrappeLikedBy, parseLikedBy, toggleLikedBy, type FrappeLikedByProps } from './FrappeLikedBy';
export {
  Attachments as FrappeAttachments,
  type FrappeAttachmentsProps,
  type FrappeFile,
} from './components/attachments';
export { Tags as FrappeTags, type FrappeTagsProps, type FrappeTag, type FrappeTagLink } from './components/tags';
export {
  Timeline as FrappeTimeline,
  type FrappeTimelineProps,
  type FrappeComment,
  type FrappeVersion,
} from './components/timeline';
export { useFrappeCommentActions, type FrappeCommentActions, type AddCommentInput } from './comment-actions';

// ---------------------------------------------------------------------------
// Pagination Bridge
// ---------------------------------------------------------------------------

export {
  useFrappePagination,
  type UseFrappePaginationOptions,
  type UseFrappePaginationResult,
} from './use-frappe-pagination';

// ---------------------------------------------------------------------------
// Re-exports for Convenience
// ---------------------------------------------------------------------------

// Frappe hooks
export { useFrappeCollection, useLiveQuery } from '@repo/frappe';

// Table utilities
export type { DataTableColumn } from '@repo/table';

// ---------------------------------------------------------------------------
// Report models (MPO-15, GL-28): a named query/script report and a doctype's
// report view, one model each. FrappeReportView and the desk's
// QueryReportScreen render the first through one transport;
// FrappeReportBuilder, the desk's view=report, renders the second.
// ---------------------------------------------------------------------------

export {
  FrappeReportView,
  reportColumnToDataTableColumn,
  reportFieldtypeToTableField,
  reportRowLabel,
  type FrappeReportViewProps,
} from './FrappeReportView';
export {
  buildRunFilters,
  compactFilterValues,
  compactQueryReportFilters,
  defaultFilterValues,
  extractScriptFilters,
  humanizeFrappeError,
  isEmptyFilterValue,
  normalizeFilterMeta,
  normalizeQueryReportColumns,
  normalizeQueryReportPayload,
  normalizeQueryReportRows,
  normalizeReportColumn,
  normalizeReportPayload,
  normalizeReportRows,
  scrubFieldname,
  stripHtml as stripReportHtml,
  type FrappeReportColumn,
  type FrappeReportFilterDef,
  type FrappeReportPayload,
  type FrappeReportRow,
  type FrappeReportRunResponse,
  type FrappeReportValues,
  type QueryReportColumn,
  type QueryReportFilterInput,
  type QueryReportFilterMeta,
  type QueryReportFilters,
  type QueryReportFixture,
  type QueryReportMeta,
  type QueryReportPayload,
  type QueryReportRow,
  type QueryReportRunMessage,
  type ScriptFilterExtraction,
} from './report/query-report';
export {
  reportCall,
  useFrappeReport,
  type FrappeReportConnection,
  type FrappeReportFixture,
  type UseFrappeReportOptions,
  type UseFrappeReportResult,
} from './report/use-frappe-report';
export { useQueryReport, type UseQueryReportOptions, type UseQueryReportResult } from './report/use-query-report';
export {
  buildQueryReportColumns,
  buildQueryReportCsv,
  type BuildQueryReportColumnsArgs,
} from './report/query-report-columns';
export {
  FrappeReportBuilder,
  type FrappeReportBuilderProps,
  type ReportColumn,
  type GroupByConfig,
} from './FrappeReportBuilder';
export {
  buildGridRows as buildReportGridRows,
  buildReportCsv,
  columnAlign as reportColumnAlign,
  columnFilterTuple as reportColumnFilterTuple,
  columnFilterTuples as reportColumnFilterTuples,
  compareCellValues as compareReportCellValues,
  computeTotals as computeReportTotals,
  DEFAULT_REPORT_PAGE_SIZE,
  defaultColumnWidth as defaultReportColumnWidth,
  defaultReportFieldnames,
  fromDeskReportSettings,
  orderReportRows,
  parseDeskOrderBy,
  parseReportFiltersParam,
  REPORT_NUMERIC_FIELDTYPES,
  REPORT_PAGE_SIZES,
  reportColumnsFromMeta,
  resolveSelectedColumns as resolveReportColumns,
  toDeskReportSettings,
  type DeskReportSettings,
  type ReportColumnDef,
  type ReportDataRow,
  type ReportFilters,
  type ReportGridRow,
  type ReportGroupHeader,
  type ReportMetaSource,
  type ReportRow,
  type ReportSortState,
  type ReportTotalsCell,
  type ReportViewConfig,
} from './report/report-view-model';
export { ReportGrid, type ReportGridProps } from './report/ReportGrid';
export { ReportViewToolbar, type ReportViewToolbarProps } from './report/ReportViewToolbar';
export {
  useSavedReports,
  type SavedReportSummary,
  type SavedReportsConnection,
  type UseSavedReportsResult,
} from './report/saved-reports';
export { dialogBodyMinWidth, overlayListMaxHeight } from './measures';

// ---------------------------------------------------------------------------
// Desk Form Engine (MPO-15)
// ---------------------------------------------------------------------------

// Meta-driven layout + state engine behind a desk form: tabs/sections,
// depends_on visibility, mandatory_depends_on, read_only_depends_on,
// permlevel gating, set_only_once, fetch_from locking, docstatus gating, and
// the save/submit/cancel/amend lifecycle. Hoisted out of
// @repo/backoffice so FrappeForm can reach it without a
// higher-tier import; backoffice re-exports these names from their old paths.
//
// `formActions` stays deep-import only
// (`@repo/frappe-ui/src/formEngine/form-actions`) — its RPC
// helper names collide with the list and shell surfaces.
export {
  allDocRights,
  applyFetchedValues,
  buildCopyValues,
  buildCreateDefaults,
  buildFetchMap,
  buildFormTabs,
  buildPermLevelMatrix,
  canReadLevel,
  canWriteLevel,
  computeDirtyFields,
  docinfoRights,
  docRightNames,
  fixtureDocRights,
  isEmptyValue,
  isFetchLocked,
  isPromptNamed,
  isSameValue,
  resolveDocRights,
  sessionDocRights,
  setCreatePrefill,
  takeCreatePrefill,
  useDocRights,
  useFormEngine,
  useFrappeSession,
  useSessionRoles,
} from './formEngine';
export type {
  BuildTabsOptions,
  DocFieldMeta,
  DocLinkMeta,
  DocPermissionRule,
  DocRight,
  DocRights,
  DocRightsOptions,
  DocRightsResult,
  DocShareGrant,
  DoctypeMeta,
  FetchMap,
  FetchRule,
  FormEngine,
  FormTab,
  FrappeSession,
  LevelPerm,
  PermLevelMatrix,
  ResolveDocRightsInput,
  SessionDocRightsInput,
} from './formEngine';
export { connectionFields, connectionsFromMeta, type FrappeConnection } from './frappe-connections';

// ---------------------------------------------------------------------------
// Desk List (MPO-15)
// ---------------------------------------------------------------------------

// The desk list's column derivation (title, in_list_view fields, activity)
// and the one filterable-field vocabulary both list stacks read. Hoisted out
// of @repo/backoffice so FrappeTable can default its columns
// and filter menu from them; backoffice re-exports these names from their
// old paths.
export { buildListColumns, type BuildListColumnsArgs, type ListDoc, type ListRow } from './list/list-columns';
export { listDocumentColumnIds, listFieldsToFetch, listViewFields } from './list/list-fields';
export {
  formatDateCell,
  formatTimeAgo,
  parseFrappeDate,
  parseTagsField,
  parseUserListField,
  stripHtmlPreview,
} from './list/list-format';
export { statusPillColors, type StatusPillColors } from './list/status-colors';
export {
  defaultOperatorForKind,
  DESK_OPERATOR_LABELS,
  docFieldsToFilterFields,
  draftToTuple,
  fieldKind,
  fieldLabelFor,
  filterableFieldsFromMeta,
  filterTupleLabel,
  operatorsForKind,
  quickFilterValue,
  selectOptionsFromField,
  setFieldFilter,
  standardDocFilterFields,
  standardFiltersFromMeta,
  tupleToDraft,
  type DeskOperator,
  type FilterFieldDescriptor,
  type FilterFieldKind,
  type FilterRowDraft,
} from './filter-fields';
