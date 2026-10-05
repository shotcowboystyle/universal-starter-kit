import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, XIcon } from '@phosphor-icons/react';
import {
  Intent,
  type KnobProps,
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  pressTargetHitSlop,
  pressTargetStyle,
  useResolvedKnobs,
  warnBannedErrorWords,
} from '@repo/theme';
import { useId, useState, type ReactNode } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, View, XStack, YStack, isWeb, styled, useTheme } from 'tamagui';

import { useTranslation } from '../shared/i18n';

// ── Types ─────────────────────────────────────────────────────

export type AlertIntent = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends Omit<GetProps<typeof AlertFrame>, 'role' | 'children'> {
  /** Semantic intent. info rides the accent hue; the rest use the semantic ramp. */
  intent?: AlertIntent;
  /** Bold first line. */
  title?: ReactNode;
  /** Description content below (or instead of) the title. */
  children?: ReactNode;
  /** Override the intent icon; pass null to hide it. */
  icon?: ReactNode | null;
  /** Custom trailing action slot (any node; Buttons inherit the intent and render solid). */
  action?: ReactNode;
  /** Convenience action button label (nested-scale ghost control, 44px press floor). */
  actionLabel?: string;
  /** Press handler for the convenience action button. */
  onAction?: () => void;
  /** Custom secondary action slot (Primer/Polaris: at most two actions). */
  secondaryAction?: ReactNode;
  /** Convenience secondary action label. */
  secondaryActionLabel?: string;
  /** Press handler for the convenience secondary action. */
  onSecondaryAction?: () => void;
  /** Show a dismiss (X) button. */
  dismissible?: boolean;
  /** Called when the dismiss button is pressed. */
  onDismiss?: () => void;
  /** Controlled visibility. */
  visible?: boolean;
  /** Uncontrolled initial visibility (default true). */
  defaultVisible?: boolean;
  /** Tighter padding/type for dense layouts (density compact + nested-scale). */
  compact?: boolean;
}

// ── Intent mappings ───────────────────────────────────────────

// info rides the accent sub-theme so the whole family (Alert surface + any
// Button inside) stays on the one unified emphasis system (SB-E-01).
const intentThemeMap: Record<AlertIntent, 'accent' | 'error' | 'warning' | 'success'> = {
  info: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const intentIconMap: Record<AlertIntent, typeof InfoIcon> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: XCircleIcon,
};

// ── Styled components ─────────────────────────────────────────

const AlertFrame = styled(XStack, {
  name: 'Alert',
  width: '100%',
  alignItems: 'flex-start',
  // Hue tint from the active intent sub-theme: step-3 surface with a step-6
  // border keeps step-11/12 text AA-readable in both schemes.
  backgroundColor: '$color3',
  borderColor: '$color6',
});

// Press-floor: the dismiss glyph paints ~20×20 (16px icon +
// $1 padding) but the press target is floored at 44 via the house
// pressTarget* channel (grown transparent box + negative outset + hitSlop —
// same anatomy as Chip dismiss / ColumnHeaderFilter).
const DISMISS_ICON = 16;
const DISMISS_ICON_COMPACT = 14;
const DISMISS_RING_INSET = 4;
const DISMISS_RING_INSET_COMPACT = 2;
// With a trailing action button in the same row the full horizontal outset
// would overlap the action's press target (overlapping targets are their own
// defect) — cap at less than half the row gap ($3 = 13px). Kept
// symmetric so the glyph never shifts; the width is pitch-limited by design.
const DISMISS_ADJACENT_OUTSET = 6;

// This box is the grown transparent press
// target — it stays UNPAINTED in every state, hover included. Painting it
// was the flagged defect: the hover fill spread across the full 44px floor
// (and past the alert's padding via the negative outsets) instead of
// reading as dismiss feedback. Floor-wide feedback here is subtree opacity
// only (Chip dismiss anatomy).
const DismissButton = styled(View, {
  name: 'AlertDismiss',
  role: 'button',
  tabIndex: 0,
  cursor: 'pointer',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderWidth: 0,
  backgroundColor: 'transparent',
  borderRadius: '$2',
  opacity: 0.7,
  outlineWidth: 0,
  hoverStyle: {
    opacity: 1,
  },
  pressStyle: {
    opacity: 0.9,
  },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: {
    opacity: 1,
    outlineWidth: 0,
  },
});

// The glyph-scale ring: all painted dismiss chrome lives here, inside the
// transparent press target, so the hover fill can never reach neighboring
// content — its painted box is the box the row already reserves (icon +
// the $1 inset that used to pad the press target itself).
const DismissRing = styled(View, {
  name: 'AlertDismissRing',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '$1',
  borderRadius: '$2',
  hoverStyle: {
    backgroundColor: '$color5',
  },
});

// Nested-scale ghost action (Carbon inline notification / Primer compact
// banner). Painted box is `nestedControl.px`; 44px press is the unpainted
// floor. The ring rides the pill via the chip-dismiss CSS contract
// (floor outline none, :focus-visible paints the inner ring).
const AlertActionTarget = styled(View, {
  name: 'AlertAction',
  role: 'button',
  tabIndex: 0,
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  opacity: 0.9,
  outlineWidth: 0,
  hoverStyle: { opacity: 1 },
  pressStyle: { opacity: 0.95 },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { opacity: 1, outlineWidth: 0 },
});

const AlertActionPill = styled(View, {
  name: 'AlertActionPill',
  paddingHorizontal: '$2',
  paddingVertical: '$1',
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: { backgroundColor: '$color5' },
  pressStyle: { backgroundColor: '$color6' },
});

const activateOnEnterSpace = (onPress?: () => void) =>
  ({
    onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault?.();
        onPress?.();
      }
    },
  }) as Record<string, unknown>;

/**
 * Tamagui styled hosts drop JSX `data-*` on native (Toast's empty gallery), so
 * native needs the RN `dataSet` map. On web, spreading `dataSet` onto a DOM
 * host is a React invalid-prop warning (`dataSet` -> `dataset="[object
 * Object]"`) on every Alert consumer, which is why Card/CardHeader/CardFooter
 * already guard on the target. jsdom and Storybook both keep kebab `data-*`,
 * so web writes those only and data-accent-stripe / data-density /
 * data-layout still reach the live-region node.
 */
function hostData(attrs: Record<string, string>): Record<string, unknown> {
  if (process.env.TAMAGUI_TARGET !== 'native') {
    return attrs;
  }
  const dataSet: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const camel = key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    dataSet[camel] = value;
  }
  return { dataSet };
}

function AlertAction({
  label,
  onPress,
  nestedPx,
  hitSlop,
  besideAdjacent,
  body,
  labelType,
  pointy,
  radiusOuter,
}: {
  label: string;
  onPress?: () => void;
  nestedPx: number;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  besideAdjacent: boolean;
  body: KnobProps['body'];
  labelType: KnobProps['label'];
  pointy: boolean;
  radiusOuter: KnobProps['borderRadiusNested'];
}) {
  const outset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - nestedPx) / 2));
  const hOutset = besideAdjacent ? Math.min(outset, DISMISS_ADJACENT_OUTSET) : outset;
  return (
    <AlertActionTarget
      className="mp-chip-dismiss"
      aria-label={label}
      {...pressTargetStyle()}
      marginVertical={-outset}
      marginHorizontal={-hOutset}
      hitSlop={besideAdjacent ? undefined : hitSlop}
      onPress={onPress}
      {...activateOnEnterSpace(onPress)}>
      <AlertActionPill
        className="mp-chip-dismiss-ring"
        minHeight={nestedPx}
        {...radiusOuter}
        borderRadius={pointy ? 0 : radiusOuter.borderRadius}>
        <SizableText {...body} {...labelType} fontWeight="400" color="$color12" userSelect="none">
          {label}
        </SizableText>
      </AlertActionPill>
    </AlertActionTarget>
  );
}

// ── Alert Component ───────────────────────────────────────────

function AlertInner({
  intent = 'info',
  title,
  children,
  icon,
  action,
  actionLabel,
  onAction,
  secondaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  dismissible = false,
  onDismiss,
  visible,
  defaultVisible = true,
  compact,
  ...props
}: AlertProps) {
  const { t } = useTranslation();
  const titleId = useId();
  // Do not default `compact` to false — that forced comfortable and made
  // the gallery density strip inert (h62 / pad 18 / gap 18 at both stops).
  // Omitted compact lets the density knob / Surface restyle the banner
  // A second resolve with compact:false holds padY so
  // height stays put while padX and gap step.
  const { knobProps } = useResolvedKnobs({ component: 'Alert', compact });
  const { knobProps: comfortableKnobs } = useResolvedKnobs({
    component: 'Alert',
    compact: false,
  });
  if (typeof document !== 'undefined') {
    ensureCompositeFocusRing();
  }
  const theme = useTheme();
  // Step 11: lowest AA-safe step of the hue on the step-3 tint (resolves to a
  // CSS var on web, a concrete value on native).
  const iconColor = theme.color11?.get() as string | undefined;
  const stripeColor = theme.color9?.get() as string | undefined;
  const [uncontrolledVisible, setUncontrolledVisible] = useState(defaultVisible);
  const shown = visible !== undefined ? visible : uncontrolledVisible;
  if (!shown) {
    return null;
  }

  const compactDensity = knobProps.density === 'compact';
  const nestedPx = knobProps.nestedControl.px;
  const dismissIcon = compactDensity ? DISMISS_ICON_COMPACT : DISMISS_ICON;
  const dismissInset = compactDensity ? DISMISS_RING_INSET_COMPACT : DISMISS_RING_INSET;
  const dismissVisual = dismissIcon + dismissInset * 2;
  const dismissOutset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - dismissVisual) / 2));

  // JSX interpolation splits mixed literals into arrays of strings — those
  // must be wrapped in Text like plain strings or they end up as raw text
  // nodes inside the View row (RN "text node cannot be a child of a View").
  const isTextual = (n: unknown): n is string | number => typeof n === 'string' || typeof n === 'number';
  const textualChildren =
    children != null && (isTextual(children) || (Array.isArray(children) && children.every(isTextual)))
      ? Array.isArray(children)
        ? children.join('')
        : String(children)
      : null;

  if (typeof title === 'string') {
    warnBannedErrorWords(title, { component: 'Alert' });
  }
  if (textualChildren !== null) {
    warnBannedErrorWords(textualChildren, { component: 'Alert' });
  }

  const handleDismiss = () => {
    if (visible === undefined) {
      setUncontrolledVisible(false);
    }
    onDismiss?.();
  };

  const IconComponent = intentIconMap[intent];
  const iconSize = compactDensity ? 16 : 20;
  const iconNode = icon === null ? null : (icon ?? <IconComponent size={iconSize} weight="fill" color={iconColor} />);

  const hasPrimary = action != null || Boolean(actionLabel);
  const hasSecondary = secondaryAction != null || Boolean(secondaryActionLabel);
  const hasActions = hasPrimary || hasSecondary;
  // Primer: single-line keeps actions inline; title+body or two actions wrap
  // below the copy so the dismiss X keeps a full 44px floor.
  const stackedActions = Boolean(hasActions && ((title != null && children != null) || (hasPrimary && hasSecondary)));
  const dismissBesideAction = hasActions && !stackedActions;
  const actionBesideAdjacent = hasSecondary || dismissBesideAction;
  const actionShared = {
    nestedPx,
    hitSlop: knobProps.nestedControl.hitSlop,
    body: knobProps.body,
    labelType: knobProps.label,
    pointy: knobProps.pointy,
    radiusOuter: knobProps.borderRadiusNested,
    besideAdjacent: actionBesideAdjacent,
  };

  const primaryAction =
    action ?? (actionLabel ? <AlertAction label={actionLabel} onPress={onAction} {...actionShared} /> : null);
  const secondaryNode =
    secondaryAction ??
    (secondaryActionLabel ? (
      <AlertAction label={secondaryActionLabel} onPress={onSecondaryAction} {...actionShared} />
    ) : null);

  const actionRow = hasActions ? (
    <XStack flexShrink={0} flexWrap="wrap" alignItems="center" {...knobProps.gap} data-alert-actions="">
      {primaryAction}
      {secondaryNode}
    </XStack>
  ) : null;

  const assertive = intent === 'error' || intent === 'warning';
  const hairline = Math.max(knobProps.borderRadius.borderWidth, 1);
  const stripe = isWeb
    ? {
        style: {
          borderInlineStartWidth: 3,
          borderInlineStartStyle: 'solid' as const,
          borderInlineStartColor: stripeColor,
        },
      }
    : { borderStartWidth: 3, borderStartColor: '$color9' as const };

  return (
    <AlertFrame
      // Interruptive intents announce assertively; the rest politely.
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-labelledby={title != null ? titleId : undefined}
      // Polaris form-summary: parent may focus the banner on submit without
      // adding a tab stop (the frame is not a control).
      tabIndex={-1}
      {...knobProps.borderRadius}
      {...knobProps.gap}
      paddingHorizontal={knobProps.panelPadding.padding}
      paddingVertical={comfortableKnobs.panelPadding.padding}
      borderColor="$color6"
      borderWidth={hairline}
      {...stripe}
      transition={knobProps.transition}
      {...props}
      {...hostData({
        'data-density': knobProps.density,
        'data-layout': stackedActions ? 'stacked' : 'inline',
        'data-nested-px': String(nestedPx),
        'data-accent-stripe': '3',
      })}>
      {iconNode ? (
        <View flexShrink={0} aria-hidden paddingTop={1}>
          {iconNode}
        </View>
      ) : null}
      <YStack flexGrow={1} flexShrink={1} gap="$1" justifyContent="center" minWidth={0}>
        {title ? (
          <SizableText id={titleId} {...knobProps.body} {...knobProps.label} fontWeight="600" color="$color12">
            {title}
          </SizableText>
        ) : null}
        {children != null &&
          (textualChildren !== null ? (
            <SizableText
              {...knobProps.body}
              {...knobProps.label}
              // Step 12, not 11: $color11 on the step-3 tint measured 4.2:1
              // in the light semantic ramps (below the 4.5 floor); weight and
              // size keep the title/description hierarchy.
              color="$color12"
              fontWeight="400">
              {textualChildren}
            </SizableText>
          ) : (
            children
          ))}
        {stackedActions ? actionRow : null}
      </YStack>
      {!stackedActions ? actionRow : null}
      {dismissible ? (
        <DismissButton
          aria-label={t('Dismiss')}
          className="mp-chip-dismiss"
          {...pressTargetStyle()}
          {...(dismissBesideAction ? { minWidth: dismissVisual + DISMISS_ADJACENT_OUTSET * 2 } : null)}
          marginVertical={-dismissOutset}
          marginHorizontal={-(dismissBesideAction ? DISMISS_ADJACENT_OUTSET : dismissOutset)}
          hitSlop={dismissBesideAction ? undefined : pressTargetHitSlop(dismissVisual)}
          onPress={handleDismiss}
          // role=button divs don't get free keyboard activation on web.
          {...activateOnEnterSpace(handleDismiss)}>
          <DismissRing
            className="mp-chip-dismiss-ring"
            padding={compactDensity ? '$0.5' : '$1'}
            borderRadius={knobProps.pointy ? 0 : '$2'}>
            <XIcon size={dismissIcon} color={iconColor} />
          </DismissRing>
        </DismissButton>
      ) : null}
    </AlertFrame>
  );
}

/**
 * Inline Alert / Banner for form validation summaries and page-level
 * messages. The whole subtree is wrapped in the matching <Intent> so any
 * Button placed inside renders SOLID on the same hue as intent Buttons
 * everywhere else (one emphasis system).
 */
export function Alert(props: AlertProps) {
  const themeName = intentThemeMap[props.intent ?? 'info'];
  return (
    <Intent name={themeName}>
      <AlertInner {...props} />
    </Intent>
  );
}

export type AlertFrameProps = GetProps<typeof AlertFrame>;
