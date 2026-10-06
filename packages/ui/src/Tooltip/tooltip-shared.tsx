/**
 * Shared Tooltip recipes, content chrome, and text wrapping.
 * Platform twins (index.tsx web / index.native.tsx) own open/close.
 */

import { warnTooltipOnDisabled } from '@repo/theme';
import type { ReactNode } from 'react';
import React from 'react';
import { Tooltip as TamaguiTooltip, Text, styled } from 'tamagui';
import type { GetProps, SpaceTokens } from 'tamagui';

import { wrapBareTextChildren } from '../shared/text-rides-text';

export interface TooltipProps {
  /** The element that triggers the tooltip */
  children: ReactNode;
  /** The tooltip content - can be a string or ReactNode */
  content: ReactNode;
  /** Placement of the tooltip relative to trigger */
  // oxlint-disable-next-line sonarjs/max-union-size -- closed four-side public API; a named alias would only move the same union
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Delay before showing tooltip in ms. Web: hover warmup (keyboard is
   * immediate). Native: long-press / press-in hold. Defaults differ per
   * platform (300 web, 500 native).
   */
  delay?: number;
  /** Whether the tooltip is disabled */
  disabled?: boolean;
  /** Controlled open. Omit for hover/focus (web) or long-press (native). */
  open?: boolean;
  /** Fired whenever open changes (controlled or internal). */
  onOpenChange?: (open: boolean) => void;
}

export interface TooltipSizeRecipe {
  maxWidth: number;
}

export const tooltipSizeRecipes: Record<'small' | 'medium' | 'large', TooltipSizeRecipe> = {
  small: { maxWidth: 160 },
  medium: { maxWidth: 250 },
  large: { maxWidth: 320 },
};

export interface TooltipPadRecipe {
  paddingHorizontal: SpaceTokens;
  paddingVertical: SpaceTokens;
}

export const tooltipPadRecipes: Record<'small' | 'medium' | 'large', TooltipPadRecipe> = {
  small: { paddingHorizontal: '$1.5', paddingVertical: '$1' },
  medium: { paddingHorizontal: '$2', paddingVertical: '$1.5' },
  large: { paddingHorizontal: '$3', paddingVertical: '$2' },
};

/** Spectrum container padding so the bubble stays inside the viewport. */
export const TOOLTIP_COLLISION_PADDING_PX = 8;
/** Radix skipDelayDuration / Spectrum cooldown — next tooltip opens instantly. */
export const TOOLTIP_SKIP_DELAY_MS = 300;
/** Primer/Spectrum hover warmup when not in the skip window. */
export const TOOLTIP_DEFAULT_DELAY_MS = 300;

let tooltipSkipUntil = 0;
const tooltipSkipListeners = new Set<() => void>();

export const noteTooltipClosed = (now = Date.now()): void => {
  tooltipSkipUntil = now + TOOLTIP_SKIP_DELAY_MS;
  for (const listener of tooltipSkipListeners) {
    listener();
  }
};

export const resolveTooltipDelay = (delay: number, now = Date.now()): number => (now < tooltipSkipUntil ? 0 : delay);

const hasOwnKey = <T extends object>(record: T, key: string): key is Extract<keyof T, string> =>
  Object.hasOwn(record, key);

export const resolveTooltipSizeRecipe = (size: string): TooltipSizeRecipe =>
  hasOwnKey(tooltipSizeRecipes, size) ? tooltipSizeRecipes[size] : tooltipSizeRecipes.medium;

export const resolveTooltipPadRecipe = (space: string): TooltipPadRecipe =>
  hasOwnKey(tooltipPadRecipes, space) ? tooltipPadRecipes[space] : tooltipPadRecipes.medium;

/**
 * Test-only reset of the skip window.
 * @internal
 */
// oxlint-disable-next-line sonarjs/function-name, sonarjs/variable-name -- exported test hook; the double-underscore name is consumed by specs and both platform twins
export const __resetTooltipSkipForTests = (): void => {
  tooltipSkipUntil = 0;
};

export const useTooltipSkipDelay = (delay: number): number => {
  const [, bump] = React.useState(0);
  React.useEffect(() => {
    const listener = () => {
      bump((n) => n + 1);
    };
    tooltipSkipListeners.add(listener);
    return () => {
      tooltipSkipListeners.delete(listener);
    };
  }, []);
  return resolveTooltipDelay(delay);
};

export const TooltipContent = styled(TamaguiTooltip.Content, {
  name: 'TooltipContent',
  // Surface, radius, elevation, pad, and type come from knob recipes on
  // the instance. enterStyle/exitStyle need a transition token.
  opacity: 1,
  enterStyle: {
    opacity: 0,
    y: -4,
    scale: 0.96,
  },
  exitStyle: {
    opacity: 0,
    y: -4,
    scale: 0.96,
  },
});

export const TooltipArrow = styled(TamaguiTooltip.Arrow, {
  name: 'TooltipArrow',
  backgroundColor: '$color1',
  borderColor: '$color1',
});

export const TooltipText = styled(Text, {
  name: 'TooltipText',
});

/**
 * The Tooltip content slot (exported for spec). TEXT-RIDES-TEXT: wrap
 * ALL bare string/number content (coalesced runs), not just the singleton
 * case — an array like `{label}{cond ? suffix : ""}` renders web-only and
 * crashes native otherwise.
 */
export const wrapTooltipContent = (content: ReactNode, bodyProps: GetProps<typeof TooltipText>): ReactNode =>
  wrapBareTextChildren(content, (label, key) => (
    <TooltipText
      key={key}
      {...bodyProps}>
      {label}
    </TooltipText>
  ));

export const resolveThemeColor = (
  token: { get?: () => string; val?: string } | undefined,
  fallback: string,
): string => {
  const raw = token?.val ?? token?.get?.() ?? fallback;
  if (raw.startsWith('var(') && typeof document !== 'undefined') {
    const name = raw.slice(4, -1).trim();
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) {
      return value;
    }
  }
  return raw;
};

export const preventTooltipFocus = (event: { preventDefault?: () => void }) => {
  event.preventDefault?.();
};

export interface TooltipTriggerProps {
  disabled?: boolean;
  'aria-disabled'?: boolean | string;
}

/** Tooltips on disabled triggers are not keyboard-reachable; warn in dev. */
export const warnIfTriggerDisabled = (children: ReactNode): void => {
  if (!React.isValidElement<TooltipTriggerProps>(children)) {
    return;
  }
  const childProps = children.props;
  const childDisabled =
    childProps.disabled === true || childProps['aria-disabled'] === true || childProps['aria-disabled'] === 'true';
  warnTooltipOnDisabled({
    component: 'Tooltip',
    childDisabled,
  });
};
