import { UserIcon } from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  borderRadiusMap,
  ensureFocusVisibleRing,
  getGroupPosition,
  pressTargetHitSlop,
  radiusClassProps,
  resolveRadiusClass,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import type { BorderRadius, ControlStateProps } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { Children, createContext, isValidElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { GetProps, SizeTokens } from 'tamagui';
import {
  Avatar as TamaguiAvatar,
  SizableText,
  View,
  XStack,
  getVariableValue,
  styled,
  withStaticProperties,
} from 'tamagui';

import { componentColors } from '../component-colors';

import { fallbackTone, getInitials } from './get-initials';

export { fallbackTone, fallbackToneIndex, FALLBACK_TONES, getInitials } from './get-initials';
export type { FallbackTone } from './get-initials';

// ── Types ─────────────────────────────────────────────────────

export type AvatarSize = SizeTokens | number;
export type AvatarStatus = 'online' | 'busy' | 'away' | 'offline';

export interface AvatarProps extends Omit<GetProps<typeof TamaguiAvatar>, 'children'> {
  /** Image URL. When missing or failing, the initials / fallback slot shows. */
  src?: string;
  /** Display name used for initials + default alt text. */
  name?: string;
  /** Accessible label for the image (defaults to `name`). */
  alt?: string;
  /** Override the initials string (defaults to {@link getInitials}(name)). */
  initials?: string;
  /** Fallback surface color when showing initials. */
  fallbackBackgroundColor?: string;
  /** Initials text color. */
  fallbackColor?: string;
  /** Custom fallback node (replaces initials text). */
  fallback?: ReactNode;
  /** Size token or number. Omit to follow the size recipe. */
  size?: AvatarSize;
  /** Circular clip (default true for people). Square is for orgs/bots (Primer). */
  circular?: boolean;
  /**
   * Nested surface (list row, comment, overlay). Paints `nestedControl`
   * below the 44px floor; density still steps independently.
   */
  nested?: boolean;
  /** Density compact override (not a size). Wins over the density knob. */
  compact?: boolean;
  /** Presence pip (Fluent/Primer). Decorative — not a second focusable. */
  status?: AvatarStatus;
  /** Advanced: compound children (`Avatar.Image` / `Avatar.Fallback`). */
  children?: ReactNode;
}

export interface AvatarGroupProps {
  children: ReactNode;
  /** Visible faces before the +N overflow. @default 4 (Primer stack cap) */
  max?: number;
  size?: AvatarSize;
  circular?: boolean;
  nested?: boolean;
  compact?: boolean;
  /**
   * Overlap stack (Primer AvatarStack). `false` lays square faces flush so
   * outer-corners apply; circles stay identity either way.
   * @default true
   */
  overlap?: boolean;
}

interface AvatarGroupContext {
  size?: AvatarSize;
  circular: boolean;
  nested: boolean;
  compact?: boolean;
  overlap: boolean;
  index: number;
  count: number;
}

const GroupCtx = createContext<AvatarGroupContext | null>(null);

const identityRadiusProps = radiusClassProps('R-IDENTITY', 'Avatar');
const pipRadiusProps = radiusClassProps('R-PILL', 'Avatar status');

/**
 * Identity-object scale (R-IDENTITY): an avatar is a medallion, not control
 * chrome, so its diameter rides the flat Tamagui size ramp — resolved LIVE
 * from the token scale, never a handwritten px mirror. The knob
 * words land one ramp step below the control token (small $2 = 28, medium
 * $3 = 36, large $4 = 44 — lossless vs the old map). Sub-$1 tokens clamp to
 * a 16px legibility floor (the raw $0.5 token is 4px).
 */
const AVATAR_MIN_PX = 16;
const AVATAR_MEDIUM_TOKEN: SizeTokens = '$3';
const AVATAR_KNOB_TOKEN = new Map<string, SizeTokens>([
  ['small', '$2'],
  ['medium', AVATAR_MEDIUM_TOKEN],
  ['large', '$4'],
]);

const avatarTokenPx = (token: SizeTokens): number | undefined => {
  const resolved: unknown = getVariableValue(getSize(token));
  return Number.isFinite(resolved) ? Math.max(AVATAR_MIN_PX, Number(resolved)) : undefined;
};

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: '$green10',
  busy: '$red10',
  away: '$yellow10',
  offline: '$color8',
};

const CUTOUT_BORDER = 2;

const sizeToPx = (size: AvatarSize): number | undefined => {
  if (Number.isFinite(size)) {
    return Number(size);
  }
  return avatarTokenPx(size);
};

/**
 * Invert the canonical stop→token map so the square face can ask the
 * resolver for a stop, not a raw `$12`. Silent fallback would widen the
 * table; an unknown token is a wiring bug.
 */
const radiusStopFromToken = (token: string | number | undefined): BorderRadius => {
  if (token === 0 || token === '0') {
    return 'none';
  }
  // SAFETY: borderRadiusMap is keyed exactly by BorderRadius, so its own keys are BorderRadius values.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys widens to string[]; keys of a literal-keyed map are its key union
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  throw new Error(
    `Avatar square face: "${String(token)}" is not a borderRadiusMap token; CIRCULAR-AT-FULL needs a known stop`,
  );
};

/** Square face rides CIRCULAR-AT-FULL — full is h/2, not the $12 token. */
const squareFaceRadiusPx = (token: string | number | undefined, heightPx: number): number =>
  resolveRadiusClass('CIRCULAR-AT-FULL', radiusStopFromToken(token), { heightPx });

const resolveVisualPx = (
  sizeProp: AvatarSize | undefined,
  nested: boolean,
  sizeKnob: string,
  nestedPx: number,
): number => {
  const mediumPx = avatarTokenPx(AVATAR_MEDIUM_TOKEN) ?? 36;
  if (sizeProp != null) {
    return sizeToPx(sizeProp) ?? mediumPx;
  }
  if (nested) {
    return nestedPx;
  }
  const knobToken = AVATAR_KNOB_TOKEN.get(sizeKnob);
  return (knobToken === undefined ? undefined : avatarTokenPx(knobToken)) ?? mediumPx;
};

const opticalFont = (px: number): SizeTokens => {
  if (px <= 20) {
    return '$1';
  }
  if (px <= 32) {
    return '$2';
  }
  return '$3';
};

// The RN/Tamagui `onPress` type is `((event: GestureResponderEvent) => void)
// | null | undefined`; the ring helper only ever calls it with zero args, so a
// bottom-arg function type accepts any handler (and null) without a value cast.
const activateOnEnterSpace = (onPress?: ((...args: never[]) => void) | null) =>
  onPress == null
    ? undefined
    : {
        onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault?.();
            onPress();
          }
        },
      };

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

type FallbackTone = NonNullable<ReturnType<typeof fallbackTone>>;

const resolveFallbackInk = (
  fallbackColor: string | undefined,
  onAccent: boolean,
  onAccentInitials: string | undefined,
  tone: FallbackTone | undefined,
) => {
  if (fallbackColor != null) {
    return fallbackColor;
  }
  if (onAccent) {
    return onAccentInitials ?? '$color';
  }
  return tone?.fg ?? componentColors.text.primary;
};

const resolveFallbackColors = ({
  backgroundColor,
  fallbackBackgroundColor,
  fallbackColor,
  name,
  onAccentInitials,
}: Pick<AvatarProps, 'backgroundColor' | 'fallbackBackgroundColor' | 'fallbackColor' | 'name'> & {
  onAccentInitials: string | undefined;
}) => {
  const hasOwnBackground = hasText(fallbackBackgroundColor) || (backgroundColor != null && backgroundColor !== '');
  const tone = hasOwnBackground ? undefined : fallbackTone(name);
  const fallbackBg = backgroundColor ?? fallbackBackgroundColor ?? tone?.bg ?? '$color4';
  const fallbackFg = resolveFallbackInk(fallbackColor, fallbackBg === '$accentBackground', onAccentInitials, tone);
  return { fallbackBg, fallbackFg };
};

const resolveGroupGeometry = (
  group: AvatarGroupContext | null,
  circular: boolean,
  squareRadiusPx: number | undefined,
) => {
  if (group == null) {
    return { position: null, squareFlush: false, stackCorners: null };
  }
  const position = getGroupPosition(group.index, group.count);
  const squareFlush = !group.overlap && !circular;
  return {
    position,
    squareFlush,
    stackCorners: squareFlush ? stackRadiusProps(position, squareRadiusPx, 'horizontal') : null,
  };
};

const edgeBorderProps = (
  cutout: boolean,
  squareFlush: boolean,
  position: ReturnType<typeof getGroupPosition> | null,
  borderColor: string | undefined,
) => {
  if (cutout) {
    return { borderWidth: CUTOUT_BORDER, borderColor: '$background' };
  }
  return squareFlush && position !== 'first' && position !== 'only' ? { borderStartWidth: 1, borderColor } : undefined;
};

const mergeGroupDefaults = (
  group: AvatarGroupContext | null,
  own: Pick<AvatarProps, 'circular' | 'compact' | 'size'> & { nested: boolean },
) => ({
  circular: group == null ? (own.circular ?? true) : group.circular,
  nested: own.nested || Boolean(group?.nested),
  compact: own.compact ?? group?.compact,
  size: own.size ?? group?.size,
});

const trueAttr = (on: boolean) => (on ? 'true' : undefined);

const resolvePressSlop = (interactive: boolean, visualPx: number) =>
  interactive && visualPx < MIN_PRESS_TARGET ? pressTargetHitSlop(visualPx) : undefined;

const resolveAccessibleName = (alt: string | undefined, name: string | undefined, interactive: boolean) => ({
  decorative: !hasText(alt) && !hasText(name) && !interactive,
  label: alt ?? name ?? (interactive ? 'Avatar' : undefined),
});

// SAFETY: ControlStateProps is the theme's superset of the style keys tamagui's focusVisibleStyle accepts; ensureFocusVisibleRing only reads outline* keys from it.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tamagui's focusVisibleStyle outlineOffset type is wider than the theme's ControlStateProps
const asControlState = (style: AvatarProps['focusVisibleStyle']) => style as ControlStateProps;

// ── Avatar ────────────────────────────────────────────────────

interface AvatarFallbackContentProps {
  src: string | undefined;
  label: string | undefined;
  fallbackBg: NonNullable<AvatarProps['backgroundColor']>;
  fallbackFg: string;
  fallback: ReactNode;
  initialsText: string;
  visualPx: number;
  labelProps: ReturnType<typeof useResolvedKnobs>['knobProps']['label'];
}

const AvatarFallbackContent = ({
  src,
  label,
  fallbackBg,
  fallbackFg,
  fallback,
  initialsText,
  visualPx,
  labelProps,
}: AvatarFallbackContentProps) => {
  const hasSrc = hasText(src);
  const initialsNode =
    initialsText === '?' ? (
      <View {...{ color: fallbackFg }}>
        <UserIcon
          size={Math.round(visualPx * 0.42)}
          color="currentColor"
        />
      </View>
    ) : (
      <SizableText
        {...labelProps}
        fontSize={opticalFont(visualPx)}
        fontWeight="600"
        color={fallbackFg}
        textAlign="center"
        userSelect="none">
        {initialsText}
      </SizableText>
    );
  return (
    <>
      {hasSrc ? (
        <TamaguiAvatar.Image
          src={src}
          alt={label ?? ''}
        />
      ) : null}
      <TamaguiAvatar.Fallback
        backgroundColor={fallbackBg}
        alignItems="center"
        justifyContent="center"
        {...(hasSrc ? { delayMs: 600 } : {})}>
        {fallback ?? initialsNode}
      </TamaguiAvatar.Fallback>
    </>
  );
};

const AvatarRoot = ({
  src,
  name,
  alt,
  initials,
  fallbackBackgroundColor,
  fallbackColor,
  fallback,
  size: sizeProp,
  circular: circularProp,
  nested: nestedProp = false,
  compact,
  status,
  children,
  backgroundColor,
  onPress,
  focusStyle,
  focusVisibleStyle,
  hitSlop: hitSlopProp,
  ...props
}: AvatarProps) => {
  const group = useContext(GroupCtx);
  const merged = mergeGroupDefaults(group, { circular: circularProp, nested: nestedProp, compact, size: sizeProp });
  const { circular, nested } = merged;
  const { knobProps } = useResolvedKnobs({ compact: merged.compact });
  const visualPx = resolveVisualPx(merged.size, nested, knobProps.size, knobProps.nestedControl.px);
  const interactive = onPress != null;
  const pressSlop = resolvePressSlop(interactive, visualPx);
  const onAccentInitials = useReadableTextOn('$accentBackground');
  const { fallbackBg, fallbackFg } = resolveFallbackColors({
    backgroundColor,
    fallbackBackgroundColor,
    fallbackColor,
    name,
    onAccentInitials,
  });
  const identityProps = circular ? identityRadiusProps : null;
  const squareRadiusPx = circular ? undefined : squareFaceRadiusPx(knobProps.borderRadius.borderRadius, visualPx);
  const { position, squareFlush, stackCorners } = resolveGroupGeometry(group, circular, squareRadiusPx);
  const cutout = Boolean(group?.overlap);
  const { decorative, label } = resolveAccessibleName(alt, name, interactive);
  const initialsText = initials ?? (hasText(name) ? getInitials(name) : '?');
  const pipPx = Math.max(8, Math.round(visualPx * 0.28));

  const frame = (
    <TamaguiAvatar
      circular={circular && !stackCorners}
      size={visualPx}
      width={visualPx}
      height={visualPx}
      minWidth={visualPx}
      minHeight={visualPx}
      maxWidth={visualPx}
      maxHeight={visualPx}
      backgroundColor={fallbackBg}
      overflow="hidden"
      flexShrink={0}
      outlineWidth={0}
      onPress={onPress}
      {...(!circular && !stackCorners ? { ...knobProps.borderRadius, borderRadius: squareRadiusPx } : undefined)}
      {...stackCorners}
      {...edgeBorderProps(cutout, squareFlush, position, knobProps.borderRadius.borderColor)}
      {...identityProps}
      {...props}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      role={interactive ? 'button' : props.role}
      tabIndex={interactive ? 0 : undefined}
      cursor={interactive ? 'pointer' : undefined}
      {...activateOnEnterSpace(onPress)}
      data-avatar-px={visualPx}
      data-avatar-nested={trueAttr(nested)}
      data-avatar-interactive={trueAttr(interactive)}
      data-avatar-hitslop={pressSlop ? String(pressSlop.top) : undefined}
      focusStyle={{ outlineWidth: 0, ...focusStyle }}
      focusVisibleStyle={
        interactive
          ? ensureFocusVisibleRing({
              outlineOffset: -2,
              ...asControlState(focusVisibleStyle),
            })
          : focusVisibleStyle
      }
      hitSlop={pressSlop ?? hitSlopProp}>
      {children ?? (
        <AvatarFallbackContent
          src={src}
          label={label}
          fallbackBg={fallbackBg}
          fallbackFg={fallbackFg}
          fallback={fallback}
          initialsText={initialsText}
          visualPx={visualPx}
          labelProps={knobProps.label}
        />
      )}
    </TamaguiAvatar>
  );

  if (!status) {
    return frame;
  }

  return (
    <View
      position="relative"
      width={visualPx}
      height={visualPx}
      flexShrink={0}>
      {frame}
      <View
        {...pipRadiusProps}
        position="absolute"
        bottom={-1}
        right={-1}
        width={pipPx}
        height={pipPx}
        borderRadius={1000}
        backgroundColor={STATUS_COLOR[status]}
        borderWidth={2}
        borderColor="$background"
        pointerEvents="none"
      />
    </View>
  );
};

const AvatarGroupItem = styled(View, {
  name: 'AvatarGroupItem',
  flexShrink: 0,
});

interface AvatarGroupSlotProps extends AvatarGroupContext {
  zIndex: number;
  marginStart: number;
  children: ReactNode;
}

const AvatarGroupSlot = ({
  size,
  circular,
  nested,
  compact,
  overlap,
  index,
  count,
  zIndex,
  marginStart,
  children,
}: AvatarGroupSlotProps) => {
  const value = useMemo<AvatarGroupContext>(
    () => ({ size, circular, nested, compact, overlap, index, count }),
    [size, circular, nested, compact, overlap, index, count],
  );
  return (
    <GroupCtx.Provider value={value}>
      <AvatarGroupItem
        zIndex={zIndex}
        marginStart={marginStart}>
        {children}
      </AvatarGroupItem>
    </GroupCtx.Provider>
  );
};

const AvatarGroup = ({
  children,
  max = 4,
  size,
  circular = true,
  nested = false,
  compact,
  overlap = true,
}: AvatarGroupProps) => {
  const { knobProps } = useResolvedKnobs({ compact });
  const visualPx = resolveVisualPx(size, nested, knobProps.size, knobProps.nestedControl.px);
  const overlapPx = overlap ? Math.round(visualPx * 0.32) : 0;
  // oxlint-disable-next-line react/no-react-children -- toArray flattens fragments/arrays and drops null/boolean children before counting faces
  const items = Children.toArray(children).filter(isValidElement);
  const shown = items.slice(0, Math.max(1, max));
  const extra = items.length - shown.length;
  const total = shown.length + (extra > 0 ? 1 : 0);
  const overflowLabel = extra > 9 ? '9+' : `+${extra}`;

  return (
    <XStack
      alignItems="center"
      flexShrink={0}
      gap={0}
      data-avatar-group=""
      data-avatar-overlap={overlap ? 'true' : 'false'}>
      {shown.map((child, index) => (
        <AvatarGroupSlot
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- the index is the face's stack position (context + zIndex), and faces are never reordered
          key={index}
          size={size}
          circular={circular}
          nested={nested}
          compact={compact}
          overlap={overlap}
          index={index}
          count={total}
          zIndex={index}
          marginStart={index > 0 ? -overlapPx : 0}>
          {child}
        </AvatarGroupSlot>
      ))}
      {extra > 0 ? (
        <AvatarGroupSlot
          size={size}
          circular={circular}
          nested={nested}
          compact={compact}
          overlap={overlap}
          index={shown.length}
          count={total}
          zIndex={shown.length}
          marginStart={-overlapPx}>
          <AvatarRoot
            initials={overflowLabel}
            fallbackBackgroundColor="$color4"
            fallbackColor="$color12"
            circular={circular}
            nested={nested}
            compact={compact}
            size={size}
          />
        </AvatarGroupSlot>
      ) : null}
    </XStack>
  );
};

// oxlint-disable-next-line react-doctor/only-export-components -- this module also re-exports the pure initials/tone helpers as part of Avatar's public surface
export const Avatar = withStaticProperties(AvatarRoot, {
  Image: TamaguiAvatar.Image,
  Fallback: TamaguiAvatar.Fallback,
  Group: AvatarGroup,
});

export type { AvatarProps as AvatarFrameProps };
