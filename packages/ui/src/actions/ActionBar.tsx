/**
 * One primary per region; trailing default for dialogs/toolbars.
 * The cancel slot never renders disabled (disabled is stripped + DEV warn).
 * Inside a dialog region, more than 2 actions DEV-warns unless
 * `allowManyActions` ejects.
 *
 * Slots keep primary singular by construction. Free `children` are scanned in DEV
 * for `[data-mp-action-role="primary"]` / accent markers (two-primaries warn).
 */

import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { XStack, isWeb } from 'tamagui';
import type { GetProps, TamaguiElement } from 'tamagui';

import { countActionsInTree } from '../shared/action-scan';
import { useIsInDialogRegion } from '../surfaces';

import { actionDevWarn, warnCancelDisabled, warnDialogTooManyActions } from './dev-warn';

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

interface SlotElementProps {
  'data-mp-action-role'?: string;
  actionRole?: string;
  accent?: boolean;
  disabled?: boolean | null;
  'aria-disabled'?: boolean | string | null;
  'data-mp-cancel-disabled-ignored'?: string;
  children?: ReactNode;
}

const asArray = (node: ReactNode | ReactNode[] | undefined): ReactNode[] => {
  if (node == null || node === false) {
    return [];
  }
  return Array.isArray(node) ? node : [node];
};

const elementLooksPrimary = (node: ReactNode): boolean => {
  if (!isValidElement<SlotElementProps>(node)) {
    return false;
  }
  const { props } = node;
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
};

const countPrimariesInTree = (nodes: ReactNode): number => {
  let count = 0;
  // oxlint-disable-next-line react/no-react-children -- walking arbitrary slot children for primary actions has no non-Children equivalent
  for (const child of Children.toArray(nodes)) {
    if (elementLooksPrimary(child)) {
      count += 1;
    }
    if (isValidElement<SlotElementProps>(child)) {
      const kids = child.props.children;
      if (kids != null) {
        count += countPrimariesInTree(kids);
      }
    }
  }
  return count;
};

const nodeRendersDisabled = (node: ReactNode): boolean => {
  if (!isValidElement<SlotElementProps>(node)) {
    return false;
  }
  const { props } = node;
  return props.disabled === true || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
};

export const ActionBar = ({
  primary,
  secondary,
  cancel,
  children,
  align = 'end',
  allowManyActions = false,
  id: idProp,
  gap = '$2',
  ...stackProps
}: ActionBarProps) => {
  const reactId = useId();
  const regionId = idProp ?? reactId;
  const rootRef = useRef<TamaguiElement | null>(null);
  const inDialogRegion = useIsInDialogRegion();

  const secondaryItems = asArray(secondary);
  const hasSlots = primary != null || secondaryItems.length > 0 || cancel != null;

  // The cancel/dismiss slot never renders disabled. Strip the
  // prop (top-level slot elements) and DEV-warn `cancel-disabled`.
  let cancelDisabledStripped = false;
  const cancelItems =
    cancel == null || cancel === false
      ? null
      : // oxlint-disable-next-line react/no-react-children -- cancel slot may be a single element or array; Children.map handles both with stable keys
        Children.map(cancel, (node): ReactNode => {
          if (!isValidElement<SlotElementProps>(node) || !nodeRendersDisabled(node)) {
            return node;
          }
          cancelDisabledStripped = true;
          // oxlint-disable-next-line react/no-clone-element -- the slot element is caller-provided; stripping its disabled props is the contract
          return cloneElement(node, {
            disabled: null,
            'aria-disabled': null,
            'data-mp-cancel-disabled-ignored': 'true',
          });
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
        (primary == null ? 0 : 1) +
        asArray(secondary).filter((node) => node != null && node !== false).length +
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
    if (isWeb && el != null && el instanceof HTMLElement) {
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
      ref={rootRef}
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
};
