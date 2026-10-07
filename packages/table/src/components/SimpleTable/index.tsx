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

import { EmptyState } from '@repo/ui';
import { Table, tableZebraFill } from '@repo/table-primitives';
import { ensureFocusVisibleRing, useResolvedKnobs, transitionProps } from '@repo/theme';
import type { DisabledRecipe } from '@repo/theme';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FontSizeTokens, ViewProps } from 'tamagui';
import { Text, View, isWeb, useMedia } from 'tamagui';

import type { DataTableLayout } from '../../types';
import { isInteractiveInnerTarget } from '../../utils/rowPress';
import { withInterp } from '../../utils/withInterp';

// ===========================================================================
// Types
// ===========================================================================

type IntentName = 'accent' | 'error' | 'warning' | 'success';

export interface SimpleTableColumn {
  /** Key to access the value from each data object */
  accessorKey: string;
  /** Header label to display */
  header: string;
  /** Text alignment for the column */
  align?: 'left' | 'center' | 'right';
  /** Optional cell renderer. Strings/numbers still pick up table type + align. */
  cell?: (value: unknown, row: Record<string, any>, rowIndex: number) => ReactNode;
}

export interface SimpleTableProps extends ViewProps {
  /** Array of data objects to render */
  data: Record<string, any>[];
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
  onRowPress?: (row: Record<string, any>, rowIndex: number) => void;
  /** Accessible name for a pressable row. Falls back to the first cell. */
  rowLabel?: (row: Record<string, any>) => string;
  /** Stable row identity. Defaults to the row index. */
  getRowId?: (row: Record<string, any>, rowIndex: number) => string;
  /** Disable row press (rows stay visible; activation is inert). */
  disabled?: boolean;
}

// ===========================================================================
// Helpers
// ===========================================================================

function alignToFlex(align?: 'left' | 'center' | 'right'): 'flex-start' | 'center' | 'flex-end' {
  switch (align) {
    case 'center': {
      return 'center';
    }
    case 'right': {
      return 'flex-end';
    }
    default: {
      return 'flex-start';
    }
  }
}

function cellLocationFor(index: number, count: number): 'first' | 'middle' | 'last' {
  if (index === 0) {
    return 'first';
  }
  if (index === count - 1) {
    return 'last';
  }
  return 'middle';
}

function rowLocationFor(index: number, count: number): 'first' | 'middle' | 'last' {
  if (index === 0) {
    return 'first';
  }
  if (index === count - 1) {
    return 'last';
  }
  return 'middle';
}

function resolveRowId(
  row: Record<string, any>,
  index: number,
  getRowId?: (row: Record<string, any>, rowIndex: number) => string,
): string {
  return getRowId?.(row, index) ?? String(index);
}

interface KnobBody {
  fontFamily: string;
  fontWeight: string;
  color?: string;
}

/** Inner grid rules follow the borderWidth knob (LC-18). Zero means zero. */
function gridRule(borderWidth: number, on: boolean) {
  if (!on || borderWidth === 0) {
    return {};
  }
  return {
    borderBottomWidth: borderWidth,
    borderBottomColor: '$borderColor' as const,
  };
}

/** Cell inset rides `space` (SP-EDGE: padding/height, never an outer row inset). */
function cellPad(gap: string) {
  return { paddingHorizontal: gap, paddingVertical: gap };
}

/** LC-40: disabled rows wash chrome (keepLabel) or dim the assembly (dimWhole). */
function disabledChrome(disabled: boolean, disabledState: DisabledRecipe) {
  if (!disabled) {
    return {};
  }
  if (disabledState.style === 'dimWhole') {
    return { ...disabledState.assemblyKnobProps, 'aria-disabled': true as const };
  }
  return { ...disabledState.surfaceKnobProps, 'aria-disabled': true as const };
}

function AlignedCellText({
  children,
  align,
  body,
  fontSize,
}: {
  children: string | number;
  align?: 'left' | 'center' | 'right';
  body: KnobBody;
  fontSize: FontSizeTokens;
}) {
  return (
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
      {...(align === 'right' ? ({ fontVariant: ['tabular-nums'] } as any) : {})}>
      {children}
    </Text>
  );
}

function renderCellContent(
  col: SimpleTableColumn,
  row: Record<string, any>,
  rowIndex: number,
  body: KnobBody,
  fontSize: FontSizeTokens,
): ReactNode {
  const raw = row[col.accessorKey];
  const rendered = col.cell ? col.cell(raw, row, rowIndex) : raw;
  if (rendered == null || typeof rendered === 'string' || typeof rendered === 'number') {
    return (
      <AlignedCellText
        align={col.align}
        body={body}
        fontSize={fontSize}>
        {rendered ?? ''}
      </AlignedCellText>
    );
  }
  return rendered;
}

// ===========================================================================
// Row press (LC-49 / LC-50 / LC-71)
// ===========================================================================

function useSimpleTableRowPress({
  data,
  columns,
  onRowPress,
  rowLabel,
  disabled,
}: {
  data: Record<string, any>[];
  columns: SimpleTableColumn[];
  onRowPress?: (row: Record<string, any>, rowIndex: number) => void;
  rowLabel?: (row: Record<string, any>) => string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const isSSR = typeof window === 'undefined';
  const rowPressActive = Boolean(onRowPress) && !disabled;
  const [rowPressAnchor, setRowPressAnchor] = useState(0);
  const effectiveRowPressAnchor = Math.min(rowPressAnchor, Math.max(data.length - 1, 0));

  const deriveRowLabel = useCallback(
    (row: Record<string, any>, rowIndex: number): string => {
      const fromAccessor = rowLabel?.(row);
      if (fromAccessor) {
        return fromAccessor;
      }
      const first = columns[0] ? row[columns[0].accessorKey] : undefined;
      if ((typeof first === 'string' && first.length > 0) || typeof first === 'number') {
        return String(first);
      }
      return withInterp(t('Row {{row}}', { row: rowIndex + 1 }), { row: rowIndex + 1 });
    },
    [rowLabel, columns, t],
  );

  const getRowPressProps = useCallback(
    (row: Record<string, any>, rowIndex: number, variant: 'row' | 'card' = 'row') => {
      if (!rowPressActive) {
        return {};
      }
      const handlePress = (event: any) => {
        if (event?.defaultPrevented) {
          return;
        }
        const targetEl = event?.target ?? event?.nativeEvent?.target;
        if (isWeb && typeof Element !== 'undefined' && targetEl instanceof Element) {
          const boundary = targetEl.closest('[data-row-press="true"]');
          if (isInteractiveInnerTarget(targetEl, boundary)) {
            return;
          }
        }
        onRowPress?.(row, rowIndex);
      };
      return {
        'aria-label': deriveRowLabel(row, rowIndex),
        onPress: handlePress,
        cursor: 'pointer' as const,
        pressStyle: { backgroundColor: '$backgroundPress' },
        ...(variant === 'card' ? { role: 'button' as const } : {}),
        ...(isWeb && !isSSR
          ? {
              tabIndex: rowIndex === effectiveRowPressAnchor ? 0 : -1,
              // LC-71: inset ring on the row (table/card clip severs an outer
              // ring). focusVisibleStyle = keyboard-origin only — mouse click
              // paints fill/press, never a ring. Selected/`_intent` is fill.
              focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
              'data-row-press': 'true',
              onFocus: (e: any) => {
                if (e.target === e.currentTarget) {
                  setRowPressAnchor(rowIndex);
                }
              },
              onBlur: (e: any) => {
                const next = e.relatedTarget;
                if (!(next instanceof Element) || !next.closest('[data-row-press="true"]')) {
                  setRowPressAnchor(0);
                }
              },
              onKeyDown: (e: any) => {
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
                  const rowEl = e.currentTarget as HTMLElement;
                  const scope = rowEl.closest('[data-row-press-scope="true"]') ?? rowEl.ownerDocument;
                  const pressRows = [...scope.querySelectorAll('[data-row-press="true"]')] as HTMLElement[];
                  const currentIdx = pressRows.indexOf(rowEl);
                  if (currentIdx === -1) {
                    return;
                  }
                  const nextIdx =
                    key === 'Home'
                      ? 0
                      : key === 'End'
                        ? pressRows.length - 1
                        : Math.min(Math.max(currentIdx + (key === 'ArrowDown' ? 1 : -1), 0), pressRows.length - 1);
                  pressRows[nextIdx]?.focus();
                }
              },
            }
          : {}),
      };
    },
    [rowPressActive, deriveRowLabel, onRowPress, effectiveRowPressAnchor, isSSR],
  );

  return { rowPressActive, getRowPressProps };
}

// ===========================================================================
// Mobile Card Layout
// ===========================================================================

interface SimpleTableMobileCardsProps {
  data: Record<string, any>[];
  columns: SimpleTableColumn[];
  caption?: string;
  onRowPress?: (row: Record<string, any>, rowIndex: number) => void;
  rowLabel?: (row: Record<string, any>) => string;
  getRowId?: (row: Record<string, any>, rowIndex: number) => string;
  disabled?: boolean;
}

function SimpleTableMobileCards({
  data,
  columns,
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
}: SimpleTableMobileCardsProps) {
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
  const [titleCol, ...detailCols] = columns;
  const typeSize = knobProps.label.fontSize;
  const motion = transitionProps(knobProps.transition);

  if (data.length === 0) {
    return (
      <View
        flexDirection="column"
        {...knobProps.gap}
        {...disabledChrome(Boolean(disabled), disabledState)}>
        {caption ? (
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
      {...(rowPressActive ? ({ 'data-row-press-scope': 'true' } as any) : {})}>
      {caption ? (
        <Text
          {...knobProps.label}
          color={knobProps.textAccentColor}>
          {caption}
        </Text>
      ) : null}
      {data.map((row, rowIndex) => {
        const intent = row._intent as IntentName | undefined;
        const titleValue = titleCol ? row[titleCol.accessorKey] : undefined;
        const titleRendered = titleCol?.cell ? titleCol.cell(titleValue, row, rowIndex) : titleValue;

        return (
          <View
            key={resolveRowId(row, rowIndex, getRowId)}
            testID="simple-table-card"
            {...knobProps.surface}
            {...knobProps.cardSurface}
            elevation={knobProps.elevation}
            {...(tableZebraOn && rowIndex % 2 === 1
              ? { backgroundColor: tableZebraFill(knobProps.cardSurface.backgroundColor) }
              : {})}
            {...(intent ? { theme: intent, backgroundColor: '$color3' as const } : {})}
            {...(disabled ? {} : { hoverStyle: { backgroundColor: '$backgroundHover' } })}
            {...motion}
            {...disabledChrome(Boolean(disabled), disabledState)}
            {...({
              'data-table-zebra': tableZebraOn ? (rowIndex % 2 === 0 ? 'even' : 'odd') : 'off',
            } as any)}
            {...(getRowPressProps(row, rowIndex, 'card') as any)}>
            {titleCol ? (
              <View
                {...(detailCols.length > 0
                  ? {
                      paddingBottom: knobProps.gap.gap,
                      marginBottom: knobProps.gap.gap,
                      ...gridRule(knobProps.surface.borderWidth, true),
                    }
                  : {})}>
                {typeof titleRendered === 'string' || typeof titleRendered === 'number' || titleRendered == null ? (
                  <AlignedCellText
                    align={titleCol.align}
                    body={knobProps.body}
                    fontSize={typeSize}>
                    {titleRendered ?? ''}
                  </AlignedCellText>
                ) : (
                  titleRendered
                )}
              </View>
            ) : null}
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
}

// ===========================================================================
// Desktop Table Layout
// ===========================================================================

export interface SimpleTableDesktopProps extends ViewProps {
  /** Array of data objects to render */
  data: Record<string, any>[];
  /** Column configuration */
  columns: SimpleTableColumn[];
  /** Accessible label for the table */
  'aria-label'?: string;
  caption?: string;
  onRowPress?: (row: Record<string, any>, rowIndex: number) => void;
  rowLabel?: (row: Record<string, any>) => string;
  getRowId?: (row: Record<string, any>, rowIndex: number) => string;
  disabled?: boolean;
}

/** Desktop table layout using Layer 1 Table primitives. Exported for testing. */
export function SimpleTableDesktop({
  data,
  columns,
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
  ...props
}: SimpleTableDesktopProps) {
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
  const ariaLabel = caption ? undefined : props['aria-label'];
  const typeSize = knobProps.label.fontSize;
  const motion = transitionProps(knobProps.transition);
  const pad = cellPad(knobProps.gap.gap);
  const frameBorder = knobProps.surface.borderWidth;

  return (
    <Table
      {...props}
      minWidth={0}
      {...({
        overflow: 'auto',
        'data-simple-table-frame': 'true',
        'data-border-width': String(frameBorder),
        'data-animation': knobProps.transition ? 'on' : 'none',
      } as Record<string, unknown>)}
      {...disabledChrome(Boolean(disabled), disabledState)}
      aria-label={ariaLabel}
      {...({ 'aria-rowcount': data.length + 1 } as any)}>
      {caption ? (
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
              cellLocation={cellLocationFor(colIndex, columns.length)}
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
                {...(col.align === 'right' ? ({ fontVariant: ['tabular-nums'] } as any) : {})}>
                {col.header}
              </Text>
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Head>
      <Table.Body {...(rowPressActive ? ({ 'data-row-press-scope': 'true' } as any) : {})}>
        {data.length === 0 ? (
          <Table.Row>
            <Table.Cell
              cellWidth="auto"
              borderRadius={0}
              {...({ colSpan: Math.max(columns.length, 1) } as any)}>
              <EmptyState
                compact
                aria-live="polite"
                title={t('No data available')}
              />
            </Table.Cell>
          </Table.Row>
        ) : (
          data.map((row, rowIndex) => {
            const intent = row._intent as IntentName | undefined;
            const intentProps = intent ? { [intent]: true } : {};
            const isLast = rowIndex === data.length - 1;
            const zebraFill =
              !intent && tableZebraOn && rowIndex % 2 === 1
                ? { backgroundColor: tableZebraFill(knobProps.surface.backgroundColor) }
                : {};

            return (
              <Table.Row
                key={resolveRowId(row, rowIndex, getRowId)}
                rowLocation={rowLocationFor(rowIndex, data.length)}
                {...(disabled ? {} : { hoverStyle: { backgroundColor: '$backgroundHover' } })}
                {...motion}
                {...zebraFill}
                {...intentProps}
                {...({
                  'data-table-zebra': tableZebraOn ? (rowIndex % 2 === 0 ? 'even' : 'odd') : 'off',
                } as any)}
                {...(getRowPressProps(row, rowIndex) as any)}>
                {columns.map((col, colIndex) => (
                  <Table.Cell
                    key={col.accessorKey}
                    justifyContent={alignToFlex(col.align)}
                    cellLocation={cellLocationFor(colIndex, columns.length)}
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
}

// ===========================================================================
// Main Component
// ===========================================================================

export function SimpleTable({
  data,
  columns,
  layout = 'auto',
  caption,
  onRowPress,
  rowLabel,
  getRowId,
  disabled,
  ...props
}: SimpleTableProps) {
  const { knobProps } = useResolvedKnobs({ component: 'SimpleTable' });
  const { sm } = useMedia();

  // Card layout below `$sm` (layout="auto") or when pinned via layout="cards"
  if (layout === 'cards' || (layout === 'auto' && !sm)) {
    return (
      <View
        {...knobProps.containerRadius}
        {...props}
        testID="simple-table-cards"
        {...({
          'data-simple-table-frame': 'true',
          'data-border-width': String(knobProps.surface.borderWidth),
          'data-animation': knobProps.transition ? 'on' : 'none',
        } as Record<string, unknown>)}>
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
}
