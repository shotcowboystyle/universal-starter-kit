import { Skeleton } from '@repo/forms';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { useRegisterPageHeading } from '@repo/ui';
import type React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { getTokenValue, H1, H2, H3, H4, Separator, Text, XStack, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

export type HeadingLevel = 1 | 2 | 3 | 4;

export interface HeadingProps extends Omit<YStackProps, 'children'> {
  label: string;
  description?: string;
  /** Alias for description (thin-adapter / fieldRegistry helperText). */
  helperText?: string;
  level?: HeadingLevel;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /**
   * Controlled-ish collapse state: when provided, changes to this value
   * override the internal state (clicks still toggle locally and report via
   * `onCollapseChange`). Used by SchemaForm to apply Frappe's computed
   * section collapse while letting the user toggle manually.
   */
  collapsed?: boolean;
  showSeparator?: boolean;
  children?: React.ReactNode;
  onCollapseChange?: (collapsed: boolean) => void;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
}

// Explicit per-level sizes (matching the default $heading scale: H1 $8 / H2 $6
// / H3 $5 / H4 $4) so the level hierarchy survives headingFont knob switches —
// font-relative size tokens re-resolve against the swapped family's own size
// table (e.g. serif $6 = 16px) and flatten the hierarchy.
const levelFont = {
  1: { fontSize: 32, lineHeight: 42 },
  2: { fontSize: 25, lineHeight: 35 },
  3: { fontSize: 22, lineHeight: 32 },
  4: { fontSize: 20, lineHeight: 30 },
} as const;

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <Text
      fontSize="$3"
      color="$color10"
      aria-hidden>
      {collapsed ? '\u25B6' : '\u25BC'}
    </Text>
  );
}

export function Heading({
  label,
  description,
  helperText,
  level = 2,
  collapsible = false,
  defaultCollapsed = false,
  collapsed,
  showSeparator = true,
  children,
  onCollapseChange,
  readOnly: _readOnly,
  skeleton = false,
  compact = false,
  ...stackProps
}: HeadingProps) {
  const { knobProps } = useResolvedKnobs();
  const [isCollapsed, setIsCollapsed] = useState(collapsed ?? defaultCollapsed);
  useEffect(() => {
    if (collapsed !== undefined) {
      setIsCollapsed(collapsed);
    }
  }, [collapsed]);
  const autoId = useId();
  const resolvedDescription = description ?? helperText;
  const canCollapse = collapsible && !_readOnly;

  // DG-A11Y-02: a level-1 Heading counts toward the page's h1 budget
  // (multiple-h1 DEV warn from the nearest PageHeadingScope).
  useRegisterPageHeading({ level, component: 'Heading', label, enabled: !skeleton });

  // Stable id: exists whether collapsed or expanded, never empty (useId
  // fallback for empty labels), so aria-controls never dangles.
  const labelSlug = label.trim().replaceAll(/\s+/g, '-').toLowerCase();
  const sectionId = `section-${labelSlug || autoId}`;

  const handleToggle = useCallback(() => {
    if (!canCollapse) {
      return;
    }
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapseChange?.(newState);
  }, [canCollapse, isCollapsed, onCollapseChange]);

  const handleKeyDown = useCallback(
    (event: { key?: string; preventDefault?: () => void }) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault?.();
        handleToggle();
      }
    },
    [handleToggle],
  );

  if (skeleton) {
    return (
      <YStack
        {...knobProps.gap}
        {...stackProps}>
        <Skeleton
          variant="text"
          width="45%"
          height={compact ? 18 : 24}
        />
        <Skeleton
          variant="text"
          width="70%"
          height={compact ? 12 : 14}
        />
        {showSeparator && (
          <Skeleton
            variant="rounded"
            width="100%"
            height={sizeRecipeEscape(1, 'separator bone: the 1px rule a Separator draws')}
          />
        )}
      </YStack>
    );
  }

  const HeadingComponent = { 1: H1, 2: H2, 3: H3, 4: H4 }[level];
  // Knob weight wins; 600 is only a fallback. Kept out of the spread and set
  // after the size props so no font-table weight (e.g. Inter's 300) beats it.
  const { fontWeight: knobHeadingWeight, ...knobHeadingFont } = knobProps.heading ?? {};
  const headingFontSize = compact ? Math.max(16, levelFont[level].fontSize - 4) : levelFont[level].fontSize;
  const headingLineHeight = compact ? Math.max(22, levelFont[level].lineHeight - 6) : levelFont[level].lineHeight;

  const headingContent = (
    <XStack
      alignItems="center"
      gap="$2"
      cursor={canCollapse ? 'pointer' : 'default'}
      onPress={handleToggle}
      paddingVertical={compact ? '$1' : '$2'}
      hoverStyle={canCollapse ? { opacity: 0.8 } : undefined}
      role={canCollapse ? 'button' : undefined}
      tabIndex={canCollapse ? 0 : undefined}
      {...(canCollapse ? ({ onKeyDown: handleKeyDown } as any) : {})}
      aria-expanded={canCollapse ? !isCollapsed : undefined}
      aria-controls={canCollapse ? sectionId : undefined}>
      {canCollapse && <ChevronIcon collapsed={isCollapsed} />}
      <HeadingComponent
        {...knobHeadingFont}
        fontSize={headingFontSize}
        lineHeight={headingLineHeight}
        fontWeight={knobHeadingWeight ?? '600'}
        color="$color">
        {label}
      </HeadingComponent>
    </XStack>
  );

  const spacePx = (token: unknown) => Number(getTokenValue(token as Parameters<typeof getTokenValue>[0], 'space')) || 0;
  const descriptionGap = Math.max(0, spacePx(stackProps.gap ?? knobProps.gap.gap) - spacePx('$1'));
  const showDescription = Boolean(resolvedDescription) && !isCollapsed;

  return (
    <YStack
      {...knobProps.gap}
      {...stackProps}>
      <YStack
        gap={descriptionGap}
        paddingBottom={showDescription ? '$1' : undefined}>
        {headingContent}
        {showDescription && (
          <Text
            fontSize={knobProps.sizeToken}
            {...knobProps.body}
            color="$color10"
            paddingInlineStart={canCollapse ? '$6' : undefined}>
            {resolvedDescription}
          </Text>
        )}
      </YStack>
      {showSeparator && (
        <YStack paddingVertical={compact ? '$0.5' : '$1'}>
          <Separator backgroundColor="$color5" />
        </YStack>
      )}
      {collapsible ? (
        // Always mounted so the aria-controls target exists while collapsed
        // (and on sections with no children).
        <YStack
          id={sectionId}
          display={isCollapsed ? 'none' : 'flex'}
          {...knobProps.gap}
          paddingInlineStart="$4">
          {children}
        </YStack>
      ) : (
        children && <YStack {...knobProps.gap}>{children}</YStack>
      )}
    </YStack>
  );
}
