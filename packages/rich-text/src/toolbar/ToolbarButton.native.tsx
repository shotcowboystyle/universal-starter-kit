/**
 * Native toolbar button — avoids Tooltip (from @repo/ui)
 * and CaretDownIcon (from @phosphor-icons/react) which pull in web-only code.
 */

import { Button } from '@repo/forms';
import type { ReactNode } from 'react';
import type { SizeTokens } from 'tamagui';
import { Text, XStack } from 'tamagui';

import { RichEditorContext } from '../context';

// ===========================================================================
// Types
// ===========================================================================

export interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  'aria-label': string;
  /** Marks the button as a toggle; reflects the pressed state to AT */
  'aria-pressed'?: boolean;
  tooltip?: string;
  size?: SizeTokens;
  compact?: boolean;
}

export interface ToolbarDropdownButtonProps {
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  'aria-label': string;
  size?: SizeTokens;
  compact?: boolean;
}

// ===========================================================================
// ToolbarButton
// ===========================================================================

export function ToolbarButton({
  active,
  disabled,
  onPress,
  children,
  size: sizeProp,
  compact: compactProp,
  'aria-pressed': ariaPressed,
  ...props
}: ToolbarButtonProps) {
  const ctx = RichEditorContext.useStyledContext();
  const size = sizeProp ?? (ctx.size as SizeTokens);
  const compact = compactProp ?? ctx.compact;
  const isDisabled = disabled ?? ctx.disabled;
  const pressed = ariaPressed ?? (active === undefined ? undefined : !!active);

  return (
    <Button
      chromeless
      size={size}
      compact={compact}
      // DG-ST-03: aria-disabled explain, mirroring ToolbarButton.tsx —
      // focusable, state announced, press swallowed, chrome dimmed.
      aria-disabled={isDisabled || undefined}
      onPress={isDisabled ? undefined : onPress}
      opacity={isDisabled ? 0.5 : 1}
      paddingHorizontal="$2"
      {...(pressed === undefined ? undefined : { 'aria-pressed': pressed })}
      {...(active ? { theme: 'active' } : undefined)}
      {...props}>
      {children}
    </Button>
  );
}

// ===========================================================================
// ToolbarDropdownButton
// ===========================================================================

export function ToolbarDropdownButton({
  active,
  disabled,
  onPress,
  children,
  size: sizeProp,
  compact: compactProp,
  ...props
}: ToolbarDropdownButtonProps) {
  const ctx = RichEditorContext.useStyledContext();
  const size = sizeProp ?? (ctx.size as SizeTokens);
  const compact = compactProp ?? ctx.compact;
  const isDisabled = disabled ?? ctx.disabled;

  return (
    <Button
      chromeless
      size={size}
      compact={compact}
      // DG-ST-03: aria-disabled explain (see ToolbarButton above).
      aria-disabled={isDisabled || undefined}
      onPress={isDisabled ? undefined : onPress}
      opacity={isDisabled ? 0.5 : 1}
      {...(active ? { theme: 'active' } : undefined)}
      {...props}>
      <XStack
        alignItems="center"
        gap="$1">
        {children}
        <Text fontSize={10}>▼</Text>
      </XStack>
    </Button>
  );
}
