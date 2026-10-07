/**
 * @repo/backoffice — embeddable Frappe desk recreation.
 *
 * Mount BackofficeProvider (frappe connection + navigation adapter +
 * capability flags) around the surfaces you want; BackofficeShell is the
 * full desk chrome. See README.md for the embedding story.
 *
 * The one-router adapter lives on the `./one-adapter` subpath so this entry
 * stays router-free.
 */

// Provider + config
export {
  actionsForDoctype,
  BackofficeProvider,
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeLocation,
  useBackofficeNavigator,
  useBackofficePaths,
  useBackofficeSlots,
  useIsDoctypeAllowed,
} from './config/BackofficeProvider';
export type {
  BackofficeAction,
  BackofficeActionContext,
  BackofficeActions,
  BackofficeAppearance,
  BackofficeConfig,
  BackofficeFrappeConfig,
  BackofficeProviderProps,
} from './config/BackofficeProvider';
export { isDoctypeAllowed, resolveCapabilities } from './config/capabilities';
export type {
  BackofficeCapabilities,
  BackofficeDoctypeScope,
  CapabilityInput,
  ResolvedBackofficeCapabilities,
  ResolvedCapability,
  ResolvedExitToSite,
} from './config/capabilities';
export type { BackofficeEvent, BackofficeEventHandler } from './config/events';
export type { BackofficeSlots } from './config/slots';

// Desk — the whole desk as one importable component (spec 09)
export { Desk } from './desk/Desk';
export type { DeskChrome, DeskProps } from './desk/Desk';
export { DeskSurface } from './desk/DeskSurface';
export type { DeskSurfaceKind, DeskSurfaceOverride, DeskSurfaceOverrides, DeskSurfaceProps } from './desk/DeskSurface';
export { resolveDeskPath } from './desk/resolveDeskPath';
export type { DeskAddress, DeskViewParams } from './desk/resolveDeskPath';
export { guessDeskTarget, useDeskTarget } from './desk/target';
export type { DeskPins, DeskTarget } from './desk/target';
export { DeskScopeProvider, useDeskScope, useScopedFilters } from './desk/scope';
export type { DeskScopeProviderProps } from './desk/scope';

// Navigation seam
export {
  ControlledNavigator,
  MemoryNavigator,
  createMemoryNavigator,
  createNoopNavigator,
  parseBackofficeHref,
} from './navigation/navigator';
export type {
  BackofficeLocation,
  BackofficeNavigator,
  BackofficeParams,
  ControlledNavigatorHandlers,
} from './navigation/navigator';
export {
  BACKOFFICE_BASE,
  BACKOFFICE_VIEWS,
  createBackofficePaths,
  formPath,
  homePath,
  isBackofficeView,
  listPath,
  newDocPath,
  parseDocDefaults,
  QUERY_REPORT_BASE,
  queryReportPath,
  slugToDisplayName,
  toSlug,
  viewPath,
  workspacePath,
} from './navigation/paths';
export type { BackofficePath, BackofficePaths, BackofficeSubPath, BackofficeView } from './navigation/paths';

// i18n
export { BACKOFFICE_I18N_NAMESPACE, registerBackofficeTranslations } from './i18n';

// Shell
export { BackofficeShell } from './shell/BackofficeShell';
export type { BackofficeShellProps } from './shell/BackofficeShell';
export { HomeRedirect } from './shell/HomeRedirect';
export { SlugScreen } from './shell/SlugScreen';
export type { SlugScreenProps } from './shell/SlugScreen';
export { NotFoundScreen } from './shell/NotFoundScreen';
export { WORKSPACE_SIDEBAR_WIDTH, WorkspaceSidebar } from './shell/WorkspaceSidebar';
export type { WorkspaceSidebarProps } from './shell/WorkspaceSidebar';
export { useDefaultWorkspace, useSessionUser, useWorkspaces } from './shell/useWorkspaces';
export type { WorkspaceDoc, WorkspacesResult } from './shell/useWorkspaces';
export { workspaceIcon } from './shell/workspaceIcons';

// Chrome
export { BackofficeAwesomebar } from './chrome/BackofficeAwesomebar';
export type { BackofficeAwesomebarHandle, BackofficeAwesomebarProps } from './chrome/BackofficeAwesomebar';
export { CommandPalette } from './chrome/CommandPalette';
export type { CommandPaletteProps } from './chrome/CommandPalette';
export { useCommandPaletteModel } from './chrome/command-palette-model';
export type {
  CommandPaletteItem,
  CommandPaletteModel,
  CommandPaletteSection,
  CommandPaletteSectionId,
  UseCommandPaletteModelOptions,
} from './chrome/command-palette-model';
export {
  rankNameMatches,
  readRecentItems,
  toContentSnippet,
  useAwesomebarCatalog,
  useGlobalSearch,
} from './chrome/awesomebar-data';
export type {
  AwesomebarCatalog,
  AwesomebarCatalogState,
  AwesomebarWorkspace,
  GlobalSearchHit,
  GlobalSearchState,
  RecentItem,
} from './chrome/awesomebar-data';
export { NotificationsButton } from './chrome/NotificationsButton';
export { NotificationsPanel } from './chrome/notifications-panel';
export type { NotificationsPanelProps } from './chrome/notifications-panel';
export { useNotifications } from './chrome/notifications-data';
export type { NotificationItem, NotificationLogDoc, UseNotificationsResult } from './chrome/notifications-data';
export { parseFrappeTimestamp, stripHtmlToText } from './chrome/notifications-utils';
export { HelpMenu } from './chrome/HelpMenu';
export { HelpAboutDialog } from './chrome/help-about-dialog';
export type { FrappeAppVersion, HelpAboutDialogProps } from './chrome/help-about-dialog';
export { HelpShortcutsDialog } from './chrome/help-shortcuts-dialog';
export type { HelpShortcutsDialogProps } from './chrome/help-shortcuts-dialog';
export { UserMenu } from './chrome/UserMenu';
export type { UserMenuProps } from './chrome/UserMenu';
export { clearSessionUserCache, resolveUserImageUrl, useSessionUserInfo } from './chrome/user-session';
export type { SessionUserInfo } from './chrome/user-session';
export { useBackofficeShortcuts } from './chrome/shortcuts';
export type { BackofficeShortcutHandlers } from './chrome/shortcuts';

// Shared
export { useFrappeApp } from './shared/useFrappeApp';
export type { FrappeFilter, FrappeFilters, SlugTarget } from './shared/types';
export { useDoctypeMeta } from './shared/useDoctypeMeta';
export type {
  DocFieldMeta,
  DocLinkMeta,
  DocPermissionRule,
  DoctypeMeta,
  DoctypeMetaBundle,
} from './shared/useDoctypeMeta';
export { invalidateDocinfo, useDocinfo } from './shared/useDocinfo';
export type { DocInfo, DocInfoComment } from './shared/useDocinfo';
export { useSlugTarget } from './shared/useSlugTarget';
export { useUserRoles } from './shared/useUserRoles';
export { useRecentVisit } from './shared/useRecentVisit';
export type { RecentVisit } from './shared/useRecentVisit';
export { useSessionUserId } from './shared/useSessionUserId';

// Workspace surface
export type {
  FrappeFilterTuple,
  WorkspaceBlock,
  WorkspaceBlockType,
  WorkspaceChartRow,
  WorkspaceLinkGroup,
  WorkspaceLinkRow,
  WorkspaceNumberCardRow,
  WorkspaceDoc as WorkspacePageDoc,
  WorkspaceQuickListRow,
  WorkspaceShortcutRow,
} from './workspace/types';
export {
  composeWorkspaceBlocks,
  findLinkGroup,
  findShortcut,
  groupLinks,
  headerLevel,
  parseFrappeFilters,
  parseWorkspaceContent,
  stripHtml,
} from './workspace/parseContent';
export type { WorkspaceComposition } from './workspace/parseContent';
export { useFrappeDoc, useWorkspaceDoc } from './workspace/useWorkspaceDoc';
export type { UseFrappeDocResult } from './workspace/useWorkspaceDoc';
export { useDashboardChartData } from './workspace/useDashboardChart';
export type {
  DashboardChartDoc,
  DashboardChartSeries,
  UseDashboardChartDataResult,
} from './workspace/useDashboardChart';
export { WorkspaceGrid } from './workspace/WorkspaceGrid';
export type { WorkspaceGridItem, WorkspaceGridProps } from './workspace/WorkspaceGrid';
export { WorkspaceLinkCard, resolveLinkTarget } from './workspace/WorkspaceLinkCard';
export type { WorkspaceLinkCardProps } from './workspace/WorkspaceLinkCard';
export { WorkspaceShortcut, resolveShortcutTarget } from './workspace/WorkspaceShortcut';
export type { WorkspaceShortcutProps } from './workspace/WorkspaceShortcut';
export { WorkspaceQuickList } from './workspace/WorkspaceQuickList';
export type { WorkspaceQuickListProps } from './workspace/WorkspaceQuickList';
export { WorkspaceNumberCard } from './workspace/WorkspaceNumberCard';
export type { NumberCardDoc, WorkspaceNumberCardProps } from './workspace/WorkspaceNumberCard';
export { WorkspaceChartBlock } from './workspace/WorkspaceChartBlock';
export type { WorkspaceChartBlockProps } from './workspace/WorkspaceChartBlock';
export { WorkspaceLinkDirectory, filterLinkGroup } from './workspace/WorkspaceLinkDirectory';
export type { WorkspaceLinkDirectoryItem, WorkspaceLinkDirectoryProps } from './workspace/WorkspaceLinkDirectory';
export { WorkspaceRecents } from './workspace/WorkspaceRecents';
export { WorkspaceScreen } from './workspace/WorkspaceScreen';
export type { WorkspaceBlockKind, WorkspaceScreenProps } from './workspace/WorkspaceScreen';

// Form surface
// (formActions / sidebar-rpc / sidebar-utils / timeline-utils are deep-import
// only — `@repo/backoffice/src/form/*` — their utility names
// collide across modules and with the list/shell surfaces.)
export { buildPermLevelMatrix, canReadLevel, canWriteLevel } from './form/fieldPermissions';
export type { LevelPerm, PermLevelMatrix } from './form/fieldPermissions';
export { compileDependsOn, evaluateDependsOn } from './form/dependsOn';
export type { DependsDoc, DependsEvaluator } from './form/dependsOn';
export { applyFetchedValues, buildFetchMap, isFetchLocked } from './form/fetchFrom';
export type { FetchMap, FetchRule } from './form/fetchFrom';
export { computeDirtyFields, isEmptyValue, isSameValue } from './form/dirtyTracking';
export { setCreatePrefill, takeCreatePrefill } from './form/createPrefill';
export { normalizeDocPermissions } from './form/docinfo';
export { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from './form/formLayout';
export type { BuildTabsOptions, FormTab } from './form/formLayout';
export {
  canOpenNewTab,
  openInNewTab,
  useBeforeUnloadGuard,
  useNavigationDirtyGuard,
  useSaveShortcut,
} from './form/platformHooks';
export { useFormEngine } from './form/useFormEngine';
export type { FormEngine } from './form/useFormEngine';
export {
  connectionListFilters,
  connectionListHref,
  formatConnectionCount,
  groupConnectionLinks,
  useConnectionCounts,
} from './form/connections-data';
export type { ConnectionCount, ConnectionCounts, ConnectionGroup, ConnectionLink } from './form/connections-data';
export { buildTimelineFeed, filterTimelineFeed, parseVersionData, versionSummary } from './form/timeline-entries';
export type {
  ParsedVersionData,
  TimelineDocinfoLike,
  TimelineFeedEntry,
  TimelineFeedKind,
  TimelineFilterValue,
  TimelineRowLike,
  TimelineTranslate,
  TimelineUserInfoLike,
  VersionFieldChange,
} from './form/timeline-entries';
export { frappeColorToChipColor, FormToolbar, resolveIndicator } from './form/FormToolbar';
export type {
  DocIndicator,
  DocIndicatorSpec,
  DocStatusIndicator,
  FormToolbarMenuItem,
  FormToolbarProps,
} from './form/FormToolbar';
export { AssignDialog, EmailDialog, RenameDialog } from './form/FormDialogs';
export type { AssignDialogProps, EmailDialogProps, RenameDialogProps } from './form/FormDialogs';
export { SidebarAvatarStrip, SidebarPeopleList } from './form/sidebar-people';
export type { SidebarAvatarStripProps, SidebarPeopleListProps, SidebarPersonItem } from './form/sidebar-people';
export { SidebarAttachments } from './form/sidebar-attachments';
export type { SidebarAttachmentItem, SidebarAttachmentsProps } from './form/sidebar-attachments';
export { SidebarAssignDialog, SidebarShareDialog } from './form/sidebar-dialogs';
export type { SidebarAssignDialogProps, SidebarShareDialogProps } from './form/sidebar-dialogs';
export { FormHeaderCluster } from './form/FormHeaderCluster';
export type { FormHeaderClusterProps } from './form/FormHeaderCluster';
export { FormSidebarPanel } from './form/FormSidebarPanel';
export type { FormSidebarPanelMetaLike, FormSidebarPanelProps } from './form/FormSidebarPanel';
export { FormTimeline } from './form/FormTimeline';
export type { FormTimelineProps } from './form/FormTimeline';
export { FormConnections } from './form/FormConnections';
export type { FormConnectionsProps } from './form/FormConnections';
export { DocFormScreen } from './form/DocFormScreen';
export type { DocFormActionOverrides, DocFormScreenProps } from './form/DocFormScreen';

// Quick entry surface
export {
  buildQuickEntryDefaults,
  buildQuickEntrySchema,
  isEmptyFieldValue,
  parseServerError,
  planQuickEntry,
  PROMPT_NAME_FIELD,
  resolveCreatedName,
} from './quickEntry/quickEntryPlan';
export type { ParsedServerError, QuickEntryPlan } from './quickEntry/quickEntryPlan';
export { QuickEntryDialog } from './quickEntry/QuickEntryDialog';
export type { QuickEntryDialogProps } from './quickEntry/QuickEntryDialog';

// List surface
export { statusPillColors } from './list/statusColors';
export type { StatusPillColors } from './list/statusColors';
export { formatDateCell, formatTimeAgo, parseFrappeDate, parseTagsField, parseUserListField } from './list/listFormat';
export {
  frappeFiltersToTableFilters,
  frappeTupleToFilterValue,
  sameFilterTuple,
  tableStateToFrappeFilters,
  toggleFilterTuple,
} from './list/filterConversion';
export { bulkAddTag, bulkAssign, bulkDelete, toggleLike } from './list/bulkActions';
export type { BulkFailure, BulkResult } from './list/bulkActions';
export { listFieldsToFetch, listViewFields } from './list/listFields';
export {
  defaultOperatorForKind,
  DESK_OPERATOR_LABELS,
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
} from './list/filter-fields';
export type { DeskOperator, FilterFieldDescriptor, FilterFieldKind, FilterRowDraft } from './list/filter-fields';
export { FilterChips } from './list/filter-chips';
export type { FilterChipsProps } from './list/filter-chips';
export { FilterEditorButton, FilterEditorPanel } from './list/filter-editor';
export type { FilterEditorButtonProps, FilterEditorPanelProps } from './list/filter-editor';
export { sortableFieldsFromMeta, SortControl } from './list/filter-sort';
export type { SortControlProps } from './list/filter-sort';
export { StandardFilters } from './list/filter-standard';
export type { StandardFiltersProps } from './list/filter-standard';
export { SavedFiltersControl } from './list/filter-saved';
export type { SavedFiltersControlProps } from './list/filter-saved';
export { SidebarFacetRow, SidebarSection, SidebarSectionSkeleton } from './list/sidebar-section';
export type { SidebarFacetRowProps, SidebarSectionProps, SidebarSectionSkeletonProps } from './list/sidebar-section';
export {
  filtersExcludingField,
  isFacetFilterActive,
  NO_TAGS_LABEL,
  scrubUserFacetRows,
  toggleFacetFilter,
  useSidebarStats,
} from './list/sidebar-stats';
export type {
  SidebarFacetCount,
  SidebarFacetState,
  SidebarStatsState,
  UseSidebarStatsOptions,
} from './list/sidebar-stats';
export { ListSidebar } from './list/ListSidebar';
export type { ListSidebarProps, ListSidebarSection } from './list/ListSidebar';
export { AddTagsDialog } from './list/AddTagsDialog';
export type { AddTagsDialogProps } from './list/AddTagsDialog';
export { AssignToDialog } from './list/AssignToDialog';
export type { AssignToDialogProps } from './list/AssignToDialog';
export {
  BULK_EDIT_EXCLUDED_FIELDTYPES,
  bulkEditableFields,
  BulkEditDialog,
  bulkSetValue,
} from './list/bulk-edit-dialog';
export type { BulkEditDialogProps, BulkEditValue } from './list/bulk-edit-dialog';
export { buildCsv, bulkExportCsv, downloadTextFile, exportFieldnames } from './list/bulk-export';
export type { BulkExportResult } from './list/bulk-export';
export { bulkSubmitCancel } from './list/bulk-submit-cancel';
export type { BulkDocstatusAction, BulkSubmitCancelResult } from './list/bulk-submit-cancel';
export { ListBulkActionsBar } from './list/ListBulkActionsBar';
export type { ListBulkActionsBarProps } from './list/ListBulkActionsBar';
export { ListToolsButton } from './list/list-tools-sheet';
export type { ListToolsButtonProps } from './list/list-tools-sheet';
export { buildListColumns } from './list/listColumns';
export type { BuildListColumnsArgs, ListDoc, ListRow } from './list/listColumns';
export { ListFilterBar } from './list/ListFilterBar';
export type { ListFilterBarProps } from './list/ListFilterBar';
export { DoctypeListScreen } from './list/DoctypeListScreen';
export type { DoctypeListScreenProps } from './list/DoctypeListScreen';

// Views surface
export {
  detectCardFields,
  detectDateFields,
  detectImageField,
  detectSelectField,
  selectFieldOptions,
  useViewMeta,
} from './views/viewMeta';
export type { AnyDoc, DetectedCardFields, DetectedDateFields } from './views/viewMeta';
export { useCalendarViewSettings, useKanbanBoard } from './views/deskViewConfigs';
export type {
  CalendarViewDoc,
  ConfigDocResult,
  KanbanBoardColumnConfig,
  KanbanBoardDoc,
} from './views/deskViewConfigs';
export { useViewConnection } from './views/connection';
export type { ViewConnection } from './views/connection';
export { kanbanFieldCandidates, KanbanFieldPicker, preferredKanbanField } from './views/kanban-field-picker';
export type { KanbanFieldOption, KanbanFieldPickerProps } from './views/kanban-field-picker';
export { addKanbanColumn, createKanbanBoard, parseBoardFilters, setKanbanColumnStatus } from './views/kanbanBoardOps';
export type { CreateKanbanBoardInput } from './views/kanbanBoardOps';
export { CreateBoardDialog, KanbanBoardEnd, KanbanBoardPicker, KanbanColumnMenu } from './views/kanban-board-controls';
export type {
  CreateBoardDialogProps,
  KanbanBoardEndProps,
  KanbanBoardPickerProps,
  KanbanColumnMenuProps,
} from './views/kanban-board-controls';
export { calendarDateFieldCandidates, CalendarFieldSelector } from './views/calendar-field-selector';
export type { CalendarFieldSelectorProps } from './views/calendar-field-selector';
export { REPORT_NUMERIC_FIELDTYPES, REPORT_PAGE_SIZES, ReportFooter, ReportToolbar } from './views/report-controls';
export type { ReportFooterProps, ReportRecordRef, ReportToolbarProps, ReportTotal } from './views/report-controls';
export {
  daysAgoIso,
  detectStatusField,
  filteredListHref,
  isoDate,
  MAX_STATUS_KPI_CARDS,
  useWeeklyCreated,
  WEEKS_WINDOW,
  weekStart,
} from './views/dashboard-data';
export type { WeeklyCreatedPoint, WeeklyCreatedState } from './views/dashboard-data';
export { BackToListButton, ViewError, ViewLoading, ViewUnsupported } from './views/ViewStates';
export type { ViewErrorProps, ViewUnsupportedProps } from './views/ViewStates';
export { useAvailableViews, ViewHeader } from './views/ViewHeader';
export { useViewLabels, ViewSwitcherMenu } from './views/ViewSwitcherMenu';
export type { ViewSwitcherMenuProps } from './views/ViewSwitcherMenu';
export { deriveAvailableViews, isViewSupported } from './views/viewAvailability';
export type { DeriveAvailableViewsOptions } from './views/viewAvailability';
export type { ViewHeaderProps } from './views/ViewHeader';
export { parseReportFiltersParam, ReportView } from './views/ReportView';
export type { ReportViewProps } from './views/ReportView';
export { KanbanView } from './views/KanbanView';
export type { KanbanViewProps } from './views/KanbanView';
export { CalendarView } from './views/CalendarView';
export type { CalendarViewProps } from './views/CalendarView';
export { TreeView } from './views/TreeView';
export type { TreeViewProps } from './views/TreeView';
export { ImageView } from './views/ImageView';
export type { ImageViewProps } from './views/ImageView';
export { DashboardView } from './views/DashboardView';
export type { DashboardViewProps } from './views/DashboardView';
export { DoctypeViewScreen } from './views/DoctypeViewScreen';
export type { DoctypeViewScreenProps } from './views/DoctypeViewScreen';

// Query-report surface
// (reportShapes' `stripHtml` ships as `stripReportHtml` — the plain name
// belongs to the workspace parseContent module.)
export {
  buildRunFilters,
  compactQueryReportFilters,
  defaultFilterValues,
  extractScriptFilters,
  humanizeFrappeError,
  isEmptyFilterValue,
  normalizeFilterMeta,
  normalizeQueryReportColumns,
  normalizeQueryReportRows,
  scrubFieldname,
  stripHtml as stripReportHtml,
} from './report/reportShapes';
export type {
  QueryReportColumn,
  QueryReportFilterMeta,
  QueryReportFilters,
  QueryReportFixture,
  QueryReportMeta,
  QueryReportRow,
  QueryReportRunMessage,
  ScriptFilterExtraction,
} from './report/reportShapes';
export { parseQueryReportFiltersParam, serializeQueryReportFiltersParam } from './report/queryReportUrlState';
export { useQueryReport } from './report/useQueryReport';
export type { UseQueryReportOptions, UseQueryReportResult } from './report/useQueryReport';
export { buildQueryReportColumns } from './report/queryReportColumns';
export type { BuildQueryReportColumnsArgs } from './report/queryReportColumns';
export { QueryReportScreen } from './report/QueryReportScreen';
export type { QueryReportScreenProps } from './report/QueryReportScreen';

// Doctype report-view surface (desk report-builder parity; mounted for
// view=report by DoctypeViewScreen). Model names are report-prefixed to
// stay clear of the list/table filter vocabulary.
export {
  buildGridRows as buildReportGridRows,
  buildReportCsv,
  columnFilterTuple as reportColumnFilterTuple,
  columnFilterTuples as reportColumnFilterTuples,
  computeTotals as computeReportTotals,
  defaultReportFieldnames,
  fromDeskReportSettings,
  orderReportRows,
  parseDeskOrderBy,
  reportColumnsFromMeta,
  resolveSelectedColumns as resolveReportColumns,
  toDeskReportSettings,
} from './report/reportViewModel';
export type {
  DeskReportSettings,
  ReportColumnDef,
  ReportGridRow,
  ReportRow,
  ReportSortState,
  ReportTotalsCell,
  ReportViewConfig,
} from './report/reportViewModel';
export { useSavedReports } from './report/savedReports';
export type { SavedReportSummary, UseSavedReportsResult } from './report/savedReports';
export { ReportGrid } from './report/report-grid';
export type { ReportGridProps } from './report/report-grid';
export { ReportToolbar as DoctypeReportToolbar } from './report/report-toolbar';
export type { ReportToolbarProps as DoctypeReportToolbarProps } from './report/report-toolbar';
export { DoctypeReportView } from './report/DoctypeReportView';
export type { DoctypeReportViewProps } from './report/DoctypeReportView';
