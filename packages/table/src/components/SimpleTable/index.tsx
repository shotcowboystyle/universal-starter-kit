/**
 * SimpleTable - lightweight read-only table with zero TanStack Table dependency.
 *
 * Renders data as a table using Layer 1 Table primitives with a thin
 * data-mapping loop. Supports column alignment, intent props on rows
 * via `_intent` property in data objects, responsive card layout
 * on mobile via `useMedia`, and optional row press (LC-49 / LC-50 / LC-71).
 *
 * No filtering, sorting, pagination, or table state — just render data.
 */

import { Table, tableZebraFill } from '@repo/table-primitives';
import { ensureFocusVisibleRing, useResolvedKnobs, transitionProps } from '@repo/theme';
import type { DisabledRecipe } from '@repo/theme';
import { EmptyState } from '@repo/ui';
import { useCallback, useState } from 'react';
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FontSizeTokens, ViewProps } from 'tamagui';
import { Text, View, isWeb, useMedia } from 'tamagui';

import type { DataTableLayout } from '../../types';
import { isInteractiveInnerTarget } from '../../utils/row-press';
import { withInterp } from '../../utils/with-interp';

// ===========================================================================
// Types
// ===========================================================================

type IntentName = 'accent' | 'error' | 'warning' | 'success';

type ColumnAlign = 'left' | 'center' | 'right';

/**
 * One row of schema-less display data. `_intent` paints the row's intent fill.
 */
export interface SimpleTableRow {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SimpleTable renders arbitrary caller rows by accessorKey; there is no schema to parse against
  [key: string]: unknown;
  _intent?: IntentName;
}

export interface SimpleTableColumn {
  /** Key to access the value from each data object */
  accessorKey: string;
  /** Header label to display */
  header: string;
  /** Text alignment for the column */
  align?: ColumnAlign;
  /** Optional cell renderer. Strings/numbers still pick up table type + align. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the cell value is whatever the caller's row holds at accessorKey; the renderer owns its narrowing
  cell?: (value: unknown, row: SimpleTableRow, rowIndex: number) => ReactNode;
}

export interface SimpleTableProps extends ViewProps {
  /** Array of data objects to render */
  data: SimpleTableRow[];
  /** Column configuration */
  columns: SimpleTableColumn[];
  /**
   * Responsive layout: `auto` renders the table on `$sm` and up and a
   * stacked card list below it; `table` / `cards` pin one mode.
   */
  layout?: DataTableLayout;
  /** Accessible label for the table */
  'aria-label'?: string;
  /** Visible caption (also the accessible name; wins over `aria-label`). */
  caption?: string;
  /**
   * Row activation: click/tap anywhere on the row, and Enter/Space while
   * focused. One roving tab stop (LC-49). Keyboard-origin focus paints one
   * inset ring on the row (LC-71); selected/`_intent` is fill, never a ring.
   */
  onRowPress?: (row: SimpleTableRow, rowIndex: number) => void;
  /** Accessible name for a pressable row. Falls back to the first cell. */
  rowLabel?: (row: SimpleTableRow) => string;
  /** Stable row identity. Defaults to the row index. */
  getRowId?: (row: SimpleTableRow, rowIndex: number) => string;
  /** Disable row press (rows stay visible; activation is inert). */
  disabled?: boolean;
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Host props Tamagui forwards to the DOM / style resolver but does not
 * declare on these parts (`overflow: auto`, `colSpan`, View `elevation`).
 */
interface HostPassthroughProps {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- undeclared host props are forwarded as-is; Tamagui's prop types have no slot for them
  [prop: string]: unknown;
}

const FRAME_OVERFLOW: HostPassthroughProps = { overflow: 'auto' };

type TextLikeCell = string | number | null | undefined;

const ROW_PRESS_SELECTOR = '[data-row-press="true"]';

const FLEX_BY_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

const alignToFlex = (align?: ColumnAlign): 'flex-start' | 'center' | 'flex-end' => FLEX_BY_ALIGN[align ?? 'left'];

/** Cell position within its row, and row position within the body. */
const locationFor = (index: number, count: number): 'first' | 'middle' | 'last' => {
  if (index === 0) {
    return 'first';
  }
  if (index === count - 1) {
    return 'last';
  }
  return 'middle';
};

const resolveRowId = (
  row: SimpleTableRow,
  index: number,
  getRowId?: (row: SimpleTableRow, rowIndex: number) => string,
): string => getRowId?.(row, index) ?? String(index);

const zebraParity = (on: boolean, rowIndex: number): 'even' | 'odd' | 'off' => {
  if (!on) {
    return 'off';
  }
  return rowIndex % 2 === 0 ? 'even' : 'odd';
};

/** Strings, numbers and nullish values render through AlignedCellText. */
const isTextLike = (value: unknown): value is TextLikeCell =>
  value === null || value === undefined || typeof value === 'string' || typeof value === 'number';

const nextRowIndex = (key: string, currentIdx: number, count: number): number => {
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return count - 1;
  }
  return Math.min(Math.max(currentIdx + (key === 'ArrowDown' ? 1 : -1), 0), count - 1);
};

interface KnobBody {
  fontFamily: string;
  fontWeight: string;
  color?: string;
}

/** Inner grid rules follow the borderWidth knob (LC-18). Zero means zero. */
const gridRule = (borderWidth: number, on: boolean) => {
  if (!on || borderWidth === 0) {
    return {};
  }
  return {
    borderBottomWidth: borderWidth,
    borderBottomColor: '$borderColor' as const,
  };
};

/** Cell inset rides `space` (SP-EDGE: padding/height, never an outer row inset). */
const cellPad = (gap: string) => ({ paddingHorizontal: gap, paddingVertical: gap });

/** LC-40: disabled rows wash chrome (keepLabel) or dim the assembly (dimWhole). */
const disabledChrome = (disabled: boolean, disabledState: DisabledRecipe) => {
  if (!disabled) {
    return {};
  }
  if (disabledState.style === 'dimWhole') {
    return { ...disabledState.assemblyKnobProps, 'aria-disabled': true as const };
  }
  return { ...disabledState.surfaceKnobProps, 'aria-disabled': true as const };
};

const AlignedCellText = ({
  children,
  align,
  body,
  fontSize,
}: {
  children: string | number;
  align?: ColumnAlign;
  body: KnobBody;
  fontSize: FontSizeTokens;
}) => (
  <Text
    {...body}
    fontSize={fontSize}
    color="$color12"
    display="block"
    width="100%"
    textAlign={align ?? 'left'}
    numberOfLines={1}
    ellipsizeMode="tail"
    {...(isWeb ? { title: String(children) } : {})}
    {...(align === 'right' ? { fontVariant: ['tabular-nums' as const] } : {})}>
    {children}
  </Text>
);

const renderCellContent = (
  col: SimpleTableColumn,
  row: SimpleTableRow,
  rowIndex: number,
  body: KnobBody,
  fontSize: FontSizeTokens,
): ReactNode => {
  const raw = row[col.accessorKey];
  const rendered = col.cell ? col.cell(raw, row, rowIndex) : raw;
  if (isTextLike(rendered)) {
    return (
      <AlignedCellText
        align={col.align}
        body={body}
        fontSize={fontSize}>
        {rendered ?? ''}
      </AlignedCellText>
    );
  }
  // SAFETY: non-text cell values (renderer output or raw elements/booleans in the row) pass straight through to React, as callers supply renderable values
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- row values are schema-less display data; React is the consumer that validates renderability
  return rendered as ReactNode;
};

// ===========================================================================
// Row press (LC-49 / LC-50 / LC-71)
// ===========================================================================

/** The subset of a press event (RN GestureResponderEvent or web mouse event) the row handler reads. */
interface RowPressEvent {
  defaultPrevented?: boolean;
  target?: unknown;
  nativeEvent?: { target?: unknown };
}

const useSimpleTableRowPress = ({
  data,
  columns,
  onRowPress,
  rowLabel,
  disabled,
}: {
  data: SimpleTableRow[];
  columns: SimpleTableColumn[];
  onRowPress?: (row: SimpleTableRow, rowIndex: number) => void;
  rowLabel?: (row: SimpleTableRow) => string;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  const isSSR = typeof window === 'undefined';
  const rowPressActive = Boolean(onRowPress) && disabled !== true;
  const [rowPressAnchor, setRowPressAnchor] = useState(0);
  const effectiveRowPressAnchor = Math.min(rowPressAnchor, Math.max(data.length - 1, 0));

  const deriveRowLabel = useCallback(
    (row: SimpleTableRow, rowIndex: number): string => {
      const fromAccessor = rowLabel?.(row);
      if (fromAccessor !== undefined && fromAccessor !== '') {
        return fromAccessor;
      }
      const firstCol = columns.at(0);
      const first = firstCol === undefined ? undefined : row[firstCol.accessorKey];
      if (isTextLike(first) && first !== null && first !== undefined && first !== '') {
        return String(first);
      }
      return withInterp(t('Row {{row}}', { row: rowIndex + 1 }), { row: rowIndex + 1 });
    },
    [rowLabel, columns, t],
  );

  const getRowPressProps = useCallback(
    (row: SimpleTableRow, rowIndex: number, variant: 'row' | 'card' = 'row') => {
      if (!rowPressActive) {
        return {};
      }
      const handlePress = (event?: RowPressEvent) => {
        if (event?.defaultPrevented === true) {
          return;
        }
        const targetEl = event?.target ?? event?.nativeEvent?.target;
        if (isWeb && typeof Element !== 'undefined' && targetEl instanceof Element) {
          const boundary = targetEl.closest(ROW_PRESS_SELECTOR);
          if (isInteractiveInnerTarget(targetEl, boundary)) {
            return;
          }
        }
        onRowPress?.(row, rowIndex);
      };
      const pressProps = {
        'aria-label': deriveRowLabel(row, rowIndex),
        onPress: handlePress,
        cursor: 'pointer' as const,
        pressStyle: { backgroundColor: '$backgroundPress' },
        role: variant === 'card' ? ('button' as const) : undefined,
      };
      if (!isWeb || isSSR) {
        return pressProps;
      }
      return {
        ...pressProps,
        tabIndex: rowIndex === effectiveRowPressAnchor ? 0 : -1,
        // LC-71: inset ring on the row (table/card clip severs an outer
        // ring). focusVisibleStyle = keyboard-origin only — mouse click
        // paints fill/press, never a ring. Selected/`_intent` is fill.
        focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
        'data-row-press': 'true',
        onFocus: (e: FocusEvent<HTMLElement>) => {
          if (e.target === e.currentTarget) {
            setRowPressAnchor(rowIndex);
          }
        },
        onBlur: (e: FocusEvent<HTMLElement>) => {
          const next = e.relatedTarget;
          if (!(next instanceof Element) || next.closest(ROW_PRESS_SELECTOR) === null) {
            setRowPressAnchor(0);
          }
        },
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          if (e.defaultPrevented) {
            return;
          }
          if (e.target !== e.currentTarget) {
            return;
          }
          const { key } = e;
          if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) {
              return;
            }
            onRowPress?.(row, rowIndex);
            return;
          }
          if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            const rowEl = e.currentTarget;
            const scope = rowEl.closest('[data-row-press-scope="true"]') ?? rowEl.ownerDocument;
            const pressRows = [...scope.querySelectorAll<HTMLElement>(ROW_PRESS_SELECTOR)];
            const currentIdx = pressRows.indexOf(rowEl);
            if (currentIdx === -1) {
              return;
            }
            pressRows[nextRowIndex(key, currentIdx, pressRows.length)]?.focus();
          }
        },
      };
    },
    [rowPressActive, deriveRowLabel, onRowPress, effectiveRowPressAnchor, isSSR],
  );

  return { rowPressActive, getRowPressProps };
};

// ===========================================================================
// Mobile Card Layout
// ===========================================================================

interface SimpleTableMobileCardsProps {
  data: SimpleTableRow[];
  columns: SimpleTableColumn[];
  caption?: string;
  onRowPress?: (row: SimpleTableRow, rowIndex: number) => void;
  rowLabel?: (row: SimpleTableRow) => string;
  getRowId?: (row: SimpleTableRow, rowIndex: number) => string;
  disabled?: boolean;
}

const SimpleTableMobileCards = ({
  data,
  columns,
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
}: SimpleTableMobileCardsProps) => {
  const { t } = useTranslation();
  const { knobProps, disabledState } = useResolvedKnobs({ component: 'SimpleTable' });
  const { rowPressActive, getRowPressProps } = useSimpleTableRowPress({
    data,
    columns,
    onRowPress,
    rowLabel,
    disabled,
  });
  const tableZebraOn = knobProps.tableZebra === 'on';
  const titleCol = columns.at(0);
  const detailCols = columns.slice(1);
  const typeSize = knobProps.label.fontSize;
  const motion = transitionProps(knobProps.transition);
  const hasCaption = caption !== undefined && caption !== '';
  const cardElevation: HostPassthroughProps = { elevation: knobProps.elevation };
  const titleDivider =
    detailCols.length > 0
      ? {
          paddingBottom: knobProps.gap.gap,
          marginBottom: knobProps.gap.gap,
          ...gridRule(knobProps.surface.borderWidth, true),
        }
      : {};

  if (data.length === 0) {
    return (
      <View
        flexDirection="column"
        {...knobProps.gap}
        {...disabledChrome(Boolean(disabled), disabledState)}>
        {hasCaption ? (
          <Text
            {...knobProps.label}
            color={knobProps.textAccentColor}>
            {caption}
          </Text>
        ) : null}
        <EmptyState
          compact
          aria-live="polite"
          title={t('No data available')}
        />
      </View>
    );
  }

  return (
    <View
      flexDirection="column"
      {...knobProps.gap}
      data-row-press-scope={rowPressActive ? 'true' : undefined}>
      {hasCaption ? (
        <Text
          {...knobProps.label}
          color={knobProps.textAccentColor}>
          {caption}
        </Text>
      ) : null}
      {data.map((row, rowIndex) => {
        const intent = row._intent;

        return (
          <View
            key={resolveRowId(row, rowIndex, getRowId)}
            testID="simple-table-card"
            {...knobProps.surface}
            {...knobProps.cardSurface}
            {...cardElevation}
            {...(tableZebraOn && rowIndex % 2 === 1
              ? { backgroundColor: tableZebraFill(knobProps.cardSurface.backgroundColor) }
              : {})}
            {...(intent === undefined ? {} : { theme: intent, backgroundColor: '$color3' as const })}
            {...(disabled ? {} : { hoverStyle: { backgroundColor: '$backgroundHover' } })}
            {...motion}
            {...disabledChrome(Boolean(disabled), disabledState)}
            data-table-zebra={zebraParity(tableZebraOn, rowIndex)}
            {...getRowPressProps(row, rowIndex, 'card')}>
            {titleCol === undefined ? null : (
              <View {...titleDivider}>{renderCellContent(titleCol, row, rowIndex, knobProps.body, typeSize)}</View>
            )}
            {detailCols.map((col, detailIndex) => (
              <View
                key={col.accessorKey}
                flexDirection="row"
                alignItems="center"
                {...cellPad(knobProps.gap.gap)}
                {...knobProps.gap}
                {...gridRule(knobProps.surface.borderWidth, detailIndex < detailCols.length - 1)}>
                <Text
                  {...knobProps.label}
                  color={knobProps.textAccentColor}
                  width="40%"
                  flexShrink={0}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {col.header}
                </Text>
                <View
                  flex={1}
                  minWidth={0}>
                  {renderCellContent(col, row, rowIndex, knobProps.body, typeSize)}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
};

// ===========================================================================
// Desktop Table Layout
// ===========================================================================

export interface SimpleTableDesktopProps extends ViewProps {
  /** Array of data objects to render */
  data: SimpleTableRow[];
  /** Column configuration */
  columns: SimpleTableColumn[];
  /** Accessible label for the table */
  'aria-label'?: string;
  caption?: string;
  onRowPress?: (row: SimpleTableRow, rowIndex: number) => void;
  rowLabel?: (row: SimpleTableRow) => string;
  getRowId?: (row: SimpleTableRow, rowIndex: number) => string;
  disabled?: boolean;
}

/** Desktop table layout using Layer 1 Table primitives. Exported for testing. */
export const SimpleTableDesktop = ({
  data,
  columns,
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
  ...props
}: SimpleTableDesktopProps) => {
  const { knobProps, disabledState } = useResolvedKnobs({ component: 'SimpleTable' });
  const { t } = useTranslation();
  const { rowPressActive, getRowPressProps } = useSimpleTableRowPress({
    data,
    columns,
    onRowPress,
    rowLabel,
    disabled,
  });
  const tableZebraOn = knobProps.tableZebra === 'on';
  const hasCaption = caption !== undefined && caption !== '';
  const ariaLabel = hasCaption ? undefined : props['aria-label'];
  const typeSize = knobProps.label.fontSize;
  const motion = transitionProps(knobProps.transition);
  const pad = cellPad(knobProps.gap.gap);
  const frameBorder = knobProps.surface.borderWidth;
  const emptyCellSpan: HostPassthroughProps = { colSpan: Math.max(columns.length, 1) };

  return (
    <Table
      {...props}
      minWidth={0}
      {...FRAME_OVERFLOW}
      data-simple-table-frame="true"
      data-border-width={String(frameBorder)}
      data-animation={knobProps.transition === undefined ? 'none' : 'on'}
      {...disabledChrome(Boolean(disabled), disabledState)}
      aria-label={ariaLabel}
      aria-rowcount={data.length + 1}>
      {hasCaption ? (
        <Table.Caption>
          <Text
            {...knobProps.label}
            color={knobProps.textAccentColor}>
            {caption}
          </Text>
        </Table.Caption>
      ) : null}
      <Table.Head
        borderBottomWidth={frameBorder}
        borderBottomColor="$borderColor">
        <Table.Row>
          {columns.map((col, colIndex) => (
            <Table.HeaderCell
              key={col.accessorKey}
              justifyContent={alignToFlex(col.align)}
              cellLocation={locationFor(colIndex, columns.length)}
              data-align={col.align ?? 'left'}
              data-cell-pad={knobProps.gap.gap}
              borderRadius={0}
              {...pad}>
              {/* Block text filling the cell + textAlign: alignment that
                  works in the real <th> (display:table-cell — flex props
                  are inert there) and in the flex displayMode alike. */}
              <Text
                {...knobProps.label}
                color={knobProps.textAccentColor}
                display="block"
                width="100%"
                textAlign={col.align ?? 'left'}
                numberOfLines={1}
                ellipsizeMode="tail"
                {...(col.align === 'right' ? { fontVariant: ['tabular-nums' as const] } : {})}>
                {col.header}
              </Text>
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Head>
      <Table.Body data-row-press-scope={rowPressActive ? 'true' : undefined}>
        {data.length === 0 ? (
          <Table.Row>
            <Table.Cell
              cellWidth="auto"
              borderRadius={0}
              {...emptyCellSpan}>
              <EmptyState
                compact
                aria-live="polite"
                title={t('No data available')}
              />
            </Table.Cell>
          </Table.Row>
        ) : (
          data.map((row, rowIndex) => {
            const intent = row._intent;
            const intentProps = intent === undefined ? {} : { [intent]: true };
            const isLast = rowIndex === data.length - 1;
            const zebraFill =
              intent === undefined && tableZebraOn && rowIndex % 2 === 1
                ? { backgroundColor: tableZebraFill(knobProps.surface.backgroundColor) }
                : {};

            return (
              <Table.Row
                key={resolveRowId(row, rowIndex, getRowId)}
                rowLocation={locationFor(rowIndex, data.length)}
                {...(disabled ? {} : { hoverStyle: { backgroundColor: '$backgroundHover' } })}
                {...motion}
                {...zebraFill}
                {...intentProps}
                data-table-zebra={zebraParity(tableZebraOn, rowIndex)}
                {...getRowPressProps(row, rowIndex)}>
                {columns.map((col, colIndex) => (
                  <Table.Cell
                    key={col.accessorKey}
                    justifyContent={alignToFlex(col.align)}
                    cellLocation={locationFor(colIndex, columns.length)}
                    data-align={col.align ?? 'left'}
                    data-cell-pad={knobProps.gap.gap}
                    borderRadius={0}
                    {...pad}
                    {...gridRule(frameBorder, !isLast)}>
                    {renderCellContent(col, row, rowIndex, knobProps.body, typeSize)}
                  </Table.Cell>
                ))}
              </Table.Row>
            );
          })
        )}
      </Table.Body>
    </Table>
  );
};

// ===========================================================================
// Main Component
// ===========================================================================

export const SimpleTable = ({
  data,
  columns,
  layout = 'auto',
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
  ...props
}: SimpleTableProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'SimpleTable' });
  const { sm } = useMedia();

  // Card layout below `$sm` (layout="auto") or when pinned via layout="cards"
  if (layout === 'cards' || (layout === 'auto' && !sm)) {
    return (
      <View
        {...knobProps.containerRadius}
        {...props}
        testID="simple-table-cards"
        data-simple-table-frame="true"
        data-border-width={String(knobProps.surface.borderWidth)}
        data-animation={knobProps.transition === undefined ? 'none' : 'on'}>
        <SimpleTableMobileCards
          data={data}
          columns={columns}
          caption={caption}
          onRowPress={onRowPress}
          rowLabel={rowLabel}
          getRowId={getRowId}
          disabled={disabled}
        />
      </View>
    );
  }

  // Desktop/tablet: standard table layout using Layer 1 primitives
  return (
    <SimpleTableDesktop
      data={data}
      columns={columns}
      caption={caption}
      onRowPress={onRowPress}
      rowLabel={rowLabel}
      getRowId={getRowId}
      disabled={disabled}
      {...props}
    />
  );
};
