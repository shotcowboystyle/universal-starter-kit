import { EyeIcon, EyeSlashIcon, ArrowCounterClockwiseIcon, FloppyDiskIcon, GearIcon } from '@phosphor-icons/react';
import { Button, FloatingPanel, Input, Slider, Switch } from '@repo/forms';
import { getGroupPosition, stackRadiusProps, useResolvedKnobs } from '@repo/theme';
import { DropdownMenu, ScrollView } from '@repo/ui';
import React, { useState } from 'react';
import { Separator, Text, View, XStack, YStack, useTheme } from 'tamagui';

import { t } from '../../shared/t';
import type { TableView } from '../../types';
import { iconSizeForToken } from '../../utils/chrome-icons';
import { useDataTableState } from '../DataTable/data-table-state-context';

export interface DataTableViewOptionsProps {
  // Column Management
  columns?: {
    id: string;
    label: string;
    visible: boolean;
    order: number;
    width?: number;
    canHide?: boolean;
    canResize?: boolean;
    canReorder?: boolean;
  }[];
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;
  onColumnOrderChange?: (columnOrder: string[]) => void;
  onColumnSizingChange?: (columnSizing: Record<string, number>) => void;

  // View Management
  views?: TableView[];
  activeViewId?: string;
  onSaveView?: (name: string) => void;
  onLoadView?: (viewId: string) => void;
  onResetToDefault?: () => void;

  // Options
  showColumnVisibility?: boolean;
  showColumnOrdering?: boolean;
  showColumnResizing?: boolean;
  showViewManagement?: boolean;
  compact?: boolean;
}

type ViewOptionsColumn = NonNullable<DataTableViewOptionsProps['columns']>[number];

const noop = (): void => undefined;

const isString = (value: unknown): value is string => typeof value === 'string';

const bySizeToken = (sz: string, small: number, medium: number, large: number) => {
  if (sz === '$3') {
    return small;
  }
  if (sz === '$5') {
    return large;
  }
  return medium;
};

// Column Visibility Section

interface ColumnVisibilitySectionProps {
  visibleColumns: {
    id: string;
    label: string;
    visible: boolean;
    order: number;
  }[];
  hiddenColumns: {
    id: string;
    label: string;
    visible: boolean;
    order: number;
  }[];
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
}

/**
 * SP-FIXED touch floor for the per-column visibility toggles: the pressable
 * frame grows (invisibly) to 44px while the visible track keeps its
 * knob-derived size, so every toggle is individually hittable and rows
 * never overlap.
 */
const VISIBILITY_TOGGLE_TARGET = 44;

const ColumnVisibilitySection = ({
  visibleColumns,
  hiddenColumns,
  onColumnVisibilityChange,
}: ColumnVisibilitySectionProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);
  // Phosphor icons are plain SVGs — they need a resolved CSS color, not a
  // Tamagui token string. Neutral steps only: the switch owns the checked
  // state, so the glyph never carries a second (hue-coded) state signal
  // (LC-05 ONE-EMPHASIS).
  const theme = useTheme();
  const iconColorValue: unknown = theme.color11?.get();
  const mutedIconColorValue: unknown = theme.color10?.get();
  const iconColor = isString(iconColorValue) ? iconColorValue : undefined;
  const mutedIconColor = isString(mutedIconColorValue) ? mutedIconColorValue : undefined;
  return (
    <YStack {...knobProps.gap}>
      <Text
        {...knobProps.label}
        fontWeight="400">
        {t('Column Visibility')}
      </Text>

      {/* Visible Columns */}
      {visibleColumns.length > 0 && (
        <YStack gap="$2">
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('Visible Columns')}
          </Text>
          <YStack gap="$1">
            {visibleColumns.map((column) => (
              <XStack
                key={column.id}
                alignItems="center"
                justifyContent="space-between">
                <XStack
                  alignItems="center"
                  gap="$2">
                  <EyeIcon
                    size={iconPx}
                    color={iconColor}
                  />
                  <Text fontSize="$3">{column.label}</Text>
                </XStack>
                <Switch
                  minTargetHeight={VISIBILITY_TOGGLE_TARGET}
                  checked={column.visible}
                  onChange={(checked) => {
                    onColumnVisibilityChange(column.id, checked);
                  }}
                  // DG-A11Y-06 / Axiom 12: icon-less toggle needs a per-column name.
                  switchProps={{
                    'aria-label': t('Show {{column}} column', { column: column.label }),
                  }}
                />
              </XStack>
            ))}
          </YStack>
        </YStack>
      )}

      {/* Hidden Columns */}
      {hiddenColumns.length > 0 && (
        <YStack gap="$2">
          <Text
            {...knobProps.label}
            fontWeight="400"
            color="$color10">
            {t('Hidden Columns')}
          </Text>
          <YStack gap="$1">
            {hiddenColumns.map((column) => (
              <XStack
                key={column.id}
                alignItems="center"
                justifyContent="space-between">
                <XStack
                  alignItems="center"
                  gap="$2">
                  <EyeSlashIcon
                    size={iconPx}
                    color={mutedIconColor}
                  />
                  <Text
                    fontSize="$3"
                    color="$color10">
                    {column.label}
                  </Text>
                </XStack>
                <Switch
                  minTargetHeight={VISIBILITY_TOGGLE_TARGET}
                  checked={column.visible}
                  onChange={(checked) => {
                    onColumnVisibilityChange(column.id, checked);
                  }}
                  switchProps={{
                    'aria-label': t('Show {{column}} column', { column: column.label }),
                  }}
                />
              </XStack>
            ))}
          </YStack>
        </YStack>
      )}
    </YStack>
  );
};

// Column Resizing Section

interface ColumnResizingSectionProps {
  columns: {
    id: string;
    label: string;
    width?: number;
  }[];
  columnWidths: Record<string, number>;
  onColumnWidthChange: (columnId: string, width: number) => void;
}

const ColumnResizingSection = ({ columns, columnWidths, onColumnWidthChange }: ColumnResizingSectionProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack gap="$3">
      <Text
        {...knobProps.label}
        fontWeight="400">
        {t('Column Widths')}
      </Text>

      <YStack gap="$3">
        {columns.map((column) => (
          <YStack
            key={column.id}
            gap="$2">
            <Text
              {...knobProps.label}
              fontWeight="400">
              {column.label}
            </Text>
            <XStack
              alignItems="center"
              gap="$3">
              <View flex={1}>
                <Slider
                  value={[columnWidths[column.id] || (column.width ?? 100)]}
                  onChange={(value) => {
                    onColumnWidthChange(column.id, value[0]);
                  }}
                  min={50}
                  max={300}
                  step={10}
                  aria-label={t('{{column}} column width', { column: column.label })}
                />
              </View>
              <Text
                fontSize="$3"
                color="$color10"
                minWidth={40}
                textAlign="right">
                {t('{{width}}px', { width: columnWidths[column.id] || (column.width ?? 100) })}
              </Text>
            </XStack>
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
};

// View Management Section

interface ViewManagementSectionProps {
  views: TableView[];
  activeViewId?: string;
  onSaveView: (name: string) => void;
  onLoadView: (viewId: string) => void;
}

const ViewManagementSection = ({ views, activeViewId, onSaveView, onLoadView }: ViewManagementSectionProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [viewName, setViewName] = useState('');

  const handleSaveView = () => {
    if (viewName.trim()) {
      onSaveView(viewName.trim());
      setViewName('');
      setShowSaveDialog(false);
    }
  };

  return (
    <YStack gap="$3">
      <Text
        {...knobProps.label}
        fontWeight="400">
        {t('Saved Views')}
      </Text>

      {/* Save Current View */}
      <FloatingPanel
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        trigger={
          <Button
            size={knobProps.sizeToken}
            icon={<FloppyDiskIcon size={iconPx} />}>
            {t('Save Current View')}
          </Button>
        }>
        <YStack
          gap="$3"
          minWidth={250}
          data-dismiss-class="compose">
          <Text
            {...knobProps.label}
            fontWeight="400">
            {t('Save View')}
          </Text>
          <Input
            placeholder={t('Enter view name...')}
            value={viewName}
            onChangeText={setViewName}
            inputProps={{
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && viewName.trim()) {
                  handleSaveView();
                }
              },
            }}
          />
          <XStack
            gap="$2"
            justifyContent="flex-end">
            <Button
              size={knobProps.sizeToken}
              onPress={() => {
                setShowSaveDialog(false);
              }}>
              {t('Cancel')}
            </Button>
            <Button
              size={knobProps.sizeToken}
              onPress={handleSaveView}
              disabled={!viewName.trim()}>
              {t('Save')}
            </Button>
          </XStack>
        </YStack>
      </FloatingPanel>

      {/* Saved Views List */}
      {views.length > 0 && (
        <YStack>
          {views.map((view, index) => {
            const corners = stackRadiusProps(
              getGroupPosition(index, views.length),
              knobProps.borderRadius.borderRadius,
            );
            return (
              <XStack
                key={view.id}
                alignItems="center"
                justifyContent="space-between"
                padding="$2"
                overflow="hidden"
                {...corners}
                backgroundColor={activeViewId === view.id ? '$color2' : 'transparent'}
                hoverStyle={{ backgroundColor: '$color1', ...corners }}>
                <Text fontSize="$3">{view.name}</Text>
                <Button
                  size={knobProps.sizeToken}
                  onPress={() => {
                    onLoadView(view.id);
                  }}
                  disabled={activeViewId === view.id}>
                  {t('Load')}
                </Button>
              </XStack>
            );
          })}
        </YStack>
      )}
    </YStack>
  );
};

// oxlint-disable-next-line eslint/complexity -- the branches are context-vs-prop fallbacks and the menu/panel layout variants
export const DataTableViewOptions = (props: DataTableViewOptionsProps) => {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values
  const columns: ViewOptionsColumn[] =
    props.columns ??
    (ctx
      ? ctx.table.getAllColumns().map((col, index) => ({
          id: col.id,
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack's header is a string or a render function; only a string can label the menu row
          label: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
          visible: col.getIsVisible(),
          order: index,
          width: col.getSize(),
          canHide: col.getCanHide(),
          canResize: col.getCanResize(),
        }))
      : []);

  const onColumnVisibilityChange =
    props.onColumnVisibilityChange ??
    (ctx
      ? (columnId: string, visible: boolean) => {
          ctx.actions.toggleColumnVisibility(columnId, visible);
        }
      : noop);

  const onColumnSizingChange = props.onColumnSizingChange ?? (ctx ? ctx.actions.setColumnSizing : noop);

  const views = props.views ?? ctx?.state.views ?? [];
  const activeViewId = props.activeViewId ?? ctx?.state.activeViewId;
  const onSaveView = props.onSaveView ?? ctx?.actions.saveView ?? noop;
  const onLoadView = props.onLoadView ?? ctx?.actions.loadView ?? noop;
  const onResetToDefault = props.onResetToDefault ?? ctx?.actions.resetToDefault ?? noop;

  const {
    showColumnVisibility = true,
    showColumnResizing = false,
    showViewManagement = false,
    compact: menuLayout,
  } = props;

  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);
  const sz = knobProps.sizeToken;
  const popoverMaxWidth = bySizeToken(sz, 240, 300, 360);
  const scrollMaxHeight = bySizeToken(sz, 320, 400, 480);
  const [showOptions, setShowOptions] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    for (const col of columns) {
      if (col.width !== undefined && col.width !== 0 && !Number.isNaN(col.width)) {
        widths[col.id] = col.width;
      }
    }
    return widths;
  });

  const handleColumnWidthChange = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    onColumnSizingChange(newWidths);
  };

  const visibleColumns = columns.filter((col) => col.visible);
  const hiddenColumns = columns.filter((col) => !col.visible);

  if (menuLayout) {
    // Compact mode is a column-visibility action menu: canonical DropdownMenu
    // (roving keyboard, focus restore, edge-to-edge rows) with checkbox items.
    return (
      <DropdownMenu
        open={showOptions}
        onOpenChange={setShowOptions}>
        <DropdownMenu.Trigger asChild>
          <Button
            size={knobProps.sizeToken}
            icon={<GearIcon size={iconPx} />}
            aria-label={t('Open table view options')}>
            {t('View')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          maxHeight={scrollMaxHeight}
          maxWidth={popoverMaxWidth}>
          {showColumnVisibility && (
            <>
              <DropdownMenu.Label>{t('Column Visibility')}</DropdownMenu.Label>
              {columns.map((column) => (
                <DropdownMenu.CheckboxItem
                  key={column.id}
                  checked={column.visible}
                  onCheckedChange={(checked) => {
                    onColumnVisibilityChange(column.id, checked);
                  }}>
                  {column.label}
                </DropdownMenu.CheckboxItem>
              ))}
              <DropdownMenu.Separator />
            </>
          )}
          <DropdownMenu.Item
            icon={<ArrowCounterClockwiseIcon size={iconPx} />}
            closeOnSelect={false}
            onSelect={onResetToDefault}>
            {t('Reset to Default')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    );
  }

  return (
    <YStack
      {...knobProps.borderRadius}
      // Axiom 1 CLIP / radius-clamping: padded containers cap radius at their
      // own padding so the corner curve never sweeps through child rows.
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...{ backgroundColor: '$background' }}
      borderColor="$borderColor"
      aria-label={t('Table view options')}>
      <XStack
        alignItems="center"
        justifyContent="space-between">
        <XStack
          alignItems="center"
          gap="$2">
          <GearIcon size={iconPx} />
          <Text
            {...knobProps.label}
            fontWeight="400">
            {t('View Options')}
          </Text>
        </XStack>

        <Button
          size={knobProps.sizeToken}
          onPress={onResetToDefault}
          icon={<ArrowCounterClockwiseIcon size={iconPx} />}>
          {t('Reset')}
        </Button>
      </XStack>

      <Separator />

      <ScrollView maxHeight={scrollMaxHeight}>
        {/* gapLg: section gaps exceed field gaps (DG-LAY-03) and follow the
            space knob (LC-18). paddingRight keeps row controls clear of the
            overlay scrollbar so toggles are never painted over. */}
        <YStack
          {...knobProps.gapLg}
          paddingRight="$3">
          {/* Column Visibility */}
          {showColumnVisibility && (
            <ColumnVisibilitySection
              visibleColumns={visibleColumns}
              hiddenColumns={hiddenColumns}
              onColumnVisibilityChange={onColumnVisibilityChange}
            />
          )}

          {/* Column Resizing */}
          {showColumnResizing && (
            <ColumnResizingSection
              columns={columns.filter((col) => col.canResize)}
              columnWidths={columnWidths}
              onColumnWidthChange={handleColumnWidthChange}
            />
          )}

          {/* View Management */}
          {showViewManagement && (
            <ViewManagementSection
              views={views}
              activeViewId={activeViewId}
              onSaveView={onSaveView}
              onLoadView={onLoadView}
            />
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
};
