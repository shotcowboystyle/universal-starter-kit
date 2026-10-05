/**
 * House Dialog and AlertDialog: the tamagui roots with their close parts named
 * by what they show.
 *
 * tamagui 2.7's Dialog.Close sets `aria-label="Dialog Close"` and asChild
 * merges it onto the child, so `<Dialog.Close asChild><Button>Cancel</Button>`
 * was announced "Dialog Close", in English, in every locale. AlertDialog's
 * Cancel, Action and Destructive render the same Close. A visible label that
 * is not in the accessible name fails WCAG 2.5.3.
 *
 * Here a close part with text (its own, or its asChild child's) is named by
 * that text. One with no text and no label of its own, an icon-only X, gets
 * the catalog's localized "Close". An explicit label on the part or on its
 * child still wins. Every other part is the tamagui one.
 */
import { isValidElement, type ComponentType, type ReactNode } from 'react';
import {
  AlertDialog as TamaguiAlertDialog,
  Dialog as TamaguiDialog,
  withStaticProperties,
  type GetProps,
} from 'tamagui';

import { useTranslation } from './shared/i18n';

interface Labelled {
  'aria-label'?: unknown;
  'aria-labelledby'?: unknown;
  accessibilityLabel?: unknown;
}

function hasText(node: ReactNode): boolean {
  if (typeof node === 'string') {
    return node.trim().length > 0;
  }
  if (typeof node === 'number' || typeof node === 'bigint') {
    return true;
  }
  if (Array.isArray(node)) {
    return node.some(hasText);
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return hasText(node.props.children);
  }
  return false;
}

function isLabelled(props: Labelled): boolean {
  return props['aria-label'] != null || props['aria-labelledby'] != null || props.accessibilityLabel != null;
}

function needsCloseName(props: Labelled & { asChild?: unknown; children?: ReactNode }): boolean {
  if (isLabelled(props)) {
    return false;
  }
  const { asChild, children } = props;
  if (asChild && isValidElement<Labelled & { children?: ReactNode }>(children)) {
    return !isLabelled(children.props) && !hasText(children.props.children);
  }
  return !hasText(children);
}

function namedByContent<C extends ComponentType<any>>(Part: C, displayName: string) {
  const Raw = Part as ComponentType<any>;

  function LocalizedClose(props: GetProps<C>) {
    const { t } = useTranslation();
    return <Raw aria-label={t('Close')} {...props} />;
  }

  function Close(props: GetProps<C>) {
    if (needsCloseName(props)) {
      return <LocalizedClose {...props} />;
    }
    return <Raw aria-label={undefined} {...props} />;
  }
  Close.displayName = displayName;
  return Close;
}

export const Dialog: typeof TamaguiDialog = withStaticProperties(TamaguiDialog, {
  Close: namedByContent(TamaguiDialog.Close, 'DialogClose'),
});

export const AlertDialog: typeof TamaguiAlertDialog = withStaticProperties(TamaguiAlertDialog, {
  Cancel: namedByContent(TamaguiAlertDialog.Cancel, 'AlertDialogCancel'),
  Action: namedByContent(TamaguiAlertDialog.Action, 'AlertDialogAction'),
  Destructive: namedByContent(TamaguiAlertDialog.Destructive, 'AlertDialogDestructive'),
});
