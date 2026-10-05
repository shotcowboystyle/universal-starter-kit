/**
 * DescriptionList — the READ half of SchemaForm.
 *
 * A schema-driven label–value record summary. Values compose FieldDisplay's
 * 31-face union (never a parallel formatter). Terms share one
 * column capped at the widest `fieldDefaults` purpose width (24ch) so the
 * read/edit flip moves no label. Chromeless by default;
 * the framed variant paints, so it earns the Card inset.
 *
 * House Text (14/25 + body fragment + textAccent) and house Separator
 * (1px `$borderColor`, quiet = opacity 0.5) own the term and the row rule.
 * Forms cannot import `@repo/ui` (that package depends
 * on forms); the recipes are the same measured law.
 */

import { useResolvedKnobs } from '@repo/theme';
import {
  Children,
  isValidElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Text, View, XStack, YStack, isWeb } from 'tamagui';

import { Button } from '../Button';
import { LABEL_COLUMN_MAX_CH, LABEL_COLUMN_WIDTH } from '../fieldDefaults';
import { DescriptionListSlotProvider, FieldDisplay, type FieldDisplayType } from '../FieldDisplay';
import { FORM_GRID_COLLAPSE_WIDTH } from '../FormGrid';
import { formReadableMaxWidth } from '../formSpacing';
import { t } from '../shared/t';

export type DescriptionListPlacement = 'side' | 'top';

export interface DescriptionListItem {
  term: ReactNode;
  /** FieldDisplay type — every typed value mounts FieldDisplay. */
  field?: FieldDisplayType;
  value?: any;
  fieldProps?: Record<string, any>;
  linkedValue?: any;
  /** Opt-in ellipsis for identifier-class values (DG-OVF). */
  truncate?: boolean;
  /** Optional per-row Change action. */
  onChange?: () => void;
  changeLabel?: string;
  /**
   * Escape hatch for a value that is not a FieldDisplay face (CopyField
   * slot). Typed rows must still pass `field` — this is not a formatter.
   */
  children?: ReactNode;
  hidden?: boolean;
}

export type DescriptionListRowProps = DescriptionListItem;

export interface DescriptionListProps {
  items?: DescriptionListItem[];
  children?: ReactNode;
  /**
   * Term placement. Default **side** (the record register). Rides
   * `fieldLabelPlacement` when the knob is `top` | `side`; `floating` does
   * not apply to a read face. Explicit prop ejects.
   */
  placement?: DescriptionListPlacement;
  /** Nested scale — space one stop; type and the 32 action stay. */
  compact?: boolean;
  /** Card frame (paints, so it earns the inset). */
  framed?: boolean;
  /** Same 1px `$borderColor` rule at opacity 0.5 — never a lighter colour. */
  quiet?: boolean;
  /**
   * Cap readable width. Pass `"fluid"` to opt out.
   * Default: {@link formReadableMaxWidth} (560).
   */
  maxWidth?: number | 'fluid';
  /** Eject the shared term column track. Default {@link LABEL_COLUMN_WIDTH}. */
  labelColumnWidth?: string;
  testID?: string;
}

function purposeMaxCh(): number {
  return LABEL_COLUMN_MAX_CH;
}

function labelColumnGridTrack(width: string): string {
  const prefix = 'min(max-content,';
  if (width.startsWith(prefix) && width.endsWith(')')) {
    const inner = width.slice(prefix.length, -1).trim();
    if (inner.endsWith('ch')) {
      return `fit-content(${inner})`;
    }
  }
  return width;
}

function listItemRhythm(density: string) {
  const compact = density === 'compact';
  return {
    compact,
    padV: compact ? '$2' : '$2.5',
    columnGap: compact ? '$2' : '$3',
    stackGap: compact ? 4 : '$2',
    minHeight: compact ? 39 : 45,
  } as const;
}

function resolvePlacement(prop: DescriptionListPlacement | undefined, knobPlacement: string): DescriptionListPlacement {
  if (prop === 'side' || prop === 'top') {
    return prop;
  }
  if (knobPlacement === 'top' || knobPlacement === 'side') {
    return knobPlacement;
  }
  return 'side';
}

function rowHasAction(row: DescriptionListItem): boolean {
  return typeof row.onChange === 'function';
}

function itemsFromChildren(children: ReactNode | undefined): DescriptionListItem[] {
  if (children == null) {
    return [];
  }
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) {
      return [];
    }
    const props = child.props as DescriptionListItem;
    if (props.hidden) {
      return [];
    }
    if (props.term == null) {
      return [];
    }
    return [props];
  });
}

/** House Separator recipe — 1px filled `$borderColor`. */
function ListRule({ quiet }: { quiet?: boolean }) {
  return (
    <View
      role="separator"
      data-mpo-description-list-rule=""
      height={1}
      backgroundColor="$borderColor"
      opacity={quiet ? 0.5 : 1}
      alignSelf="stretch"
      flexGrow={0}
      flexShrink={0}
      width="100%"
      {...(isWeb ? { style: { gridColumn: '1 / -1' } as CSSProperties } : undefined)}
    />
  );
}

function TermText({ children }: { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      data-mpo-description-list-term=""
      fontSize={14}
      lineHeight={25}
      {...knobProps.body}
      color="$color11"
      minWidth={0}
      // `overflowWrap` is not a tamagui style prop; passed as one it reaches
      // the DOM host as an unknown React prop. Web takes it through `style`.
      {...(isWeb ? { style: { overflowWrap: 'break-word' } } : undefined)}>
      {children}
    </Text>
  );
}

function ChangeAction({ onChange, label }: { onChange: () => void; label?: string }) {
  return (
    <View data-mpo-description-list-action="" alignItems="flex-start" justifyContent="flex-end">
      <Button nested outlined onPress={onChange}>
        {label ?? t('Change')}
      </Button>
    </View>
  );
}

function ValueSlot({ row }: { row: DescriptionListItem }) {
  return (
    <View data-mpo-description-list-value="" minWidth={0} width="100%">
      {row.children != null ? (
        row.children
      ) : (
        <FieldDisplay
          field={row.field ?? 'input'}
          value={row.value}
          fieldProps={row.fieldProps}
          linkedValue={row.linkedValue}
          chromeless
          align="left"
          truncate={row.truncate}
        />
      )}
    </View>
  );
}

function DescriptionListRowView({
  row,
  stacked,
  hasActionColumn,
  rhythm,
  showRule,
  quiet,
}: {
  row: DescriptionListItem;
  stacked: boolean;
  hasActionColumn: boolean;
  rhythm: ReturnType<typeof listItemRhythm>;
  showRule: boolean;
  quiet?: boolean;
}) {
  const action = rowHasAction(row) ? (
    <ChangeAction onChange={row.onChange!} label={row.changeLabel} />
  ) : hasActionColumn && isWeb && !stacked ? (
    <View data-mpo-description-list-action="" />
  ) : null;

  const rowStyle: CSSProperties | undefined = isWeb
    ? stacked
      ? {
          display: 'grid',
          gridTemplateColumns: hasActionColumn ? 'minmax(0,1fr) max-content' : 'minmax(0,1fr)',
          columnGap: undefined,
          rowGap: undefined,
        }
      : {
          display: 'grid',
          gridTemplateColumns: 'subgrid',
          gridColumn: '1 / -1',
        }
    : undefined;

  const termStyle: CSSProperties | undefined = isWeb
    ? stacked
      ? { gridColumn: '1', gridRow: '1' }
      : undefined
    : undefined;
  const valueStyle: CSSProperties | undefined = isWeb
    ? stacked
      ? { gridColumn: '1 / -1', gridRow: '2' }
      : undefined
    : undefined;
  const actionStyle: CSSProperties | undefined = isWeb
    ? stacked
      ? { gridColumn: '2', gridRow: '1', justifySelf: 'end' }
      : { justifySelf: 'end' }
    : undefined;

  const body = stacked ? (
    <>
      <View style={termStyle}>
        <TermText>{row.term}</TermText>
      </View>
      {action ? <View style={actionStyle}>{action}</View> : null}
      <View style={valueStyle} paddingTop={rhythm.stackGap as never}>
        <ValueSlot row={row} />
      </View>
    </>
  ) : isWeb ? (
    <>
      <View style={termStyle}>
        <TermText>{row.term}</TermText>
      </View>
      <View style={valueStyle}>
        <ValueSlot row={row} />
      </View>
      {action ? <View style={actionStyle}>{action}</View> : null}
    </>
  ) : (
    <XStack alignItems="flex-start" width="100%" gap={rhythm.columnGap as never}>
      <View
        minWidth={0}
        maxWidth={`${purposeMaxCh()}ch` as never}
        flexShrink={0}
        width={`${purposeMaxCh()}ch` as never}>
        <TermText>{row.term}</TermText>
      </View>
      <View flex={1} minWidth={0}>
        <ValueSlot row={row} />
      </View>
      {action}
    </XStack>
  );

  return (
    <>
      {showRule ? <ListRule quiet={quiet} /> : null}
      <YStack
        data-mpo-description-list-row=""
        data-has-change={rowHasAction(row) ? 'true' : 'false'}
        paddingVertical={rhythm.padV as never}
        minHeight={rhythm.minHeight}
        columnGap={rhythm.columnGap as never}
        width="100%"
        minWidth={0}
        style={rowStyle}>
        {body}
      </YStack>
    </>
  );
}

function DescriptionListWeb({
  rows,
  stacked,
  hasAction,
  rhythm,
  quiet,
  labelColumnWidth,
  density,
  size,
  placement,
  framed,
}: {
  rows: DescriptionListItem[];
  stacked: boolean;
  hasAction: boolean;
  rhythm: ReturnType<typeof listItemRhythm>;
  quiet?: boolean;
  labelColumnWidth: string;
  density: string;
  size: string;
  placement: DescriptionListPlacement;
  framed: boolean;
}) {
  // Write tracks after commit: React's style setter (and invalid `min()`
  // track syntax) otherwise leave a one-column computed grid.
  const columns = stacked
    ? undefined
    : hasAction
      ? `${labelColumnGridTrack(labelColumnWidth)} minmax(0, 1fr) max-content`
      : `${labelColumnGridTrack(labelColumnWidth)} minmax(0, 1fr)`;
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) {
      return;
    }
    if (columns) {
      el.style.setProperty('grid-template-columns', columns);
    } else {
      el.style.removeProperty('grid-template-columns');
    }
  }, [columns]);

  const style: CSSProperties = stacked
    ? { display: 'block', width: '100%', minWidth: 0 }
    : { display: 'grid', width: '100%', minWidth: 0 };

  return (
    <div
      ref={listRef}
      data-mpo-description-list=""
      data-placement={placement}
      data-stacked={stacked ? 'true' : 'false'}
      data-compact={rhythm.compact ? 'true' : 'false'}
      data-framed={framed ? 'true' : 'false'}
      data-quiet={quiet ? 'true' : 'false'}
      data-has-action={hasAction ? 'true' : 'false'}
      data-label-column-width={labelColumnWidth}
      data-density={density}
      data-size={size}
      style={style}>
      {rows.map((row, index) => (
        <DescriptionListRowView
          key={index}
          row={row}
          stacked={stacked}
          hasActionColumn={hasAction}
          rhythm={rhythm}
          showRule={index > 0}
          quiet={quiet}
        />
      ))}
    </div>
  );
}

interface HostLayoutEvent {
  nativeEvent: { layout: { width: number } };
}

function useContainerWide(enabled: boolean): {
  ref: Ref<unknown>;
  wide: boolean;
  onLayout: ((event: HostLayoutEvent) => void) | undefined;
} {
  const ref = useRef<HTMLDivElement>(null);
  // Web assumes wide until measured (desktop stories). Native assumes stacked
  // until onLayout — phones sit under the 480 collapse.
  const [wide, setWide] = useState(isWeb);

  useLayoutEffect(() => {
    if (!isWeb || !enabled) {
      return;
    }
    const el = ref.current;
    if (!el) {
      setWide(true);
      return;
    }

    const update = (width: number) => {
      setWide(width >= FORM_GRID_COLLAPSE_WIDTH);
    };

    update(el.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => {
        update(el.getBoundingClientRect().width);
      };
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
      };
    }

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      update(width);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [enabled]);

  const onLayout =
    !isWeb && enabled
      ? (event: HostLayoutEvent) => {
          setWide(event.nativeEvent.layout.width >= FORM_GRID_COLLAPSE_WIDTH);
        }
      : undefined;

  return { ref, wide, onLayout };
}

export function DescriptionList({
  items,
  children,
  placement: placementProp,
  compact,
  framed = false,
  quiet = false,
  maxWidth = formReadableMaxWidth,
  labelColumnWidth = LABEL_COLUMN_WIDTH,
  testID,
}: DescriptionListProps) {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const placement = resolvePlacement(placementProp, knobProps.fieldLabelPlacement);
  const rhythm = listItemRhythm(knobProps.density);
  const rows = useMemo(() => {
    const fromItems = (items ?? []).filter((row) => !row.hidden);
    if (fromItems.length) {
      return fromItems;
    }
    return itemsFromChildren(children);
  }, [items, children]);
  const hasAction = rows.some(rowHasAction);
  const measureCollapse = placement === 'side';
  const { ref, wide, onLayout } = useContainerWide(measureCollapse);
  const stacked = placement === 'top' || (placement === 'side' && !wide);

  const list = (
    <DescriptionListSlotProvider>
      {isWeb ? (
        <DescriptionListWeb
          rows={rows}
          stacked={stacked}
          hasAction={hasAction}
          rhythm={rhythm}
          quiet={quiet}
          labelColumnWidth={labelColumnWidth}
          density={knobProps.density}
          size={knobProps.size}
          placement={placement}
          framed={framed}
        />
      ) : (
        <YStack
          data-mpo-description-list=""
          data-placement={placement}
          data-stacked={stacked ? 'true' : 'false'}
          data-compact={rhythm.compact ? 'true' : 'false'}
          data-framed={framed ? 'true' : 'false'}
          data-quiet={quiet ? 'true' : 'false'}
          data-has-action={hasAction ? 'true' : 'false'}
          data-label-column-width={labelColumnWidth}
          data-density={knobProps.density}
          data-size={knobProps.size}
          width="100%"
          minWidth={0}>
          {rows.map((row, index) => (
            <DescriptionListRowView
              key={index}
              row={row}
              stacked={stacked}
              hasActionColumn={hasAction}
              rhythm={rhythm}
              showRule={index > 0}
              quiet={quiet}
            />
          ))}
        </YStack>
      )}
    </DescriptionListSlotProvider>
  );

  const widthProps = {
    width: '100%' as const,
    maxWidth: maxWidth === 'fluid' ? undefined : maxWidth,
    alignSelf: maxWidth === 'fluid' ? undefined : ('flex-start' as const),
  };

  return (
    <YStack
      ref={ref as never}
      data-mpo-description-list-host=""
      data-testid={testID}
      onLayout={onLayout}
      minWidth={0}
      {...widthProps}
      {...(framed
        ? {
            backgroundColor: '$color3',
            borderWidth: 1,
            borderColor: '$color5',
            ...knobProps.containerRadius,
            ...knobProps.panelPadding,
          }
        : undefined)}>
      {list}
    </YStack>
  );
}

export function DescriptionListRow(_props: DescriptionListRowProps): ReactElement | null {
  return null;
}

DescriptionList.Row = DescriptionListRow;

/** Alias — Ant / Cloudscape "PropertyList" name. */
export const PropertyList = DescriptionList;
