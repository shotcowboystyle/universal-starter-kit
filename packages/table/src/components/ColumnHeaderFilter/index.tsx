/**
 * ColumnHeaderFilter - Filter panel for individual column headers
 * AG Grid style column filtering with operators and value inputs
 */

import { Tooltip } from '@repo/ui';
import { Button, FloatingPanel } from '@repo/forms';
import {
  ensureCompositeFocusRing,
  MIN_PRESS_TARGET,
  pressTargetHitSlop,
  pressTargetStyle,
  useAccentOnSurface,
  useResolvedKnobs,
  useGlyphColor,
} from '@repo/theme';
import { FunnelIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Text, View, XStack, YStack, styled } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableColumnType, FilterOperator } from '../../types';
import { iconSizeForToken } from '../../utils/chromeIcons';
import { defaultOperatorForFilterType, operatorNeedsNoValue } from '../../utils/filterFields';
import { FilterOperatorValueEditor } from '../FilterOperatorValueEditor';

/**
 * The funnel's column type IS the table's column type — one vocabulary, not a
 * second copy (LC-16). Kept as a named alias because consumers import it.
 * Adding `"money"` to DataTableColumnType therefore reaches the funnel too
 * (MPO-252).
 */
export type ColumnFilterType = DataTableColumnType;

export interface ColumnHeaderFilterProps {
  columnId: string;
  columnLabel: string;
  columnType: ColumnFilterType;
  /** Current filter value for this column */
  filterValue?: any;
  /** Callback when filter changes */
  onFilterChange: (value: any) => void;
  /** Options for select-type columns */
  options?: { label: string; value: any }[];
  /** Whether the column is currently filtered */
  isFiltered?: boolean;
}

// DG-LAY-04 / SP-FIXED: the funnel glyph stays small (~22px incl. padding) but
// the press target is floored at 44×44; negative margins keep header row
// height and column flow unchanged (same pattern as Chip dismiss).
const FILTER_TRIGGER_VISUAL = 22;
const FILTER_TRIGGER_OUTSET = Math.max(0, Math.ceil((MIN_PRESS_TARGET - FILTER_TRIGGER_VISUAL) / 2));

const FilterTriggerTarget = styled(View, { name: 'FilterTriggerTarget' });

export function ColumnHeaderFilter({
  columnId: _columnId,
  columnLabel,
  columnType,
  filterValue,
  onFilterChange,
  options,
  isFiltered,
}: ColumnHeaderFilterProps) {
  const { knobProps } = useResolvedKnobs();
  const idleColor = useGlyphColor('$color11');
  const activeColor = useAccentOnSurface();
  const glyphColor = isFiltered ? activeColor : idleColor;
  ensureCompositeFocusRing();
  const iconPx = iconSizeForToken(String(knobProps.sizeToken));
  const [open, setOpen] = useState(false);
  const [operator, setOperator] = useState<FilterOperator>(() => defaultOperatorForFilterType(columnType));
  const [value, setValue] = useState<string>('');

  const handleOpenChange = (next: boolean) => {
    // Reopening reads the applied filter. External updates while editing
    // leave the current draft alone, including the stay-open Clear flow.
    if (next && !open) {
      setOperator(filterValue?.operator ?? defaultOperatorForFilterType(columnType));
      setValue(filterValue?.value == null ? '' : String(filterValue.value));
    }
    setOpen(next);
  };

  // Apply is the explicit done affordance of this draft editor — commit-and-
  // close is its stated intent (LC-21 allows an explicit done/close control).
  const handleApply = () => {
    if (operatorNeedsNoValue(operator)) {
      onFilterChange({ operator, value: null });
    } else {
      onFilterChange({ operator, value });
    }
    setOpen(false);
  };

  // LC-21 (owner adjudication 2026-08-12): Clear edits the filter, it is not
  // dismissal intent — the panel stays open so the user can compose the next
  // filter; outside click / Escape / Apply close.
  const handleClear = () => {
    setValue('');
    setOperator(defaultOperatorForFilterType(columnType));
    onFilterChange();
  };

  // The panel owns the pointer toggle (mousedown) and the keyboard-synthesized
  // click. The trigger only stops the click reaching the header's sort press
  // and opens on Enter/Space, which a role=button div does not synthesize.
  const trigger = (
    <Tooltip content={isFiltered ? t('Edit filter') : t('Filter this column')}>
      {/* LC-54 amendment (2026-08-13): the grown press target NEVER
        paints — hover/press fills on this box spread across the full
        44px floor and bled into the neighboring header rows via the
        negative outsets. Painted hover and keyboard focus feedback
        ride the glyph-scale ring inside
        (Chip dismiss anatomy). */}
      <FilterTriggerTarget
        cursor="pointer"
        {...pressTargetStyle()}
        alignItems="center"
        justifyContent="center"
        marginVertical={-FILTER_TRIGGER_OUTSET}
        marginHorizontal={-FILTER_TRIGGER_OUTSET}
        hitSlop={pressTargetHitSlop(FILTER_TRIGGER_VISUAL)}
        // Enabled glyphs keep readable ink; hue and weight distinguish
        // an applied filter from the secondary-color idle affordance.
        // Shared unpainted press-floor / painted glyph-ring anatomy.
        className="mp-chip-dismiss"
        tabIndex={0}
        onKeyDown={
          ((event: { key?: string; preventDefault(): void; stopPropagation(): void }) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            handleOpenChange(true);
          }) as unknown as () => void
        }
        onPress={(e) => {
          e.stopPropagation();
        }}
        role="button"
        aria-label={`Filter column ${columnLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}>
        <View
          className="mp-chip-dismiss-ring"
          padding="$1"
          borderRadius="$2"
          alignItems="center"
          justifyContent="center"
          hoverStyle={{ backgroundColor: '$color4' }}
          pressStyle={{ backgroundColor: '$color5' }}>
          <FunnelIcon
            size={iconPx}
            color={glyphColor}
            weight={isFiltered ? 'fill' : 'regular'}
          />
        </View>
      </FilterTriggerTarget>
    </Tooltip>
  );

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      triggerSizing="content"
      widthMode="fit-content">
      <YStack
        {...knobProps.gap}
        minWidth={240}
        data-dismiss-class="compose">
        <Text
          {...knobProps.label}
          fontWeight="400"
          color="$color11">
          {t('Filter: {{column}}', { column: columnLabel })}
        </Text>

        {/* Shared operator/value editor (LC-16 — same one the toolbar filter uses) */}
        <FilterOperatorValueEditor
          fieldType={columnType}
          operator={operator}
          value={value}
          onOperatorChange={setOperator}
          onValueChange={setValue}
          options={options}
        />

        {/* Actions */}
        <XStack
          {...knobProps.gap}
          justifyContent="flex-end">
          {isFiltered && (
            <Button
              size={knobProps.sizeToken}
              onPress={handleClear}>
              {t('Clear')}
            </Button>
          )}
          <Button
            size={knobProps.sizeToken}
            onPress={handleApply}>
            {t('Apply')}
          </Button>
        </XStack>
      </YStack>
    </FloatingPanel>
  );
}
