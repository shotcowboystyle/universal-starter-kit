/**
 * DataTableFacetMenu — presentational facet menu for the toolbar action
 * cluster (sits beside DataTableFilterButton / SavedFilterDropdown, slotted
 * through DataTableToolbar's `customActions`). A label trigger opens a menu
 * of options with trailing counts; active options render checked and the
 * trigger carries the active count (accent — same anatomy as the Filter
 * button's active state).
 *
 * Selection SEMANTICS are prop-owned (`selection`):
 *   - "replace" (default — group-by sidebar semantics): pressing a
 *     row replaces the facet's whole selection with that row; pressing the
 *     active row clears it (toggle off / replace).
 *   - "toggle": rows accumulate (multi-select); pressing an active row
 *     removes only that row.
 *
 * Purely presentational: options, counts, and active values arrive via
 * props (from any host source) and the component reports the NEXT active set through
 * `onActiveValuesChange` — it holds no selection state of its own. The menu
 * stays open on selection (LC-21 COMPOSE, CheckboxItem class default) so
 * revalidated counts paint in place while the user composes.
 */

import { CaretDownIcon } from '@phosphor-icons/react';
import { Button, Spinner } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { DropdownMenu } from '@repo/ui';
import type { DropdownMenuPlacement } from '@repo/ui';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { Text, XStack, withStaticProperties } from 'tamagui';

import { t } from '../../shared/t';
import { iconSizeForToken } from '../../utils/chrome-icons';

export interface DataTableFacetOption {
  /** Raw facet value (user id, tag, status value, …). */
  value: string;
  /** Display label; defaults to `value`. */
  label?: string;
  /** Result count for the option (omit to hide the trailing count). */
  count?: number;
}

/** Selection semantics for option presses (see component doc). */
export type DataTableFacetSelection = 'replace' | 'toggle';

export interface DataTableFacetMenuProps {
  /** Facet label — the trigger text and the menu's accessible name. */
  label: string;
  /** Options with counts. Ignored when compound children are provided. */
  options?: readonly DataTableFacetOption[];
  /** Values currently applied (highlighted / checked options). */
  activeValues?: readonly string[];
  /** Press semantics (default "replace"). */
  selection?: DataTableFacetSelection;
  /**
   * Fires with the NEXT active set (per `selection` semantics) and the
   * pressed option. The host owns state — map the set to filters there.
   */
  onActiveValuesChange?: (next: string[], pressed: DataTableFacetOption) => void;
  /** True while counts load — renders a menu spinner when no options yet. */
  loading?: boolean;
  disabled?: boolean;
  /** DG-ST-03 — why the trigger is disabled (renders on the trigger). */
  disabledReason?: string;
  /** Menu placement (default "bottom-start"). */
  placement?: DropdownMenuPlacement;
  /**
   * Compound composition: custom rows (DataTableFacetMenu.Item) replace the
   * `options` list; loading/empty chrome stays prop-driven.
   */
  children?: ReactNode;
}

export interface DataTableFacetMenuItemProps {
  label: string;
  /** Trailing count (omit to hide). */
  count?: number;
  /** Row renders checked / highlighted. */
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** DG-ST-03 — why the row is disabled; renders inline under the label. */
  disabledReason?: string;
}

/**
 * One facet row — label, optional trailing count, checked when active.
 * Rides DropdownMenu.CheckboxItem so the menu stays open on press (COMPOSE)
 * and the row exposes menuitemcheckbox semantics.
 */
const DataTableFacetMenuItem = ({
  label,
  count,
  active = false,
  onPress,
  disabled,
  disabledReason,
}: DataTableFacetMenuItemProps) => (
  <DropdownMenu.CheckboxItem
    checked={active}
    onCheckedChange={onPress}
    {...(disabled ? { disabled } : {})}
    {...(disabledReason !== undefined && disabledReason !== '' ? { disabledReason } : {})}
    // Trailing muted slot — the count reads as part of the row.
    {...(count === undefined ? {} : { shortcut: String(count) })}>
    {label}
  </DropdownMenu.CheckboxItem>
);

const DataTableFacetMenuComponent = ({
  label,
  options,
  activeValues,
  selection = 'replace',
  onActiveValuesChange,
  loading = false,
  disabled,
  disabledReason,
  placement = 'bottom-start',
  children,
}: DataTableFacetMenuProps) => {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(knobProps.sizeToken);
  const active = useMemo(() => activeValues ?? [], [activeValues]);
  const activeSet = useMemo(() => new Set(active), [active]);
  const activeCount = active.length;

  const handlePress = useCallback(
    (option: DataTableFacetOption) => {
      if (!onActiveValuesChange) {
        return;
      }
      const isActive = active.includes(option.value);
      let next: string[];
      if (selection === 'toggle') {
        next = isActive ? active.filter((value) => value !== option.value) : [...active, option.value];
      } else {
        // "replace": one active value per facet; pressing
        // the active row clears the facet.
        next = isActive ? [] : [option.value];
      }
      onActiveValuesChange(next, option);
    },
    [active, onActiveValuesChange, selection],
  );

  const optionList = options ?? [];
  const showEmpty = optionList.length === 0 && !loading;
  const rows = children ?? (
    <>
      {optionList.map((option) => (
        <DataTableFacetMenuItem
          key={option.value}
          label={option.label ?? option.value}
          count={option.count}
          active={activeSet.has(option.value)}
          onPress={() => {
            handlePress(option);
          }}
        />
      ))}
      {showEmpty && (
        <Text
          {...knobProps.label}
          fontWeight="400"
          color="$color10"
          paddingHorizontal="$3"
          paddingVertical="$2">
          {t('No options')}
        </Text>
      )}
    </>
  );

  return (
    <DropdownMenu placement={placement}>
      <DropdownMenu.Trigger asChild>
        <Button
          size={knobProps.sizeToken}
          // Active facet = accent trigger with count — the same active
          // anatomy as DataTableFilterButton ("Filter (n)").
          {...(activeCount > 0 ? { accent: true } : { variant: 'outlined' as const })}
          iconAfter={<CaretDownIcon size={iconPx} />}
          aria-haspopup="menu"
          aria-label={label}
          {...(disabled ? { disabled } : {})}
          {...(disabledReason !== undefined && disabledReason !== '' ? { disabledReason } : {})}>
          {activeCount > 0 ? `${label} (${activeCount})` : label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        aria-label={label}
        minWidth={200}>
        {rows}
        {loading && (
          <XStack
            alignItems="center"
            justifyContent="center"
            paddingVertical="$2"
            aria-live="polite"
            data-facet-loading="true">
            <Spinner size="small" />
          </XStack>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

export const DataTableFacetMenu = withStaticProperties(DataTableFacetMenuComponent, {
  Item: DataTableFacetMenuItem,
});
