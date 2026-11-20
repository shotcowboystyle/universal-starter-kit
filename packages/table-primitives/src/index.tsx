/**
 * Table primitives — styled semantic table components.
 *
 * Layer 1 only: depends on theme + Tamagui (no forms, no data-table).
 * Consumed by @repo/forms, etc.
 */

import { hairline, MIN_PRESS_TARGET, Surface, transitionProps, useResolvedKnobs } from '@repo/theme';
import { Children, Fragment, createContext, isValidElement, useContext, useMemo } from 'react';
import type { ComponentProps } from 'react';
import type { FontSizeTokens, SizeTokens, Variable } from 'tamagui';
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

import { TableCellContext } from './table-cell-context';
import { isBareTextChild, wrapBareTextChildren } from './text-rides-text';

export { TableCellContext, useIsInTableCell, useTableCellContext } from './table-cell-context';
export type { TableCellContextValue } from './table-cell-context';
export { isBareTextChild, wrapBareTextChildren } from './text-rides-text';

type StackProps = ComponentProps<typeof ThemeableStack>;
type StackDisplay = NonNullable<StackProps['display']>;

// Tamagui forwards `display` to CSS verbatim on web; its prop type just omits the table-* keywords.
// SAFETY: every caller passes a valid CSS display keyword, which is all the web renderer reads.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- string -> Tamagui's display union
const cssDisplay = (value: string) => value as StackDisplay;

const tableCellDisplay = cssDisplay('table-cell');

// SAFETY: callers pass the resolved knob token name (e.g. "$4") for the prop they name via the type argument.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters -- knob values are plain strings; Tamagui props want token unions
const asToken = <Token extends number | string>(value: string) => value as Token;

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
type KnobTransition = ReturnType<typeof useResolvedKnobs>['knobProps']['transition'];

const animationAttr = (transition: KnobTransition) => (transition == null || transition === '' ? 'none' : 'on');

const rowMinimum = (
  displayMode: DisplayMode | undefined,
  value: StackProps['minHeight'],
): Pick<StackProps, 'height' | 'minHeight'> => {
  const mode = displayMode ?? (isWeb ? 'table' : 'flex');
  return mode === 'table' ? { minHeight: value, height: value } : { minHeight: value };
};

interface SizeTokenMap {
  [name: string]: Variable<number> | undefined;
}

/** Looks up a size token by the variant's runtime name; an unknown name yields no value. */
const sizeValue = (sizes: SizeTokenMap, name: SizeTokens) => sizes[name];

// `displayMode` rides the table context; variant resolvers receive it among Tamagui's untyped props.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Props is whatever Tamagui hands the variant resolver
const displayModeOf = <Props,>(props: Props): DisplayMode | undefined => {
  // SAFETY: only a `displayMode` key is read, and its value is checked against the two DisplayMode literals.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reading one optional key off Tamagui's resolver props
  const { displayMode } = props as { displayMode?: unknown };
  return displayMode === 'table' || displayMode === 'flex' ? displayMode : undefined;
};

const TableContext = createStyledContext<{
  cellWidth: SizeTokens | number;
  cellHeight: SizeTokens | number;
  alignHeaderCells: AlignCells;
  alignCells: AlignCells;
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
  render: 'tr',
  role: 'row',
  context: TableContext,
  display: cssDisplay('table-row'),
  variants: {
    displayMode: {
      table: { display: cssDisplay('table-row') },
      flex: {
        display: 'flex',
        flexDirection: 'row',
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
  render: 'td',
  role: 'cell',
  context: TableContext,
  display: tableCellDisplay,
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
      table: { display: tableCellDisplay, style: { verticalAlign: 'middle' } },
      flex: { display: 'flex', overflow: 'visible' },
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
        width: sizeValue(tokens.size, name),
        minWidth: sizeValue(tokens.size, name),
      }),
    },
    cellHeight: {
      '...size': (name, { tokens, props }) => rowMinimum(displayModeOf(props), sizeValue(tokens.size, name)),
    },
    // Row-flex axis map: y → alignItems (vertical), x →
    // justifyContent (horizontal).
    alignCells: (val: AlignCells) => ({
      alignItems: val.y === 'center' ? 'center' : `flex-${val.y}`,
      justifyContent: val.x === 'center' ? 'center' : `flex-${val.x}`,
    }),
    cellLocation: {
      first: () => ({}),
      last: () => ({}),
      middle: () => ({}),
    },
  } as const,
});

// `scope` is a DOM attribute Tamagui's style props do not list.
const headerCellDomProps = { render: 'th', scope: 'col' };

const HeaderCell = styled(ThemeableStack, {
  name: 'TableHeaderCell',
  ...headerCellDomProps,
  role: 'columnheader',
  context: TableContext,
  display: tableCellDisplay,
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
        display: tableCellDisplay,
        style: { verticalAlign: 'middle', fontWeight: 'normal', textAlign: 'start' },
      },
      flex: { display: 'flex' },
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
        width: sizeValue(tokens.size, name),
        minWidth: sizeValue(tokens.size, name),
      }),
    },
    // Row-flex axis map: y → alignItems (vertical), x →
    // justifyContent (horizontal).
    alignHeaderCells: (val: AlignHeaderCells) => ({
      alignItems: val.y === 'center' ? 'center' : `flex-${val.y}`,
      justifyContent: val.x === 'center' ? 'center' : `flex-${val.x}`,
    }),
    cellHeight: {
      '...size': (name, { tokens, props }) => rowMinimum(displayModeOf(props), sizeValue(tokens.size, name)),
    },
    cellLocation: {
      first: () => ({}),
      last: () => ({}),
      middle: () => ({}),
    },
  } as const,
});

export type TableZebraStripe = 'off' | 'even' | 'odd';

export const tableZebraStripe = (tableZebra: string, index: number): TableZebraStripe => {
  if (tableZebra !== 'on') {
    return 'off';
  }
  return index % 2 === 1 ? 'odd' : 'even';
};

// `$background` is the ramp's first step.
const rampStep = (fill: string | undefined): number | undefined => {
  if (fill === '$background') {
    return 1;
  }
  if (fill === undefined) {
    return undefined;
  }
  const step = /^\$color(?<step>\d+)$/u.exec(fill)?.groups?.step;
  return step === undefined ? undefined : Number(step);
};

// A card's own fill climbs the ramp with dark elevation, so a fixed
// $color2 stripe vanishes on a small-elevation dark card.
export const tableZebraFill = (hostFill: string | undefined): `$color${number}` =>
  `$color${Math.min((rampStep(hostFill) ?? 1) + 1, 12)}`;

// One step at the foot of the dark ramp is about 4/255 a channel, too faint to
// read as a press, so the step floors at the old fixed $color4.
export const tablePressFill = (restFill: string | undefined): `$color${number}` => {
  const step = rampStep(restFill);
  if (step === undefined) {
    return '$color4';
  }
  if (step >= 12) {
    return '$color11';
  }
  return `$color${Math.max(step + 1, 4)}`;
};

const BodyRowIndexContext = createContext<number | undefined>(undefined);

interface ChildrenProps {
  children?: React.ReactNode;
}

const indexBodyRows = (children: React.ReactNode, counter: { next: number }): React.ReactNode[] | null | undefined =>
  // oxlint-disable-next-line react/no-react-children, typescript/promise-function-async -- the callback returns a ReactNode (which merely admits Promise); Children.map keeps element keys and recurses arrays, which the body-row index relies on
  Children.map(children, (child) => {
    if (!isValidElement<ChildrenProps>(child)) {
      return child;
    }
    if (child.type === Fragment) {
      return <>{indexBodyRows(child.props.children, counter)}</>;
    }
    const bodyIndex = counter.next;
    counter.next += 1;
    return <BodyRowIndexContext.Provider value={bodyIndex}>{child}</BodyRowIndexContext.Provider>;
  });

const TableBody = styled(ThemeableStack, {
  name: 'TableBody',
  render: 'tbody',
  role: 'rowgroup',
  context: TableContext,
  display: cssDisplay('table-row-group'),
  variants: {
    displayMode: {
      table: { display: cssDisplay('table-row-group') },
      flex: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        overflowY: 'auto',
        // basis auto (not flex:1 basis-0): in auto-height parents a basis-0
        // chain resolves to 0 and the body collapses to a scrollbar sliver;
        // basis auto sizes to rows there while still filling sized parents
        // (grow) and scrolling (shrink + minHeight 0).
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'auto',
        minHeight: 0,
      },
    },
  } as const,
});

const TableHead = styled(ThemeableStack, {
  name: 'TableHead',
  render: 'thead',
  role: 'rowgroup',
  context: TableContext,
  display: cssDisplay('table-header-group'),
  borderBottomWidth: 1,
  borderBottomColor: '$color6',
  variants: {
    displayMode: {
      table: { display: cssDisplay('table-header-group') },
      flex: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        flexShrink: 0,
      },
    },
  } as const,
});

const TableFoot = styled(ThemeableStack, {
  name: 'TableFoot',
  render: 'tfoot',
  role: 'rowgroup',
  context: TableContext,
  display: cssDisplay('table-footer-group'),
  variants: {
    displayMode: {
      table: { display: cssDisplay('table-footer-group') },
      flex: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        flexShrink: 0,
      },
    },
  } as const,
});

const TableCaption = styled(ThemeableStack, {
  name: 'TableCaption',
  render: 'caption',
  context: TableContext,
  display: cssDisplay('table-caption'),
  // Real <caption> centers its text by UA default — keep the primitive's
  // pre-migration start alignment (logical, RTL-correct).
  style: { textAlign: 'start' },
  paddingVertical: '$2',
  paddingHorizontal: '$2',
});

const TableComp = styled(ThemeableStack, {
  name: 'Table',
  render: 'table',
  role: 'table',
  context: TableContext,
  display: cssDisplay('table'),
  borderWidth: 1,
  borderColor: '$color6',
  backgroundColor: '$background',
  overflow: 'hidden',
  width: '100%',
  variants: {
    displayMode: {
      table: { display: cssDisplay('table') },
      flex: {
        display: 'flex',
        flexDirection: 'column',
        // See Body: basis auto so auto-height parents get content height.
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'auto',
        minHeight: 0,
      },
    },
    /** Empty variants to satisfy context-driven props without ts errors on Table */
    cellWidth: {
      '...size': () => ({}),
    },
    cellHeight: {
      '...size': () => ({}),
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

const resolveIntent = (
  props: Pick<ThemedRowProps, 'accent' | 'error' | 'success' | 'warning'>,
): IntentName | undefined => {
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
};

const cellPaddingBySpace = {
  small: { paddingHorizontal: '$1.5', paddingVertical: '$2' },
  medium: { paddingHorizontal: '$2', paddingVertical: '$3' },
  large: { paddingHorizontal: '$3', paddingVertical: '$4' },
};

const isCellPaddingSpace = (space: string): space is keyof typeof cellPaddingBySpace =>
  Object.hasOwn(cellPaddingBySpace, space);

/**
 * Row density: the `space` knob scales cell padding (row density)
 * without adding an outer row inset.
 * `medium` matches the pre-knob defaults so default rendering is unchanged.
 */
export const getTableCellPadding = (
  space: string,
): {
  paddingHorizontal: string;
  paddingVertical: string;
} => (isCellPaddingSpace(space) ? cellPaddingBySpace[space] : cellPaddingBySpace.medium);

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
  cells: { key: string; content: React.ReactNode }[];
}

/** Flatten fragments/arrays into a single element list. */
const flattenChildren = (children: React.ReactNode): React.ReactNode[] =>
  // oxlint-disable-next-line react/no-react-children -- Children.toArray drops empty nodes and assigns the keys the flattened list needs
  Children.toArray(children).flatMap((child) => {
    if (isValidElement<ChildrenProps>(child) && child.type === Fragment) {
      return flattenChildren(child.props.children);
    }
    return [child];
  });

const ThemedTableHead = (props: React.ComponentProps<typeof TableHead>) => (
  // Head/body rule is a divider, not a control border — hairline on
  // high-DPI (Axiom 15). Explicit consumer props still override.
  <TableHead
    {...hairline.bottom}
    {...props}
  />
);

/** Tint + theme-scoping class for an intent row; nothing for a plain row. */
const intentRowProps = (intent: IntentName | undefined) => {
  if (intent === undefined) {
    return {};
  }
  const base = {
    backgroundColor: '$color3' as const,
    // `color: $color` mirrors the inline color the Theme span used
    // to set, so unstyled text in cells inherits the intent color.
    color: '$color' as const,
  };
  return isWeb ? { ...base, className: `t_${intent}` } : base;
};

const ThemedRow = ({ accent, error, warning, success, ...props }: ThemedRowProps) => {
  const { knobProps } = useResolvedKnobs();
  const context = TableContext.useStyledContext();
  const motion = transitionProps(knobProps.transition);
  const intent = resolveIntent({ accent, error, warning, success });
  const bodyIndex = useContext(BodyRowIndexContext);
  const stripe = bodyIndex === undefined ? undefined : tableZebraStripe(knobProps.tableZebra, bodyIndex);
  // Rows abut, so a slop outset would intersect the neighbor and the
  // painted row is the only press target a pressable row can have.
  const pressFloor =
    props.onPress == null ? null : rowMinimum(props.displayMode ?? context.displayMode, MIN_PRESS_TARGET);

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
      data-animation={animationAttr(knobProps.transition)}
      data-table-zebra={stripe}
      {...intentRowProps(intent)}
      {...props}
      {...(stripe === 'odd' && !intent && props.backgroundColor == null
        ? { backgroundColor: tableZebraFill(knobProps.surface.backgroundColor) }
        : {})}
    />
  );

  if (intent) {
    return (
      <Theme
        name={intent}
        forceClassName={false}>
        {row}
      </Theme>
    );
  }
  return row;
};

const TableCellSurfaceBody = ({ isHeader, children }: { isHeader: boolean; children: React.ReactNode }) => {
  // Inside the cell Surface so size/density clamp; compact tightens gaps,
  // not control height (density no longer couples to size).
  const { knobProps } = useResolvedKnobs();
  const { fontWeight: bodyWeight, ...body } = knobProps.body;
  // Array string children wrap too (coalesced runs),
  // not just the singleton case. A body cell's value takes bodyFont and
  // fontWeight like any body text; the weight is the last prop so
  // no size or family variant paints the font ramp's weight over it.
  const labeled = wrapBareTextChildren(children, (label, key) => (
    <SizableText
      key={key}
      {...(isHeader ? {} : body)}
      fontSize={asToken<FontSizeTokens>(knobProps.sizeToken)}
      // data-chrome: honor textAccent on labels. Body cells stay T-VALUE
      // (inherit), matching SimpleTable's header vs value split.
      {...(isHeader
        ? {
            color: knobProps.textAccentColor,
            'data-text-accent': knobProps.textAccentColor,
          }
        : {})}
      fontWeight={isHeader ? '600' : asToken<'400'>(bodyWeight)}>
      {label}
    </SizableText>
  ));
  // A component must return a concrete element; ReactNode admits Promise.
  // oxlint-disable-next-line react/jsx-no-useless-fragment -- see above
  return <>{labeled}</>;
};

const TableCellSurface = ({ isHeader, children }: { isHeader: boolean; children: React.ReactNode }) => {
  const cellContext = useMemo(() => ({ inTableCell: true, isHeader }), [isHeader]);
  return (
    <TableCellContext.Provider value={cellContext}>
      <Surface
        size="small"
        density="compact">
        <TableCellSurfaceBody isHeader={isHeader}>{children}</TableCellSurfaceBody>
      </Surface>
    </TableCellContext.Provider>
  );
};

const ThemedHeaderCell = ({ children, style, ...props }: React.ComponentProps<typeof HeaderCell>) => {
  const { knobProps } = useResolvedKnobs();
  const motion = transitionProps(knobProps.transition);
  return (
    <HeaderCell
      {...getTableCellPadding(knobProps.space)}
      {...motion}
      data-animation={animationAttr(knobProps.transition)}
      {...props}
      // Compose (not replace) the inline style so consumer styles (sticky
      // pinned headers) keep the real-<th> UA neutralizers (bold/centered).
      style={[{ verticalAlign: 'middle', fontWeight: 'normal', textAlign: 'start' }, style]}>
      <TableCellSurface isHeader>{children}</TableCellSurface>
    </HeaderCell>
  );
};

type WithNodeChildren<Props> = Omit<Props, 'children'> & { children?: React.ReactNode };

const ThemedTableBody = ({ children, ...props }: WithNodeChildren<React.ComponentProps<typeof TableBody>>) => (
  <TableBody {...props}>{indexBodyRows(children, { next: 0 })}</TableBody>
);

const ThemedCell = ({ children, style, ...props }: React.ComponentProps<typeof Cell>) => {
  const { knobProps } = useResolvedKnobs();
  const motion = transitionProps(knobProps.transition);
  return (
    <Cell
      {...getTableCellPadding(knobProps.space)}
      {...motion}
      data-animation={animationAttr(knobProps.transition)}
      {...props}
      // Compose (not replace) the inline style so a consumer style (e.g.
      // sticky pinned cells) keeps the verticalAlign baseline.
      style={[{ verticalAlign: 'middle' }, style]}>
      <TableCellSurface isHeader={false}>{children}</TableCellSurface>
    </Cell>
  );
};

/**
 * Statically extract header labels, body rows, and the caption from the
 * canonical `Table > Head/Body/Caption > Row > Cell` composition. Rows or
 * cells wrapped in custom components are not discovered — those cards render
 * value-only rows (documented limitation of the card layout).
 */
type RowElementProps = Pick<ThemedRowProps, 'accent' | 'error' | 'success' | 'warning'> & ChildrenProps;

interface CardModel {
  headerLabels: React.ReactNode[];
  rows: CardRowModel[];
  caption: React.ReactNode;
}

/** First Head row wins per column: `headerLabels[column]` is that column's header content. */
const collectHeaderLabels = (headChildren: React.ReactNode, headerLabels: React.ReactNode[]) => {
  for (const rowEl of flattenChildren(headChildren)) {
    if (isValidElement<ChildrenProps>(rowEl) && rowEl.type === ThemedRow) {
      for (const [index, cellEl] of flattenChildren(rowEl.props.children).entries()) {
        if (
          isValidElement<ChildrenProps>(cellEl) &&
          cellEl.type === ThemedHeaderCell &&
          headerLabels[index] === undefined
        ) {
          headerLabels[index] = cellEl.props.children;
        }
      }
    }
  }
};

const collectBodyRows = (bodyChildren: React.ReactNode, rows: CardRowModel[]) => {
  for (const rowEl of flattenChildren(bodyChildren)) {
    if (isValidElement<RowElementProps>(rowEl) && rowEl.type === ThemedRow) {
      const rowProps = rowEl.props;
      const cells = flattenChildren(rowProps.children)
        .filter(
          (cellEl): cellEl is React.ReactElement<ChildrenProps> =>
            isValidElement<ChildrenProps>(cellEl) && cellEl.type === ThemedCell,
        )
        .map((cellEl, index) => ({
          key: cellEl.key ?? String(index),
          content: cellEl.props.children,
        }));
      rows.push({
        key: rowEl.key ?? String(rows.length),
        intent: resolveIntent(rowProps),
        cells,
      });
    }
  }
};

const extractCardModel = (children: React.ReactNode): CardModel => {
  const headerLabels: React.ReactNode[] = [];
  const rows: CardRowModel[] = [];
  let caption: React.ReactNode = null;

  for (const section of flattenChildren(children)) {
    if (isValidElement<ChildrenProps>(section)) {
      const { children: sectionChildren } = section.props;
      if (section.type === ThemedTableHead) {
        collectHeaderLabels(sectionChildren, headerLabels);
      } else if (section.type === ThemedTableBody) {
        collectBodyRows(sectionChildren, rows);
      } else if (section.type === TableCaption) {
        caption = sectionChildren;
      }
      // Foot content has no card slot — it is omitted in the card layout.
    }
  }

  return { headerLabels, rows, caption };
};

const tableContextKeys = ['cellWidth', 'cellHeight', 'alignCells', 'alignHeaderCells', 'displayMode', 'style'] as const;

/** Card list rendering for the Table primitive (layout="cards" / narrow auto). */
const TableCardsList = ({ children, ...props }: WithNodeChildren<Omit<ThemedTableProps, 'layout'>>) => {
  const { knobProps } = useResolvedKnobs();
  const { headerLabels, rows, caption } = extractCardModel(children);
  // Table-context props have no meaning on the card list — drop them.
  const viewProps: Omit<typeof props, (typeof tableContextKeys)[number]> = { ...props };
  for (const key of tableContextKeys) {
    Reflect.deleteProperty(viewProps, key);
  }

  const motion = transitionProps(knobProps.transition);
  return (
    <ThemeableStack
      flexDirection="column"
      {...knobProps.gap}
      {...motion}
      testID="table-cards"
      data-animation={animationAttr(knobProps.transition)}
      {...viewProps}>
      {caption != null &&
        (isBareTextChild(caption) ? (
          <SizableText
            fontSize={asToken<FontSizeTokens>(knobProps.sizeToken)}
            color="$color10">
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
            data-table-zebra={stripe}>
            {row.cells.map((cell, index) => {
              const label = headerLabels[index];
              return (
                <ThemeableStack
                  key={cell.key}
                  flexDirection="row"
                  alignItems="center"
                  gap="$2"
                  paddingVertical="$1.5">
                  {label != null && (
                    <SizableText
                      fontSize={asToken<FontSizeTokens>(knobProps.sizeToken)}
                      fontWeight="500"
                      color={knobProps.textAccentColor}
                      width="40%"
                      flexShrink={0}>
                      {label}
                    </SizableText>
                  )}
                  <ThemeableStack
                    flex={1}
                    minWidth={0}>
                    <TableCellSurface isHeader={false}>{cell.content}</TableCellSurface>
                  </ThemeableStack>
                </ThemeableStack>
              );
            })}
          </ThemeableStack>
        );
        return row.intent ? (
          <Theme
            key={row.key}
            name={row.intent}>
            {card}
          </Theme>
        ) : (
          card
        );
      })}
    </ThemeableStack>
  );
};

export interface ThemedTableProps extends React.ComponentProps<typeof TableComp> {
  /** Responsive layout — see {@link TableLayout}. Default `table`. */
  layout?: TableLayout;
}

// Themed wrappers that inject resolved knob recipes
const ThemedTableComp = ({ layout = 'table', ...props }: ThemedTableProps) => {
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
        cellHeight={asToken<SizeTokens>(knobProps.sizeToken)}
        data-animation={animationAttr(knobProps.transition)}
        {...props}
        // borderSpacing 0 neutralizes the real <table> UA default (2px gaps
        // between cells) so the migrated element keeps the div-table look.
        style={[{ tableLayout: 'fixed' as const, borderSpacing: 0 }, props.style]}
      />
    </BodyRowIndexContext.Provider>
  );
};

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
