/**
 * Breadcrumbs — wayfinding trail (Polaris / Primer / GOV.UK).
 *
 * Landmark `<nav>` + ordered list; last crumb is the current page
 * (`aria-current="page"`, not a link). Separators stay the RTL-neutral `/`,
 * `aria-hidden` (the list already names the trail), and T-HELPER ink via
 * `knobProps.textAccentColor` — not `componentColors.text.subtle` ($color8),
 * which measured 1.89:1 / 2.21:1 against the 4.5 floor. Distinct from
 * the outlined intent `$color11` on the warning surface.
 * Keyboard ring on each link (and the overflow control), never the
 * trail container. Tight chromeless trail.
 * Crumb `minHeight` is a Vocabulary `pin` at 44, not a size `floor`.
 */

import {
  MIN_PRESS_TARGET,
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  useAccentOnSurface,
  useResolvedKnobs,
} from '@repo/theme';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Anchor, Text, XStack, isWeb } from 'tamagui';
import type { XStackProps } from 'tamagui';

import { withInterp } from '../shared/t';

/** Approx medium body line box before press-target padding. */
const CRUMB_LINE_PX = 24;

const RING = ensureFocusVisibleRing();
const webListReset = isWeb ? { style: { listStyle: 'none' as const } } : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate?: (href: string) => void;
  /** Landmark name. Defaults to "Breadcrumb" (GOV.UK / WAI-ARIA APG). */
  label?: string;
  /**
   * Collapse middle crumbs into a "…" control when the trail is longer
   * (Polaris / Primer overflow menu; GOV.UK collapse-on-mobile). Unset = wrap.
   */
  maxVisible?: number;
}

type CrumbSlot =
  | { kind: 'item'; item: BreadcrumbItem; index: number; isCurrent: boolean }
  | { kind: 'overflow'; hidden: { item: BreadcrumbItem; index: number }[] };

const crumbTextSize = (sizeToken: string) => {
  if (sizeToken === '$3') {
    return '$2' as const;
  }
  return sizeToken === '$5' ? ('$4' as const) : ('$3' as const);
};

const crumbSeparatorSize = (sizeToken: string) => {
  if (sizeToken === '$3') {
    return '$1' as const;
  }
  return sizeToken === '$5' ? ('$3' as const) : ('$2' as const);
};

const crumbTrailGap = (spaceGap: string | number | undefined) => {
  if (spaceGap === '$2') {
    return '$1' as const;
  }
  return spaceGap === '$5' ? ('$2' as const) : ('$1.5' as const);
};

const collapseSlots = (items: BreadcrumbItem[], maxVisible: number | undefined, expanded: boolean): CrumbSlot[] => {
  const asItems = (): CrumbSlot[] =>
    items.map((item, index) => ({
      kind: 'item' as const,
      item,
      index,
      isCurrent: index === items.length - 1,
    }));

  if (maxVisible === undefined || maxVisible === 0 || expanded || items.length <= maxVisible) {
    return asItems();
  }

  const tailCount = Math.max(1, maxVisible - 2);
  const hiddenStart = 1;
  const hiddenEnd = items.length - tailCount;
  if (hiddenEnd <= hiddenStart) {
    return asItems();
  }

  const slots: CrumbSlot[] = [
    { kind: 'item', item: items[0], index: 0, isCurrent: false },
    {
      kind: 'overflow',
      hidden: items.slice(hiddenStart, hiddenEnd).map((item, offset) => ({
        item,
        index: hiddenStart + offset,
      })),
    },
  ];
  for (let i = hiddenEnd; i < items.length; i += 1) {
    slots.push({
      kind: 'item',
      item: items[i],
      index: i,
      isCurrent: i === items.length - 1,
    });
  }
  return slots;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Breadcrumbs = ({ items, onNavigate, label, maxVisible }: BreadcrumbsProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Breadcrumbs' });
  // UX-P04 / Axiom 12: crumb links are accent-hued text on the PAGE, so they
  // need the page-readable accent — `$accentColor` (the on-fill foreground)
  // measured 1.94:1 as a dark-scheme link on the page.
  const linkColor = useAccentOnSurface();
  const [expanded, setExpanded] = useState(false);
  const landmark = label ?? t('Breadcrumb');

  const slots = useMemo(() => collapseSlots(items, maxVisible, expanded), [items, maxVisible, expanded]);

  if (items.length === 0) {
    return null;
  }

  const sz = knobProps.sizeToken;
  const textSize = crumbTextSize(sz);
  const separatorSize = crumbSeparatorSize(sz);
  // Tight trail: crumbs hug the "/" separators so the path reads as one unit.
  // The space knob still scales the gap, but from a tight base — not the
  // panel-level knobProps.gap (which is sized for stacked layout sections).
  // Spec: separators are T-HELPER (`textAccentColor`), never the $color8
  // `text.subtle` ramp that fails AA on the page.
  const trailGap = crumbTrailGap(knobProps.gap.gap);
  // Vertical pad only (theme-propagation SP-FIXED): grow
  // the clickable box to ≥44 without horizontal padding that would re-spread
  // the trail. No minWidth floor — the ring must hug the link, not a 44px well.
  // Height is PINNED at MIN_PRESS_TARGET across size stops (font still remaps).
  // That is Vocabulary `pin (forced: WCAG 2.5.5)`, not `floor`. Do not raise
  // the box at large — lettered in docs/design/letters/breadcrumbs-size-pin.md.
  const crumbPadY = Math.max(0, Math.ceil((MIN_PRESS_TARGET - CRUMB_LINE_PX) / 2));
  const crumbRadius = knobProps.borderRadius.borderRadius;

  const interactiveCrumb = {
    ...knobProps.body,
    fontWeight: '400' as const,
    color: linkColor,
    cursor: 'pointer' as const,
    fontSize: textSize,
    // Crumbs are R-SCALE: the interactive surface (focus ring) rounds with
    // the radius knob. Chromeless trail keeps no border.
    borderRadius: crumbRadius,
    paddingVertical: crumbPadY,
    marginVertical: -crumbPadY,
    minHeight: MIN_PRESS_TARGET,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    hitSlop: pressTargetHitSlop(CRUMB_LINE_PX),
    textDecorationLine: 'none' as const,
    hoverStyle: { textDecorationLine: 'underline' as const },
    pressStyle: { opacity: 0.7 },
    // Rest + pointer-origin focus paint no ring. Keyboard ring lives
    // on THIS node (the perceived link), never the nav/ol container.
    outlineWidth: 0,
    focusStyle: { outlineWidth: 0 },
    focusVisibleStyle: RING,
  };

  const navigate = (href: string | undefined, event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (href !== undefined && href !== '') {
      onNavigate?.(href);
    }
  };

  const renderCrumb = (slot: CrumbSlot) => {
    if (slot.kind === 'overflow') {
      return (
        <XStack
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack with `role`; it also maps to the native accessibilityRole, which an intrinsic tag cannot provide
          role="button"
          tabIndex={0}
          aria-label={withInterp(t('Show {{count}} more pages'), {
            count: slot.hidden.length,
          })}
          // interactiveCrumb is link-text styling (shared with the Anchor
          // crumb below). Its hoverStyle underline is a text effect; on
          // web this XStack is a div, so the hover text-decoration reaches
          // the inner "…" Text via inheritance. The RN-flavored Stack type
          // rejects the text hoverStyle, so route it through a cast.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Tamagui forwards these text-style keys on a stack at runtime; only the RN-flavored prop type omits them (the text-only hoverStyle is rejected by the stack prop type but applied at runtime)
          {...(interactiveCrumb as XStackProps)}
          backgroundColor="transparent"
          borderWidth={0}
          paddingHorizontal={0}
          onPress={() => {
            setExpanded(true);
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(true);
            }
          }}>
          <Text
            color={linkColor}
            fontSize={textSize}
            userSelect="none">
            …
          </Text>
        </XStack>
      );
    }
    if (slot.item.href !== undefined && slot.item.href !== '' && !slot.isCurrent) {
      return (
        <Anchor
          {...interactiveCrumb}
          href={slot.item.href}
          onPress={(e) => {
            navigate(slot.item.href, e);
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === ' ') {
              navigate(slot.item.href, e);
            }
          }}>
          {slot.item.label}
        </Anchor>
      );
    }
    return (
      <Text
        {...knobProps.body}
        color={knobProps.textAccentColor}
        fontSize={textSize}
        fontWeight="400"
        {...(slot.isCurrent ? { 'aria-current': 'page' as const } : null)}>
        {slot.item.label}
      </Text>
    );
  };

  const trail = (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack with `role`; it also maps to the native accessibilityRole, which an intrinsic tag cannot provide
      role="list"
      {...webListReset}
      padding={0}
      margin={0}
      gap={trailGap}
      alignItems="center"
      flexWrap="wrap"
      outlineWidth={0}>
      {slots.map((slot, slotIndex) => {
        const isLastSlot = slotIndex === slots.length - 1;
        return (
          <XStack
            key={slot.kind === 'item' ? `${slot.item.label}-${slot.index}` : 'overflow'}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack with `role`; it also maps to the native accessibilityRole, which an intrinsic tag cannot provide
            role="listitem"
            {...webListReset}
            padding={0}
            margin={0}
            gap={trailGap}
            alignItems="center"
            outlineWidth={0}>
            {renderCrumb(slot)}
            {!isLastSlot && (
              <Text
                aria-hidden
                color={knobProps.textAccentColor}
                data-testid="breadcrumb-separator"
                fontSize={separatorSize}
                userSelect="none">
                /
              </Text>
            )}
          </XStack>
        );
      })}
    </XStack>
  );

  // Intrinsic <nav> on web (Tamagui `tag` stays an attribute on RN-web).
  // The landmark is not a control — no tabIndex, no focusWithin ring.
  if (isWeb) {
    return (
      <nav
        aria-label={landmark}
        data-testid="breadcrumbs"
        data-density={knobProps.density}>
        {trail}
      </nav>
    );
  }
  return (
    <XStack
      aria-label={landmark}
      alignItems="center"
      flexWrap="wrap"
      outlineWidth={0}
      data-testid="breadcrumbs"
      data-density={knobProps.density}>
      {trail}
    </XStack>
  );
};
