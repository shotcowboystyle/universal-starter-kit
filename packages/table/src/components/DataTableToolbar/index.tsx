import { DropdownMenu } from '@repo/ui';
import { Button, FloatingPanel, Input, SearchInput, Spinner } from '@repo/forms';
import { hairline, useResolvedKnobs } from '@repo/theme';
import { CaretDownIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { RovingFocusGroup } from '@tamagui/roving-focus';
import type React from 'react';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { TableView } from '../../types';
import { iconSizeForToken } from '../../utils/chromeIcons';
import { useDataTableState } from '../DataTable/DataTableStateContext';
import { DataTableExport } from '../DataTableExport';
import { DataTableCardFilterButton, DataTableFilterButton } from '../DataTableFilterButton';

export interface DataTableToolbarProps {
  // Search
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;

  // Filters
  onClearFilters?: () => void;
  /** Number of active column filters for badge display */
  activeFilterCount?: number;

  // Views
  onSaveView?: (name: string) => void;
  onLoadView?: (viewId: string) => void;
  views?: TableView[];
  activeViewId?: string;

  // Feature flags
  enableViews?: boolean;
  enableGlobalSearch?: boolean;
  enableFiltering?: boolean;
  /** Mount DataTableExport in the action cluster (view-scoped CSV/JSON/print). */
  enableExport?: boolean;

  // Customization
  showFilterCount?: boolean;
  showViewSelector?: boolean;
  customActions?: React.ReactNode;
  /** Subtle refetch indicator — must not unmount the table body. */
  isFetching?: boolean;

  // Sizing
  size?: string;
  compact?: boolean;
}

export function DataTableToolbar(props: DataTableToolbarProps) {
  return <ToolbarLayout {...props} />;
}

export function DataTableCardToolbar(props: DataTableToolbarProps) {
  return (
    <ToolbarLayout
      {...props}
      cardLayout
    />
  );
}

function ToolbarLayout({ cardLayout = false, ...props }: DataTableToolbarProps & { cardLayout?: boolean }) {
  const ctx = useDataTableState();

  const globalFilter = props.globalFilter ?? ctx?.state.globalFilter ?? '';
  const onGlobalFilterChange = props.onGlobalFilterChange ?? ctx?.actions.setGlobalFilter ?? (() => {});
  const onClearFilters = props.onClearFilters ?? ctx?.actions.clearFilters ?? (() => {});
  const onSaveView = props.onSaveView ?? ctx?.actions.saveView ?? (() => {});
  const onLoadView = props.onLoadView ?? ctx?.actions.loadView ?? (() => {});
  const views = props.views ?? ctx?.state.views ?? [];
  const activeViewId = props.activeViewId ?? ctx?.state.activeViewId;

  const {
    enableViews = false,
    enableGlobalSearch = true,
    enableFiltering = true,
    enableExport = false,
    showFilterCount: _showFilterCount = true,
    showViewSelector = true,
    customActions,
    size,
    compact,
    isFetching: isFetchingProp,
  } = props;
  const isFetching = isFetchingProp ?? ctx?.state.isFetching ?? false;

  // Toolbar Filter surface (hidden-column filtering). Needs the compound
  // context — DataTableFilterButton reads fields/actions from it.
  const showFilterButton = enableFiltering && !!ctx && (ctx.computed?.filterFields?.length ?? 0) > 0;

  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const activeView = views.find((v) => v.id === activeViewId);

  const handleSaveView = () => {
    if (newViewName.trim()) {
      onSaveView(newViewName.trim());
      setNewViewName('');
      setShowSaveViewDialog(false);
    }
  };

  const { knobProps } = useResolvedKnobs(size === undefined && compact === undefined ? undefined : { size, compact });
  const sz = knobProps.sizeToken;
  const iconPx = iconSizeForToken(String(sz));
  const searchMaxWidth = sz === '$3' ? 280 : sz === '$5' ? 400 : 320;
  const controlSize = knobProps.sizeToken;
  const searchSize = knobProps.sizeToken;

  const showViewPicker = enableViews && showViewSelector && views.length > 0;
  const showSave = enableViews && showViewSelector;
  const showActionCluster = Boolean((customActions ?? showFilterButton) || showViewPicker || showSave || enableExport);
  const hasTrailing = showActionCluster || isFetching;

  const viewPickerContent = showViewPicker && (
    <DropdownMenu
      closeOnSelect
      placement="bottom-end">
      <DropdownMenu.Trigger asChild>
        <RovingFocusGroup.Item
          focusable
          asChild>
          <Button
            chromeless
            size={controlSize}
            iconAfter={<CaretDownIcon size={iconPx} />}
            aria-label={t('Saved views')}
            {...(cardLayout ? { minWidth: 0, maxWidth: '100%' as const } : {})}
            aria-haspopup="menu">
            {activeView?.name ?? t('Views')}
          </Button>
        </RovingFocusGroup.Item>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {views.map((view) => (
          <DropdownMenu.CheckboxItem
            key={view.id}
            checked={view.id === activeViewId}
            closeOnSelect
            onSelect={() => {
              onLoadView(view.id);
            }}>
            {view.name}
          </DropdownMenu.CheckboxItem>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
  const viewPicker =
    cardLayout && showViewPicker ? (
      <XStack
        minWidth={0}
        maxWidth="100%"
        flexBasis="auto"
        flexGrow={0}
        flexShrink={1}>
        {viewPickerContent}
      </XStack>
    ) : (
      viewPickerContent
    );
  const saveView = showSave && (
    <FloatingPanel
      open={showSaveViewDialog}
      onOpenChange={setShowSaveViewDialog}
      triggerSizing="content"
      widthMode="fit-content"
      trigger={
        <RovingFocusGroup.Item
          focusable
          asChild>
          <Button
            chromeless
            size={controlSize}
            icon={<FloppyDiskIcon size={iconPx} />}
            aria-label={t('Save view')}
          />
        </RovingFocusGroup.Item>
      }>
      <YStack
        {...knobProps.gap}
        minWidth={240}
        data-dismiss-class="compose">
        <Input
          placeholder={t('View name')}
          value={newViewName}
          onChangeText={setNewViewName}
          size={searchSize}
          {...(compact === undefined ? {} : { compact })}
          inputProps={{
            'aria-label': t('View name'),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter') {
                handleSaveView();
              }
            },
          }}
        />
        <XStack
          {...knobProps.gap}
          justifyContent="flex-end">
          <Button
            size={controlSize}
            onPress={() => {
              setShowSaveViewDialog(false);
            }}>
            {t('Cancel')}
          </Button>
          <Button
            size={controlSize}
            onPress={handleSaveView}
            disabled={!newViewName.trim()}
            disabledReason={t('Enter a view name')}>
            {t('Save')}
          </Button>
        </XStack>
      </YStack>
    </FloatingPanel>
  );
  const showSecondary = showViewPicker || showSave || enableExport || isFetching;

  return (
    <XStack
      alignItems={cardLayout ? 'stretch' : 'center'}
      flexDirection={cardLayout ? 'column' : 'row'}
      {...(cardLayout ? { width: '100%' as const, minWidth: 0 } : {})}
      // LC-39: flush band — no painted panel, so no horizontal inset.
      paddingVertical={knobProps.panelPadding.padding}
      paddingHorizontal={0}
      {...knobProps.gap}
      {...hairline.bottom}
      borderColor="$borderColor"
      flexWrap="nowrap"
      justifyContent={enableGlobalSearch && hasTrailing ? 'space-between' : 'flex-start'}
      role="toolbar"
      aria-label={t('Table toolbar')}
      aria-busy={isFetching || undefined}>
      {enableGlobalSearch && (
        <XStack
          flex={cardLayout ? undefined : 1}
          minWidth={cardLayout ? 0 : 160}
          maxWidth={cardLayout ? undefined : searchMaxWidth}
          flexShrink={1}>
          <SearchInput
            value={globalFilter}
            onChange={onGlobalFilterChange}
            // Clear-X semantics follow filter ownership: when the toolbar
            // owns a filter surface (enableFiltering) the X clears search
            // AND filters (explicit clear intent). When the filter chrome
            // is suppressed (enableFiltering=false — an outer surface owns
            // filtering and injects tuples via initialState/state), the X
            // must not mutate those injected filters; SearchInput already
            // clears the text through onChange("").
            onClear={enableFiltering ? onClearFilters : undefined}
            placeholder={t('Search')}
            aria-label={t('Search table data')}
            {...(compact === undefined ? {} : { compact })}
            size={searchSize}
          />
        </XStack>
      )}

      {cardLayout ? (
        <>
          {(showFilterButton || customActions) && (
            <RovingFocusGroup
              orientation="horizontal"
              loop
              asChild>
              <XStack
                data-table-card-primary=""
                width="100%"
                minWidth={0}
                alignItems="center"
                flexWrap="nowrap"
                {...knobProps.gap}>
                {showFilterButton && (
                  <XStack flexShrink={0}>
                    <DataTableCardFilterButton />
                  </XStack>
                )}
                {customActions}
              </XStack>
            </RovingFocusGroup>
          )}
          {showSecondary && (
            <RovingFocusGroup
              orientation="horizontal"
              loop
              asChild>
              <XStack
                data-table-card-secondary=""
                width="100%"
                minWidth={0}
                flexWrap="wrap"
                alignItems="center"
                {...knobProps.gap}>
                {enableExport && (
                  <XStack
                    maxWidth="100%"
                    minWidth={0}>
                    <DataTableExport />
                  </XStack>
                )}
                {viewPicker}
                {saveView}
                {isFetching && (
                  <XStack
                    alignItems="center"
                    aria-live="polite"
                    data-table-fetching="true">
                    <Spinner size="small" />
                  </XStack>
                )}
              </XStack>
            </RovingFocusGroup>
          )}
        </>
      ) : (
        hasTrailing && (
          <XStack
            alignItems="center"
            {...knobProps.gap}
            flexShrink={0}>
            {showActionCluster && (
              <RovingFocusGroup
                orientation="horizontal"
                loop
                asChild>
                <XStack
                  alignItems="center"
                  {...knobProps.gap}>
                  {showFilterButton && <DataTableFilterButton />}

                  {enableExport && <DataTableExport />}

                  {customActions}

                  {viewPicker}
                  {saveView}
                </XStack>
              </RovingFocusGroup>
            )}

            {isFetching && (
              <XStack
                alignItems="center"
                aria-live="polite"
                data-table-fetching="true">
                <Spinner size="small" />
              </XStack>
            )}
          </XStack>
        )
      )}
    </XStack>
  );
}
