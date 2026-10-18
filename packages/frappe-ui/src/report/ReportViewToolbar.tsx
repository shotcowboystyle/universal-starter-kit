import { ColumnsIcon, DownloadSimpleIcon, FloppyDiskIcon, RowsIcon, StackIcon } from '@phosphor-icons/react';
import { Button, Input } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
// The report view's ONE control row (audit: the old surface stacked three
// toolbar bands with the column count shown twice). Left: column picker,
// group-by, saved-report selector + save affordances. Right: filter chips
// (?f= base filters + column-filter summary) and Export. Page size lives in
// the footer pager (list-screen parity), not here.
import { Chip, DropdownMenu, Popover, PopoverContent, XStack, YStack } from '@repo/ui';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { filterTupleLabel } from '../filterFields';
import { dialogBodyMinWidth, overlayListMaxHeight } from '../measures';

import type { ReportColumnDef, ReportFilters } from './reportViewModel';
import type { SavedReportSummary } from './savedReports';

export interface ReportViewToolbarProps {
  /** Every pickable column (reportColumnsFromMeta). */
  columns: readonly ReportColumnDef[];
  /** Selected (visible) fieldnames, in render order. */
  selected: readonly string[];
  onToggleColumn: (fieldname: string) => void;
  onResetColumns: () => void;
  groupBy: string | null;
  onGroupByChange: (fieldname: string | null) => void;
  /** Base filters (?f= deep link) — chips with a clear affordance. */
  baseFilters: ReportFilters;
  onClearBaseFilters?: () => void;
  /** Count of active column-row filters (chip + clear-all). */
  columnFilterCount: number;
  onClearColumnFilters: () => void;
  savedReports: readonly SavedReportSummary[];
  /** Selected saved report name (null = unsaved/new). */
  currentReport: string | null;
  onSelectReport: (name: string | null) => void;
  /** Save under a (new or existing) name. Absent, the view saves nothing. */
  onSaveReport?: (name: string) => void;
  /** Absent, a saved report cannot be deleted from here. */
  onDeleteReport?: (name: string) => void;
  /** Absent, the Export button is left out (no download path here). */
  onExport?: () => void;
  exportDisabled?: boolean;
}

export function ReportViewToolbar({
  columns,
  selected,
  onToggleColumn,
  onResetColumns,
  groupBy,
  onGroupByChange,
  baseFilters,
  onClearBaseFilters,
  columnFilterCount,
  onClearColumnFilters,
  savedReports,
  currentReport,
  onSelectReport,
  onSaveReport,
  onDeleteReport,
  onExport,
  exportDisabled,
}: ReportViewToolbarProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const selectedSet = new Set(selected);
  const groupByColumn = groupBy ? columns.find((column) => column.fieldname === groupBy) : undefined;
  const currentSummary = currentReport ? savedReports.find((report) => report.name === currentReport) : undefined;

  const handleSaveAs = () => {
    const name = saveName.trim();
    if (!name || !onSaveReport) {
      return;
    }
    onSaveReport(name);
    setSaveOpen(false);
    setSaveName('');
  };

  return (
    <XStack
      alignItems="center"
      flexWrap="wrap"
      gap="$2"
      {...knobProps.panelPadding}
      paddingVertical="$2">
      {/* Column add/remove picker (persisted per doctype) */}
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="$3"
            chromeless
            icon={ColumnsIcon}>
            {t('report.columns', {
              defaultValue: 'Columns ({{enabled}}/{{total}})',
              enabled: selected.length,
              total: columns.length,
            })}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
          <DropdownMenu.Label>{t('report.pickColumns', 'Report columns')}</DropdownMenu.Label>
          {columns.map((column) => {
            const isSelected = selectedSet.has(column.fieldname);
            const lastSelected = isSelected && selected.length === 1;
            return (
              <DropdownMenu.CheckboxItem
                key={column.fieldname}
                checked={isSelected}
                disabled={lastSelected}
                disabledReason={lastSelected ? t('report.lastColumn', 'At least one column stays visible') : undefined}
                onCheckedChange={() => {
                  onToggleColumn(column.fieldname);
                }}>
                {column.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={onResetColumns}>
            {t('report.resetColumns', 'Reset to default columns')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Group-by (rendered as in-grid group header rows) */}
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="$3"
            chromeless
            icon={RowsIcon}>
            {groupByColumn
              ? t('report.groupByActive', {
                  defaultValue: 'Group by: {{field}}',
                  field: groupByColumn.label,
                })
              : t('report.groupBy', 'Group by')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
          <DropdownMenu.CheckboxItem
            checked={!groupBy}
            closeOnSelect
            onCheckedChange={() => {
              onGroupByChange(null);
            }}>
            {t('report.groupByNone', 'No grouping')}
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator />
          {columns.map((column) => (
            <DropdownMenu.CheckboxItem
              key={column.fieldname}
              checked={groupBy === column.fieldname}
              closeOnSelect
              onCheckedChange={() => {
                onGroupByChange(column.fieldname);
              }}>
              {column.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Saved-report selector (desk "Select Report": Report Builder docs) */}
      {(onSaveReport || savedReports.length > 0) && (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button
              size="$3"
              chromeless
              icon={StackIcon}>
              {currentSummary
                ? t('report.savedReportActive', {
                    defaultValue: 'Report: {{name}}',
                    name: currentSummary.reportName,
                  })
                : t('report.savedReport', 'Select Report')}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
            <DropdownMenu.CheckboxItem
              checked={!currentReport}
              closeOnSelect
              onCheckedChange={() => {
                onSelectReport(null);
              }}>
              {t('report.savedReportNone', 'New report (unsaved)')}
            </DropdownMenu.CheckboxItem>
            {savedReports.length > 0 && <DropdownMenu.Separator />}
            {savedReports.map((report) => (
              <DropdownMenu.CheckboxItem
                key={report.name}
                checked={currentReport === report.name}
                closeOnSelect
                onCheckedChange={() => {
                  onSelectReport(report.name);
                }}>
                {report.reportName}
              </DropdownMenu.CheckboxItem>
            ))}
            {currentSummary && onDeleteReport && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  destructive
                  onSelect={() => {
                    onDeleteReport(currentSummary.name);
                  }}>
                  {t('report.deleteReport', {
                    defaultValue: 'Delete “{{name}}”',
                    name: currentSummary.reportName,
                  })}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}

      {/* Save (overwrite the selected report) + Save As (new Report doc) */}
      {currentSummary && onSaveReport && (
        <Button
          size="$3"
          icon={FloppyDiskIcon}
          onPress={() => {
            onSaveReport(currentSummary.name);
          }}>
          {t('report.save', 'Save')}
        </Button>
      )}
      {onSaveReport && (
        <Popover
          placement="bottom-start"
          open={saveOpen}
          onOpenChange={setSaveOpen}>
          <Popover.Trigger asChild>
            <Button
              size="$3"
              chromeless={!!currentSummary}
              icon={currentSummary ? undefined : FloppyDiskIcon}>
              {t('report.saveAs', 'Save As…')}
            </Button>
          </Popover.Trigger>
          {/* House overlay surface (elevatedSurface knob recipe) — raw
            Popover.Content has no `elevate` variant in tamagui 2.0, so the
            bare boolean leaked to the DOM (LC-46 class). */}
          <PopoverContent {...knobProps.panelPadding}>
            <Popover.Arrow
              borderWidth={1}
              borderColor="$borderColor"
            />
            <XStack
              gap="$2"
              alignItems="center"
              minWidth={dialogBodyMinWidth}>
              <YStack
                flex={1}
                minWidth={0}>
                <Input
                  size="$3"
                  compact
                  value={saveName}
                  onChangeText={setSaveName}
                  placeholder={t('report.reportNamePlaceholder', 'New report name')}
                  inputProps={{
                    'aria-label': t('report.reportNamePlaceholder', 'New report name'),
                  }}
                />
              </YStack>
              <Button
                size="$3"
                accent
                disabled={!saveName.trim()}
                disabledReason={t('report.saveNeedsName', 'Name the report to save it')}
                disabledReasonPlacement="inline"
                onPress={handleSaveAs}>
                {t('report.save', 'Save')}
              </Button>
            </XStack>
          </PopoverContent>
        </Popover>
      )}

      <XStack flex={1} />

      {/* Base filter chips (?f= deep link) */}
      {baseFilters.map((tuple, index) => (
        <Chip
          key={`${tuple[0]}-${index}`}
          size="$2"
          variant="subtle"
          color="gray">
          {filterTupleLabel([...columns], tuple)}
        </Chip>
      ))}
      {onClearBaseFilters && baseFilters.length > 0 && (
        <Button
          size="$3"
          chromeless
          onPress={onClearBaseFilters}>
          {t('report.clearFilters', 'Clear filters')}
        </Button>
      )}

      {/* Column filter-row summary + clear-all */}
      {columnFilterCount > 0 && (
        <Button
          size="$3"
          chromeless
          onPress={onClearColumnFilters}>
          {t('report.clearColumnFilters', {
            defaultValue: 'Clear column filters ({{count}})',
            count: columnFilterCount,
          })}
        </Button>
      )}

      {onExport && (
        <Button
          size="$3"
          icon={DownloadSimpleIcon}
          disabled={exportDisabled}
          disabledReason={exportDisabled ? t('report.exportEmpty', 'No rows to export') : undefined}
          disabledReasonPlacement="inline"
          onPress={onExport}>
          {t('report.export', 'Export CSV')}
        </Button>
      )}
    </XStack>
  );
}
