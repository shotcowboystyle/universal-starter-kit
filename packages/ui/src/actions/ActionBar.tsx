/**
 * One primary per region; trailing default for dialogs/toolbars.
 * The cancel slot never renders disabled (disabled is stripped + DEV warn).
 * Inside a dialog region, more than 2 actions DEV-warns unless
 * `allowManyActions` ejects.
 *
 * Slots keep primary singular by construction. Free `children` are scanned in DEV
 * for `[data-mp-action-role="primary"]` / accent markers (two-primaries warn).
 */

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { XStack, type GetProps } from 'tamagui';

import { countActionsInTree } from '../shared/actionScan';
import { useIsInDialogRegion } from '../surfaces';

import { actionDevWarn, warnCancelDisabled, warnDialogTooManyActions } from './devWarn';

export type ActionBarAlign = 'start' | 'end' | 'between';

export type ActionBarProps = Omit<GetProps<typeof XStack>, 'children'> & {
  /** Singular primary action (filled / accent). */
  primary?: ReactNode;
  /** Secondary actions (outlined / chromeless). */
  secondary?: ReactNode | ReactNode[];
  /** Cancel / dismiss — never danger tone. */
  cancel?: ReactNode;
  /** Free composition; DEV-counted for extra primaries. */
  children?: ReactNode;
  /** Trailing default (dialogs/toolbars); `start` for page-level forms. */
  align?: ActionBarAlign;
  /**
   * Eject — acknowledges more than 2 actions in a dialog action
   * row and silences the `dialog-too-many-actions` DEV warn. Has no effect
   * outside dialog regions (page-level bars are not capped).
   */
  allowManyActions?: boolean;
  /** Stable id for DEV warn dedupe. */
  id?: string;
};

const ALIGN_JUSTIFY: Record<ActionBarAlign, GetProps<typeof XStack>['justifyContent']> = {
  start: 'flex-start',
  end: 'flex-end',
  between: 'space-between',
};

function asArray(node: ReactNode | ReactNode[] | undefined): ReactNode[] {
  if (node == null || node === false) {
    return [];
  }
  return Array.isArray(node) ? node : [node];
}

function elementLooksPrimary(node: ReactNode): boolean {
  if (!isValidElement(node)) {
    return false;
  }
  const props = node.props as Record<string, unknown>;
  if (props['data-mp-action-role'] === 'primary') {
    return true;
  }
  if (props.actionRole === 'primary') {
    return true;
  }
  if (props.accent === true) {
    return true;
  }
  return false;
}

function countPrimariesInTree(nodes: ReactNode): number {
  let count = 0;
  Children.forEach(nodes, (child) => {
    if (elementLooksPrimary(child)) {
      count += 1;
    }
    if (isValidElement(child)) {
      const kids = (child.props as { children?: ReactNode }).children;
      if (kids != null) {
        count += countPrimariesInTree(kids);
      }
    }
  });
  return count;
}

function nodeRendersDisabled(node: ReactNode): boolean {
  if (!isValidElement(node)) {
    return false;
  }
  const props = node.props as Record<string, unknown>;
  return props.disabled === true || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
}

export function ActionBar({
  primary,
  secondary,
  cancel,
  children,
  align = 'end',
  allowManyActions = false,
  id: idProp,
  gap = '$2',
  ...stackProps
}: ActionBarProps) {
  const reactId = useId();
  const regionId = idProp ?? reactId;
  const rootRef = useRef<HTMLElement | null>(null);
  const inDialogRegion = useIsInDialogRegion();

  const secondaryItems = asArray(secondary);
  const hasSlots = primary != null || secondaryItems.length > 0 || cancel != null;

  // The cancel/dismiss slot never renders disabled. Strip the
  // prop (top-level slot elements) and DEV-warn `cancel-disabled`.
  let cancelDisabledStripped = false;
  const cancelItems =
    cancel == null || cancel === false
      ? null
      : Children.map(cancel, (node) => {
          if (!nodeRendersDisabled(node)) {
            return node;
          }
          cancelDisabledStripped = true;
          return cloneElement(
            node as ReactElement,
            {
              disabled: undefined,
              'aria-disabled': undefined,
              'data-mp-cancel-disabled-ignored': 'true',
            } as never,
          );
        });

  useEffect(() => {
    let total = 0;
    if (primary != null) {
      total += 1;
    }
    // Slot primary is singular; also count free children + accidental accent in secondary/cancel.
    total += countPrimariesInTree(children);
    total += countPrimariesInTree(secondary);
    total += countPrimariesInTree(cancel);

    if (total > 1) {
      actionDevWarn('two-primaries', {
        component: 'ActionBar',
        id: regionId,
        count: total,
      });
    }

    if (cancelDisabledStripped) {
      warnCancelDisabled({ disabled: true, component: 'ActionBar', id: regionId });
    }

    // Dialog action rows cap at 2 actions (cancel counts). Slots
    // count by construction; free children are counted heuristically.
    if (inDialogRegion) {
      const actionTotal =
        (primary != null ? 1 : 0) +
        secondaryItems.filter((node) => node != null && node !== false).length +
        (cancel != null && cancel !== false ? 1 : 0) +
        countActionsInTree(children);
      warnDialogTooManyActions({
        count: actionTotal,
        allowManyActions,
        component: 'ActionBar',
        id: regionId,
      });
    }

    // DOM fallback for composed markup that set data attrs without React props.
    const el = rootRef.current;
    if (el && typeof el.querySelectorAll === 'function') {
      const domCount = el.querySelectorAll('[data-mp-action-role="primary"]').length;
      if (domCount > 1) {
        actionDevWarn('two-primaries', {
          component: 'ActionBar',
          id: `${regionId}:dom`,
          count: domCount,
        });
      }
    }
  }, [allowManyActions, cancel, cancelDisabledStripped, children, inDialogRegion, primary, regionId, secondary]);

  return (
    <XStack
      ref={rootRef as never}
      data-mp-action-bar={regionId}
      gap={gap}
      flexWrap="wrap"
      alignItems="center"
      justifyContent={ALIGN_JUSTIFY[align]}
      width="100%"
      {...stackProps}>
      {/* `secondaryItems` is a plain array (asArray), so rendering it bare made
          React warn "Each child in a list should have a unique key" and name
          the CALLER — the screen that passed a single element into the slot —
          instead of this file. Key it here, where the array is built. */}
      {hasSlots ? (
        <>
          {cancelItems}
          {secondaryItems.map((node, index) => (
            <Fragment key={`mp-action-secondary-${index}`}>{node}</Fragment>
          ))}
          {primary}
        </>
      ) : null}
      {children}
    </XStack>
  );
}
