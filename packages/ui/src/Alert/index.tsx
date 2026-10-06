import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, XIcon } from '@phosphor-icons/react';
import {
  Intent,
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  pressTargetHitSlop,
  pressTargetStyle,
  useResolvedKnobs,
  warnBannedErrorWords,
} from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, View, XStack, YStack, isWeb, styled, useTheme } from 'tamagui';

import { hostData } from '../host-data';
import { useTranslation } from '../shared/i18n';
import { isBareTextChild } from '../shared/text-rides-text';

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

const activateOnEnterSpace = (onPress?: () => void) => ({
  onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.();
      onPress?.();
    }
  },
});

const AlertAction = ({
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
}) => {
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
        <SizableText
          {...body}
          {...labelType}
          fontWeight="400"
          color="$color12"
          userSelect="none">
          {label}
        </SizableText>
      </AlertActionPill>
    </AlertActionTarget>
  );
};

// JSX interpolation splits mixed literals into arrays of strings — those
// must be wrapped in Text like plain strings or they end up as raw text
// nodes inside the View row (RN "text node cannot be a child of a View").
const isString = (value: unknown): value is string => typeof value === 'string';

const getTextualChildren = (children: ReactNode): string | null => {
  if (children == null) {
    return null;
  }
  if (Array.isArray(children)) {
    return children.every(isBareTextChild) ? children.join('') : null;
  }
  return isBareTextChild(children) ? String(children) : null;
};

const hasActionContent = (node: ReactNode, label?: string): boolean =>
  node != null || (label !== undefined && label !== '');

const buildStripe = (stripeColor?: string) =>
  isWeb
    ? {
        style: {
          borderInlineStartWidth: 3,
          borderInlineStartStyle: 'solid' as const,
          borderInlineStartColor: stripeColor,
        },
      }
    : { borderStartWidth: 3, borderStartColor: '$color9' as const };

// Mirrors JSX truthiness for ReactNode slots (null/undefined/false/''/0 render nothing).
const hasContent = (node: ReactNode): boolean => node != null && node !== false && node !== '' && node !== 0;

const AlertDismiss = ({
  label,
  besideAction,
  visual,
  outset,
  iconSize,
  compactDensity,
  pointy,
  iconColor,
  onPress,
}: {
  label: string;
  besideAction: boolean;
  visual: number;
  outset: number;
  iconSize: number;
  compactDensity: boolean;
  pointy: boolean;
  iconColor?: string;
  onPress: () => void;
}) => (
  <DismissButton
    aria-label={label}
    className="mp-chip-dismiss"
    {...pressTargetStyle()}
    minWidth={besideAction ? visual + DISMISS_ADJACENT_OUTSET * 2 : undefined}
    marginVertical={-outset}
    marginHorizontal={-(besideAction ? DISMISS_ADJACENT_OUTSET : outset)}
    hitSlop={besideAction ? undefined : pressTargetHitSlop(visual)}
    onPress={onPress}
    // role=button divs don't get free keyboard activation on web.
    {...activateOnEnterSpace(onPress)}>
    <DismissRing
      className="mp-chip-dismiss-ring"
      padding={compactDensity ? '$0.5' : '$1'}
      borderRadius={pointy ? 0 : '$2'}>
      <XIcon
        size={iconSize}
        color={iconColor}
      />
    </DismissRing>
  </DismissButton>
);

type AlertActionShared = Omit<Parameters<typeof AlertAction>[0], 'label' | 'onPress'>;

const renderActionSlot = (
  node: ReactNode,
  label: string | undefined,
  onPress: (() => void) | undefined,
  shared: AlertActionShared,
): ReactNode => {
  if (node != null) {
    return node;
  }
  if (label === undefined || label === '') {
    return null;
  }
  return (
    <AlertAction
      label={label}
      onPress={onPress}
      {...shared}
    />
  );
};

const AlertTitle = ({ id, knobProps, children }: { id: string; knobProps: KnobProps; children: ReactNode }) => (
  <SizableText
    id={id}
    {...knobProps.body}
    {...knobProps.label}
    fontWeight="600"
    color="$color12">
    {children}
  </SizableText>
);

const AlertBody = ({
  knobProps,
  children,
  textualChildren,
}: {
  knobProps: KnobProps;
  children: ReactNode;
  textualChildren: string | null;
}): ReactNode => {
  if (textualChildren === null) {
    return children;
  }
  return (
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
  );
};

const AlertCopy = ({
  titleId,
  title,
  children,
  textualChildren,
  knobProps,
  trailing,
}: {
  titleId: string;
  title: ReactNode;
  children: ReactNode;
  textualChildren: string | null;
  knobProps: KnobProps;
  trailing: ReactNode;
}) => (
  <YStack
    flexGrow={1}
    flexShrink={1}
    gap="$1"
    justifyContent="center"
    minWidth={0}>
    {hasContent(title) ? (
      <AlertTitle
        id={titleId}
        knobProps={knobProps}>
        {title}
      </AlertTitle>
    ) : null}
    {children != null && (
      <AlertBody
        knobProps={knobProps}
        textualChildren={textualChildren}>
        {children}
      </AlertBody>
    )}
    {trailing}
  </YStack>
);

const AlertLeadingIcon = ({
  icon,
  intent,
  size,
  color,
}: {
  icon: ReactNode | null | undefined;
  intent: AlertIntent;
  size: number;
  color?: string;
}) => {
  const IconComponent = intentIconMap[intent];
  const node =
    icon === null
      ? null
      : (icon ?? (
          <IconComponent
            size={size}
            weight="fill"
            color={color}
          />
        ));
  if (!hasContent(node)) {
    return null;
  }
  return (
    <View
      flexShrink={0}
      aria-hidden
      paddingTop={1}>
      {node}
    </View>
  );
};

/** Theme color Variables resolve to a CSS var on web and a concrete value on native. */
const useAlertColors = () => {
  const theme = useTheme();
  // Step 11: lowest AA-safe step of the hue on the step-3 tint.
  const icon: unknown = theme.color11?.get();
  const stripe: unknown = theme.color9?.get();
  return { iconColor: isString(icon) ? icon : undefined, stripeColor: isString(stripe) ? stripe : undefined };
};

const getDismissGeometry = (compactDensity: boolean) => {
  const icon = compactDensity ? DISMISS_ICON_COMPACT : DISMISS_ICON;
  const inset = compactDensity ? DISMISS_RING_INSET_COMPACT : DISMISS_RING_INSET;
  const visual = icon + inset * 2;
  return { icon, visual, outset: Math.max(0, Math.ceil((MIN_PRESS_TARGET - visual) / 2)) };
};

/**
 * Primer: single-line keeps actions inline; title+body or two actions wrap
 * below the copy so the dismiss X keeps a full 44px floor.
 */
const getActionLayout = ({
  hasPrimary,
  hasSecondary,
  hasTitleAndBody,
}: {
  hasPrimary: boolean;
  hasSecondary: boolean;
  hasTitleAndBody: boolean;
}) => {
  const hasActions = hasPrimary || hasSecondary;
  const stacked = hasActions && (hasTitleAndBody || (hasPrimary && hasSecondary));
  const dismissBeside = hasActions && !stacked;
  return { hasActions, stacked, dismissBeside, adjacent: hasSecondary || dismissBeside };
};

// ── Alert Component ───────────────────────────────────────────

const AlertInner = ({
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
}: AlertProps) => {
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
  const { iconColor, stripeColor } = useAlertColors();
  const [uncontrolledVisible, setUncontrolledVisible] = useState(defaultVisible);
  const shown = visible ?? uncontrolledVisible;
  if (!shown) {
    return null;
  }

  const compactDensity = knobProps.density === 'compact';
  const nestedPx = knobProps.nestedControl.px;
  const dismiss = getDismissGeometry(compactDensity);
  const textualChildren = getTextualChildren(children);

  if (isString(title)) {
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

  const layout = getActionLayout({
    hasPrimary: hasActionContent(action, actionLabel),
    hasSecondary: hasActionContent(secondaryAction, secondaryActionLabel),
    hasTitleAndBody: title != null && children != null,
  });
  const actionShared = {
    nestedPx,
    hitSlop: knobProps.nestedControl.hitSlop,
    body: knobProps.body,
    labelType: knobProps.label,
    pointy: knobProps.pointy,
    radiusOuter: knobProps.borderRadiusNested,
    besideAdjacent: layout.adjacent,
  };

  const actionRow = layout.hasActions ? (
    <XStack
      flexShrink={0}
      flexWrap="wrap"
      alignItems="center"
      {...knobProps.gap}
      data-alert-actions="">
      {renderActionSlot(action, actionLabel, onAction, actionShared)}
      {renderActionSlot(secondaryAction, secondaryActionLabel, onSecondaryAction, actionShared)}
    </XStack>
  ) : null;

  const assertive = intent === 'error' || intent === 'warning';
  const hairline = Math.max(knobProps.borderRadius.borderWidth, 1);

  return (
    <AlertFrame
      // Interruptive intents announce assertively; the rest politely.
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-labelledby={title == null ? undefined : titleId}
      // Polaris form-summary: parent may focus the banner on submit without
      // adding a tab stop (the frame is not a control).
      tabIndex={-1}
      {...knobProps.borderRadius}
      {...knobProps.gap}
      paddingHorizontal={knobProps.panelPadding.padding}
      paddingVertical={comfortableKnobs.panelPadding.padding}
      borderColor="$color6"
      borderWidth={hairline}
      {...buildStripe(stripeColor)}
      transition={knobProps.transition}
      {...props}
      {...hostData({
        'data-density': knobProps.density,
        'data-layout': layout.stacked ? 'stacked' : 'inline',
        'data-nested-px': String(nestedPx),
        'data-accent-stripe': '3',
      })}>
      <AlertLeadingIcon
        icon={icon}
        intent={intent}
        size={compactDensity ? 16 : 20}
        color={iconColor}
      />
      <AlertCopy
        titleId={titleId}
        title={title}
        textualChildren={textualChildren}
        knobProps={knobProps}
        trailing={layout.stacked ? actionRow : null}>
        {children}
      </AlertCopy>
      {layout.stacked ? null : actionRow}
      {dismissible ? (
        <AlertDismiss
          label={t('Dismiss')}
          besideAction={layout.dismissBeside}
          visual={dismiss.visual}
          outset={dismiss.outset}
          iconSize={dismiss.icon}
          compactDensity={compactDensity}
          pointy={knobProps.pointy}
          iconColor={iconColor}
          onPress={handleDismiss}
        />
      ) : null}
    </AlertFrame>
  );
};

/**
 * Inline Alert / Banner for form validation summaries and page-level
 * messages. The whole subtree is wrapped in the matching <Intent> so any
 * Button placed inside renders SOLID on the same hue as intent Buttons
 * everywhere else (one emphasis system).
 */
export const Alert = (props: AlertProps) => {
  const themeName = intentThemeMap[props.intent ?? 'info'];
  return (
    <Intent name={themeName}>
      <AlertInner {...props} />
    </Intent>
  );
};

export type AlertFrameProps = GetProps<typeof AlertFrame>;
