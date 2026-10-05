/**
 * Table primitives — styled semantic table components.
 *
 * Layer 1 only: depends on theme + Tamagui (no forms, no data-table).
 * Consumed by @repo/forms, etc.
 */

import { hairline, MIN_PRESS_TARGET, Surface, transitionProps, useResolvedKnobs } from '@repo/theme';
import { Children, Fragment, createContext, isValidElement, useContext } from 'react';
import type { FontSizeTokens, SizeTokens } from 'tamagui';
import {
  SizableText,
  Theme,
  ThemeableStack,
  createStyledContext,
  isWeb,
  styled,
  useMedia,
  withStaticProperties,
} from 'tamagui';

import { TableCellContext } from './tableCellContext';
import { wrapBareTextChildren } from './textRidesText';

export { TableCellContext, useIsInTableCell, useTableCellContext } from './tableCellContext';
export type { TableCellContextValue } from './tableCellContext';
export { isBareTextChild, wrapBareTextChildren } from './textRidesText';

interface AlignCells {
  y: 'center' | 'start' | 'end';
  x: 'center' | 'start' | 'end';
}

type AlignHeaderCells = AlignCells;

type DisplayMode = 'table' | 'flex';

// Chromium ignores min-height on display:table-cell and table-row, so in the
// table composition a row minimum has to be written as `height`, which CSS
// tables treat as a floor the content can still grow past. Flex keeps
// min-height, because a flex `height` would clip taller content.
function rowMinimum(
  displayMode: DisplayMode | undefined,
  value: unknown,
): { minHeight: any } | { minHeight: any; height: any } {
  const mode = displayMode ?? (isWeb ? 'table' : 'flex');
  return mode === 'table' ? { minHeight: value, height: value } : { minHeight: value };
}

const TableContext = createStyledContext<{
  cellWidth: SizeTokens | number;
  cellHeight: SizeTokens | number;
  alignHeaderCells: {
    y: 'center' | 'start' | 'end';
    x: 'center' | 'start' | 'end';
  };
  alignCells: {
    y: 'center' | 'start' | 'end';
    x: 'center' | 'start' | 'end';
  };
  borderColor: string;
  displayMode: 'table' | 'flex';
}>({
  cellWidth: '$8',
  cellHeight: '$8',
  alignHeaderCells: { x: 'start', y: 'center' },
  alignCells: { x: 'start', y: 'center' },
  borderColor: '$color6',
  // CSS table display values ("table-row", "table-cell", …) are no-ops in
  // React Native — cells stack vertically and bare Tables are unreadable.
  // Native defaults to the flex composition; web keeps semantic table layout.
  displayMode: isWeb ? 'table' : 'flex',
});

/**
 * Element rendering: tamagui 2.0.0-rc derives the DOM element from the
 * `render` prop (`tag:` passes through as a plain attribute), so every
 * primitive sets `render:` to emit real `<table>/<thead>/<tbody>/<tfoot>/
 * <tr>/<th>/<td>/<caption>` elements on web. On native `render` is inert
 * (skipProps) and the components stay RN Views in the flex displayMode.
 *
 * Explicit ARIA roles stay on every element: consumers restyle these
 * elements (`displayMode="flex"`, sticky cells), and browsers drop the
 * implicit table roles when a table element's display is overridden.
 */

/** Table Components */
const Row = styled(ThemeableStack, {
  name: 'TableRow',
  ...({ render: 'tr' } as { render?: string }),
  role: 'row',
  context: TableContext,
  display: 'table-row' as any,
  variants: {
    displayMode: {
      table: { display: 'table-row' as any },
      flex: {
        display: 'flex' as any,
        flexDirection: 'row' as any,
        width: '100%',
        alignItems: 'center',
      },
    },
    rowLocation: {
      first: () => ({}),
      last: () => ({}),
      middle: () => ({}),
    },
  } as const,
});

const Cell = styled(ThemeableStack, {
  name: 'TableCell',
  ...({ render: 'td' } as { render?: string }),
  role: 'cell',
  context: TableContext,
  display: 'table-cell' as any,
  // verticalAlign goes via inline style; Tamagui forwards it to the DOM as a JSX
  // prop otherwise, which React rejects ("React does not recognize verticalAlign").
  style: { verticalAlign: 'middle' },
  // Cells are ROW-flex so each axis does what it says —
  // justifyContent is horizontal (start by default; align-by-type overrides
  // land here) and alignItems is vertical (center). The previous column
  // direction put alignItems:center on the HORIZONTAL axis, centering every
  // cell's text and making variable-width columns ragged (A16-02).
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingHorizontal: '$2',
  paddingVertical: '$3',
  overflow: 'hidden',
  variants: {
    displayMode: {
      table: { display: 'table-cell' as any, style: { verticalAlign: 'middle' } },
      flex: { display: 'flex' as any, overflow: 'visible' as any },
    },
    cellWidth: {
      /** Equal flex for consistency across rows (flex rows size independently) */
      auto: () => ({
        flex: 1,
      }),
      ':number': (val) => ({
        width: val,
        minWidth: val,
      }),
      '...size': (name, { tokens }) => ({
        width: tokens.size[name],
        minWidth: tokens.size[name],
      }),
    },
    cellHeight: {
      '...size': (name, { tokens, props }) =>
        rowMinimum((props as { displayMode?: DisplayMode }).displayMode, tokens.size[name]),
    },
    // Row-flex axis map: y → alignItems (vertical), x →
    // justifyContent (horizontal).
    alignCells: (val: AlignCells) => {
      return {
        alignItems: val.y === 'center' ? 'center' : `flex-${val.y}`,
        justifyContent: val.x === 'center' ? 'center' : `flex-${val.x}`,
      };
    },
    cellLocation: {
      first: () => ({}),
      last: () => ({}),
      middle: () => ({}),
    },
  } as const,
});

const HeaderCell = styled(ThemeableStack, {
  name: 'TableHeaderCell',
  ...({ render: 'th', scope: 'col' } as { render?: string; scope: string }),
  role: 'columnheader',
  context: TableContext,
  display: 'table-cell' as any,
  // verticalAlign goes via inline style; see TableCell above for context.
  // fontWeight/textAlign neutralize the UA styles a real <th> brings
  // (bold + centered) so header content keeps its pre-migration look;
  // logical `start` stays RTL-correct.
  style: { verticalAlign: 'middle', fontWeight: 'normal', textAlign: 'start' },
  // Row-flex like TableCell — header labels start-align on
  // the same column line as body cell text.
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingHorizontal: '$2',
  paddingVertical: '$3',
  backgroundColor: '$color2',

  variants: {
    displayMode: {
      table: {
        display: 'table-cell' as any,
        style: { verticalAlign: 'middle', fontWeight: 'normal', textAlign: 'start' },
      },
      flex: { display: 'flex' as any },
    },
    cellWidth: {
      /** Equal flex for consistency across rows */
      auto: () => ({
        flex: 1,
      }),
      ':number': (val) => ({
        width: val,
        minWidth: val,
      }),
      '...size': (name, { tokens }) => ({
        width: tokens.size[name],
        minWidth: tokens.size[name],
      }),
    },
    // Row-flex axis map: y → alignItems (vertical), x →
    // justifyContent (horizontal).
    alignHeaderCells: (val: AlignHeaderCells) => {
      return {
        alignItems: val.y === 'center' ? 'center' : `flex-${val.y}`,
        justifyContent: val.x === 'center' ? 'center' : `flex-${val.x}`,
      };
    },
    cellHeight: {
      '...size': (name, { tokens, props }) =>
        rowMinimum((props as { displayMode?: DisplayMode }).displayMode, tokens.size[name]),
    },
    cellLocation: {
      first: () => ({}),
      last: () => ({}),
      middle: () => ({}),
    },
  } as const,
});

export type TableZebraStripe = 'off' | 'even' | 'odd';

export function tableZebraStripe(tableZebra: unknown, index: number): TableZebraStripe {
  if (tableZebra !== 'on') {
    return 'off';
  }
  return index % 2 === 1 ? 'odd' : 'even';
}

// `$background` is the ramp's first step.
function rampStep(fill: unknown): number | undefined {
  if (fill === '$background') {
    return 1;
  }
  if (typeof fill !== 'string') {
    return undefined;
  }
  const step = fill.match(/^\$color(\d+)$/);
  return step ? Number(step[1]) : undefined;
}

// A card's own fill climbs the ramp with dark elevation, so a fixed
// $color2 stripe vanishes on a small-elevation dark card.
export function tableZebraFill(hostFill: unknown): `$color${number}` {
  return `$color${Math.min((rampStep(hostFill) ?? 1) + 1, 12)}`;
}

// One step at the foot of the dark ramp is about 4/255 a channel, too faint to
// read as a press, so the step floors at the old fixed $color4.
export function tablePressFill(restFill: unknown): `$color${number}` {
  const step = rampStep(restFill);
  if (step === undefined) {
    return '$color4';
  }
  if (step >= 12) {
    return '$color11';
  }
  return `$color${Math.max(step + 1, 4)}`;
}

const BodyRowIndexContext = createContext<number | undefined>(undefined);

function indexBodyRows(children: React.ReactNode, counter: { next: number }): React.ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) {
      return child;
    }
    if (child.type === Fragment) {
      return <Fragment>{indexBodyRows((child.props as { children?: React.ReactNode }).children, counter)}</Fragment>;
    }
    return <BodyRowIndexContext.Provider value={counter.next++}>{child}</BodyRowIndexContext.Provider>;
  });
}

const TableBody = styled(ThemeableStack, {
  name: 'TableBody',
  ...({ render: 'tbody' } as { render?: string }),
  role: 'rowgroup',
  context: TableContext,
  display: 'table-row-group' as any,
  variants: {
    displayMode: {
      table: { display: 'table-row-group' as any },
      flex: {
        display: 'flex' as any,
        flexDirection: 'column' as any,
        width: '100%',
        overflowY: 'auto' as any,
        // basis auto (not flex:1 basis-0): in auto-height parents a basis-0
        // chain resolves to 0 and the body collapses to a scrollbar sliver;
        // basis auto sizes to rows there while still filling sized parents
        // (grow) and scrolling (shrink + minHeight 0).
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'auto' as any,
        minHeight: 0,
      },
    },
  } as const,
});

const TableHead = styled(ThemeableStack, {
  name: 'TableHead',
  ...({ render: 'thead' } as { render?: string }),
  role: 'rowgroup',
  context: TableContext,
  display: 'table-header-group' as any,
  borderBottomWidth: 1,
  borderBottomColor: '$color6',
  variants: {
    displayMode: {
      table: { display: 'table-header-group' as any },
      flex: {
        display: 'flex' as any,
        flexDirection: 'column' as any,
        width: '100%',
        flexShrink: 0,
      },
    },
  } as const,
});

const TableFoot = styled(ThemeableStack, {
  name: 'TableFoot',
  ...({ render: 'tfoot' } as { render?: string }),
  role: 'rowgroup',
  context: TableContext,
  display: 'table-footer-group' as any,
  variants: {
    displayMode: {
      table: { display: 'table-footer-group' as any },
      flex: {
        display: 'flex' as any,
        flexDirection: 'column' as any,
        width: '100%',
        flexShrink: 0,
      },
    },
  } as const,
});

const TableCaption = styled(ThemeableStack, {
  name: 'TableCaption',
  ...({ render: 'caption' } as { render?: string }),
  context: TableContext,
  display: 'table-caption' as any,
  // Real <caption> centers its text by UA default — keep the primitive's
  // pre-migration start alignment (logical, RTL-correct).
  style: { textAlign: 'start' },
  paddingVertical: '$2',
  paddingHorizontal: '$2',
});

const TableComp = styled(ThemeableStack, {
  name: 'Table',
  ...({ render: 'table' } as { render?: string }),
  role: 'table',
  context: TableContext,
  display: 'table' as any,
  borderWidth: 1,
  borderColor: '$color6',
  backgroundColor: '$background',
  overflow: 'hidden',
  width: '100%',
  variants: {
    displayMode: {
      table: { display: 'table' as any },
      flex: {
        display: 'flex' as any,
        flexDirection: 'column' as any,
        // See Body: basis auto so auto-height parents get content height.
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'auto' as any,
        minHeight: 0,
      },
    },
    /** Empty variants to satisfy context-driven props without ts errors on Table */
    cellWidth: {
      '...size': () => {
        return {};
      },
    },
    cellHeight: {
      '...size': () => {
        return {};
      },
    },
    alignHeaderCells: (_val) => ({}),
    alignCells: (_val) => ({}),
  } as const,
});

/** Intent type for Table.Row */
type IntentName = 'accent' | 'error' | 'warning' | 'success';

export interface ThemedRowProps extends React.ComponentProps<typeof Row> {
  accent?: boolean;
  error?: boolean;
  warning?: boolean;
  success?: boolean;
}

function resolveIntent(props: ThemedRowProps): IntentName | undefined {
  if (props.accent) {
    return 'accent';
  }
  if (props.error) {
    return 'error';
  }
  if (props.warning) {
    return 'warning';
  }
  if (props.success) {
    return 'success';
  }
  return undefined;
}

/**
 * Row density: the `space` knob scales cell padding (row density)
 * without adding an outer row inset.
 * `medium` matches the pre-knob defaults so default rendering is unchanged.
 */
export function getTableCellPadding(space: string): {
  paddingHorizontal: string;
  paddingVertical: string;
} {
  const map: Record<string, { paddingHorizontal: string; paddingVertical: string }> = {
    small: { paddingHorizontal: '$1.5', paddingVertical: '$2' },
    medium: { paddingHorizontal: '$2', paddingVertical: '$3' },
    large: { paddingHorizontal: '$3', paddingVertical: '$4' },
  };
  return map[space] ?? map.medium;
}

/**
 * Responsive layout mode for the Table primitive.
 * - `table`: always render the semantic table (default — Layer-1 consumers
 *   like markdown tables and DataTable's grid own their responsive handling)
 * - `cards`: render each body row as a stacked card of label/value pairs
 * - `auto`: table on `$sm` and up, cards below (W11 compact class)
 */
export type TableLayout = 'table' | 'cards' | 'auto';

interface CardRowModel {
  key: string;
  intent?: IntentName;
  cells: Array<{ key: string; content: React.ReactNode }>;
}

/** Flatten fragments/arrays into a single element list. */
function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  return Children.toArray(children).flatMap((child) => {
    if (isValidElement(child) && child.type === Fragment) {
      return flattenChildren((child.props as { children?: React.ReactNode }).children);
    }
    return [child];
  });
}

/**
 * Statically extract header labels, body rows, and the caption from the
 * canonical `Table > Head/Body/Caption > Row > Cell` composition. Rows or
 * cells wrapped in custom components are not discovered — those cards render
 * value-only rows (documented limitation of the card layout).
 */
function extractCardModel(children: React.ReactNode): {
  headerLabels: React.ReactNode[];
  rows: CardRowModel[];
  caption: React.ReactNode;
} {
  const headerLabels: React.ReactNode[] = [];
  const rows: CardRowModel[] = [];
  let caption: React.ReactNode = null;

  for (const section of flattenChildren(children)) {
    if (!isValidElement(section)) {
      continue;
    }
    const sectionProps = section.props as { children?: React.ReactNode };
    if (section.type === ThemedTableHead) {
      for (const rowEl of flattenChildren(sectionProps.children)) {
        if (!isValidElement(rowEl) || rowEl.type !== ThemedRow) {
          continue;
        }
        flattenChildren((rowEl.props as { children?: React.ReactNode }).children).forEach((cellEl, index) => {
          if (!isValidElement(cellEl) || cellEl.type !== ThemedHeaderCell) {
            return;
          }
          if (headerLabels[index] === undefined) {
            headerLabels[index] = (cellEl.props as { children?: React.ReactNode }).children;
          }
        });
      }
    } else if (section.type === ThemedTableBody) {
      for (const rowEl of flattenChildren(sectionProps.children)) {
        if (!isValidElement(rowEl) || rowEl.type !== ThemedRow) {
          continue;
        }
        const rowProps = rowEl.props as ThemedRowProps;
        const cells = flattenChildren(rowProps.children)
          .filter((cellEl): cellEl is React.ReactElement => isValidElement(cellEl) && cellEl.type === ThemedCell)
          .map((cellEl, index) => ({
            key: cellEl.key ?? String(index),
            content: (cellEl.props as { children?: React.ReactNode }).children,
          }));
        rows.push({
          key: rowEl.key ?? String(rows.length),
          intent: resolveIntent(rowProps),
          cells,
        });
      }
    } else if (section.type === TableCaption) {
      caption = sectionProps.children;
    }
    // Foot content has no card slot — it is omitted in the card layout.
  }

  return { headerLabels, rows, caption };
}

/** Card list rendering for the Table primitive (layout="cards" / narrow auto). */
function TableCardsList({ children, ...props }: { children?: React.ReactNode; [key: string]: any }) {
  const { knobProps } = useResolvedKnobs();
  const { headerLabels, rows, caption } = extractCardModel(children);
  // Table-context props have no meaning on the card list — drop them.
  const {
    cellWidth: _cellWidth,
    cellHeight: _cellHeight,
    alignCells: _alignCells,
    alignHeaderCells: _alignHeaderCells,
    displayMode: _displayMode,
    style: _style,
    ...viewProps
  } = props;

  const motion = transitionProps(knobProps.transition);
  return (
    <ThemeableStack
      flexDirection="column"
      {...knobProps.gap}
      {...motion}
      testID="table-cards"
      {...({ 'data-animation': knobProps.transition ? 'on' : 'none' } as Record<string, unknown>)}
      {...viewProps}>
      {caption != null &&
        (typeof caption === 'string' || typeof caption === 'number' ? (
          <SizableText fontSize={knobProps.sizeToken as FontSizeTokens} color="$color10">
            {caption}
          </SizableText>
        ) : (
          caption
        ))}
      {rows.map((row, rowIndex) => {
        const stripe = tableZebraStripe(knobProps.tableZebra, rowIndex);
        const card = (
          <ThemeableStack
            key={row.key}
            testID="table-card"
            {...knobProps.surface}
            {...knobProps.cardSurface}
            elevation={knobProps.elevation}
            {...motion}
            borderColor="$color6"
            {...(stripe === 'odd' ? { backgroundColor: tableZebraFill(knobProps.cardSurface.backgroundColor) } : {})}
            {...(row.intent ? { backgroundColor: '$color3' as const } : {})}
            {...({ 'data-table-zebra': stripe } as Record<string, unknown>)}>
            {row.cells.map((cell, index) => {
              const label = headerLabels[index];
              return (
                <ThemeableStack key={cell.key} flexDirection="row" alignItems="center" gap="$2" paddingVertical="$1.5">
                  {label != null && (
                    <SizableText
                      fontSize={knobProps.sizeToken as FontSizeTokens}
                      fontWeight="500"
                      color={knobProps.textAccentColor}
                      width="40%"
                      flexShrink={0}>
                      {label}
                    </SizableText>
                  )}
                  <ThemeableStack flex={1} minWidth={0}>
                    <TableCellSurface isHeader={false}>{cell.content}</TableCellSurface>
                  </ThemeableStack>
                </ThemeableStack>
              );
            })}
          </ThemeableStack>
        );
        return row.intent ? (
          <Theme key={row.key} name={row.intent}>
            {card}
          </Theme>
        ) : (
          card
        );
      })}
    </ThemeableStack>
  );
}

export interface ThemedTableProps extends React.ComponentProps<typeof TableComp> {
  /** Responsive layout — see {@link TableLayout}. Default `table`. */
  layout?: TableLayout;
}

// Themed wrappers that inject resolved knob recipes
function ThemedTableComp({ layout = 'table', ...props }: ThemedTableProps) {
  const { knobProps } = useResolvedKnobs();
  const { sm } = useMedia();
  // resolveKnobs already floors outlined+none to the hairline (0.5).
  const resolvedBorderWidth = knobProps.surface.borderWidth;

  const showCards = layout === 'cards' || (layout === 'auto' && !sm);
  if (showCards) {
    return <TableCardsList {...props} />;
  }

  const motion = transitionProps(knobProps.transition);
  return (
    // A table nested in a body cell must not stripe its rows by the outer index.
    <BodyRowIndexContext.Provider value={undefined}>
      <TableComp
        // Table frames are R-OUTER + SF-CARD-tier surface (theme-propagation-spec
        // `@repo/table-primitives`): outer corners follow the capped
        // outer radius map; like the card list, the fill never takes the
        // control flip.
        {...knobProps.surface}
        {...knobProps.borderRadiusNested}
        borderWidth={resolvedBorderWidth}
        elevation={knobProps.elevation}
        {...motion}
        // Size knob sets default row height through the table context; consumer
        // cellHeight (table- or cell-level) still overrides via {...props}.
        cellHeight={knobProps.sizeToken as SizeTokens}
        {...({ 'data-animation': knobProps.transition ? 'on' : 'none' } as Record<string, unknown>)}
        {...props}
        // borderSpacing 0 neutralizes the real <table> UA default (2px gaps
        // between cells) so the migrated element keeps the div-table look.
        style={[{ tableLayout: 'fixed' as const, borderSpacing: 0 }, props.style]}
      />
    </BodyRowIndexContext.Provider>
  );
}

function ThemedTableBody({ children, ...props }: React.ComponentProps<typeof TableBody>) {
  return <TableBody {...props}>{indexBodyRows(children, { next: 0 })}</TableBody>;
}

function ThemedTableHead(props: React.ComponentProps<typeof TableHead>) {
  // Head/body rule is a divider, not a control border — hairline on
  // high-DPI (Axiom 15). Explicit consumer props still override.
  return <TableHead {...hairline.bottom} {...props} />;
}

function ThemedRow({ accent, error, warning, success, ...props }: ThemedRowProps) {
  const { knobProps } = useResolvedKnobs();
  const context = TableContext.useStyledContext();
  const motion = transitionProps(knobProps.transition);
  const intent = resolveIntent({ accent, error, warning, success } as ThemedRowProps);
  const bodyIndex = useContext(BodyRowIndexContext);
  const stripe = bodyIndex === undefined ? undefined : tableZebraStripe(knobProps.tableZebra, bodyIndex);
  // Rows abut, so a slop outset would intersect the neighbour and the
  // painted row is the only press target a pressable row can have.
  const pressFloor =
    props.onPress != null ? rowMinimum(props.displayMode ?? context.displayMode, MIN_PRESS_TARGET) : null;

  // Intent rows must not use the plain <Theme> wrapper: on web it renders a
  // display:contents <span> between <tbody> and <tr>, which is invalid HTML
  // once the primitives emit real table elements (SSR parsers foster-parent
  // the span out of the table and hydration breaks). Instead the theme's
  // CSS class goes on the <tr> itself (scoping the theme CSS variables for
  // the row and its cells) while <Theme forceClassName={false}> still
  // provides the theme context for JS-resolved values and native styling
  // without emitting any wrapper element.
  const row = (
    <Row
      {...motion}
      {...pressFloor}
      {...({ 'data-animation': knobProps.transition ? 'on' : 'none' } as Record<string, unknown>)}
      {...(stripe ? ({ 'data-table-zebra': stripe } as Record<string, unknown>) : {})}
      {...(intent
        ? {
            backgroundColor: '$color3' as const,
            // `color: $color` mirrors the inline color the Theme span used
            // to set, so unstyled text in cells inherits the intent color.
            color: '$color' as const,
            ...(isWeb ? { className: `t_${intent}` } : {}),
          }
        : {})}
      {...props}
      {...(stripe === 'odd' && !intent && props.backgroundColor == null
        ? { backgroundColor: tableZebraFill(knobProps.surface.backgroundColor) }
        : {})}
    />
  );

  if (intent) {
    return (
      <Theme name={intent} forceClassName={false}>
        {row}
      </Theme>
    );
  }
  return row;
}

function TableCellSurface({ isHeader, children }: { isHeader: boolean; children: React.ReactNode }) {
  return (
    <TableCellContext.Provider value={{ inTableCell: true, isHeader }}>
      <Surface size="small" density="compact">
        <TableCellSurfaceBody isHeader={isHeader}>{children}</TableCellSurfaceBody>
      </Surface>
    </TableCellContext.Provider>
  );
}

function TableCellSurfaceBody({ isHeader, children }: { isHeader: boolean; children: React.ReactNode }) {
  // Inside the cell Surface so size/density clamp; compact tightens gaps,
  // not control height (density no longer couples to size).
  const { knobProps } = useResolvedKnobs();
  const { fontWeight: bodyWeight, ...body } = knobProps.body;
  // Array string children wrap too (coalesced runs),
  // not just the singleton case. A body cell's value takes bodyFont and
  // fontWeight like any body text; the weight is the last prop so
  // no size or family variant paints the font ramp's weight over it.
  return wrapBareTextChildren(children, (label, key) => (
    <SizableText
      key={key}
      {...(isHeader ? {} : body)}
      fontSize={knobProps.sizeToken as FontSizeTokens}
      // data-chrome: honour textAccent on labels. Body cells stay T-VALUE
      // (inherit), matching SimpleTable's header vs value split.
      {...(isHeader
        ? {
            color: knobProps.textAccentColor,
            ...({ 'data-text-accent': String(knobProps.textAccentColor) } as Record<string, unknown>),
          }
        : {})}
      fontWeight={isHeader ? '600' : (bodyWeight as '400')}>
      {label}
    </SizableText>
  ));
}

function ThemedCell({ children, style, ...props }: React.ComponentProps<typeof Cell>) {
  const { knobProps } = useResolvedKnobs();
  const motion = transitionProps(knobProps.transition);
  return (
    <Cell
      {...getTableCellPadding(knobProps.space)}
      {...motion}
      {...({ 'data-animation': knobProps.transition ? 'on' : 'none' } as Record<string, unknown>)}
      {...props}
      // Compose (not replace) the inline style so a consumer style (e.g.
      // sticky pinned cells) keeps the verticalAlign baseline.
      style={[{ verticalAlign: 'middle' }, style as any]}>
      <TableCellSurface isHeader={false}>{children}</TableCellSurface>
    </Cell>
  );
}

function ThemedHeaderCell({ children, style, ...props }: React.ComponentProps<typeof HeaderCell>) {
  const { knobProps } = useResolvedKnobs();
  const motion = transitionProps(knobProps.transition);
  return (
    <HeaderCell
      {...getTableCellPadding(knobProps.space)}
      {...motion}
      {...({ 'data-animation': knobProps.transition ? 'on' : 'none' } as Record<string, unknown>)}
      {...props}
      // Compose (not replace) the inline style so consumer styles (sticky
      // pinned headers) keep the real-<th> UA neutralizers (bold/centered).
      style={[{ verticalAlign: 'middle', fontWeight: 'normal', textAlign: 'start' }, style as any]}>
      <TableCellSurface isHeader>{children}</TableCellSurface>
    </HeaderCell>
  );
}

export const Table = withStaticProperties(ThemedTableComp, {
  Head: ThemedTableHead,
  Body: ThemedTableBody,
  Row: ThemedRow,
  Cell: ThemedCell,
  HeaderCell: ThemedHeaderCell,
  Foot: TableFoot,
  Caption: TableCaption,
});

// Export prop types for all styled components
export type TableProps = ThemedTableProps;
export type TableRowProps = ThemedRowProps;
export type TableCellProps = React.ComponentProps<typeof Cell>;
export type TableHeaderCellProps = React.ComponentProps<typeof HeaderCell>;
export type TableBodyProps = React.ComponentProps<typeof TableBody>;
export type TableHeadProps = React.ComponentProps<typeof TableHead>;
export type TableFootProps = React.ComponentProps<typeof TableFoot>;
export type TableCaptionProps = React.ComponentProps<typeof TableCaption>;
