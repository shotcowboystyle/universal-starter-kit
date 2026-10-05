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
import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
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

import { componentColors } from '../componentColors';

import { fallbackTone, getInitials } from './getInitials';

export { fallbackTone, fallbackToneIndex, FALLBACK_TONES, getInitials } from './getInitials';
export type { FallbackTone } from './getInitials';

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

interface GroupCtx {
  size?: AvatarSize;
  circular: boolean;
  nested: boolean;
  compact?: boolean;
  overlap: boolean;
  index: number;
  count: number;
}

const GroupCtx = createContext<GroupCtx | null>(null);

const identityShapeProps = radiusClassProps('R-IDENTITY', 'Avatar');
const pipShapeProps = radiusClassProps('R-PILL', 'Avatar status');

/**
 * Identity-object scale (R-IDENTITY): an avatar is a medallion, not control
 * chrome, so its diameter rides the flat Tamagui size ramp — resolved LIVE
 * from the token scale, never a handwritten px mirror. The knob
 * words land one ramp step below the control token (small $2 = 28, medium
 * $3 = 36, large $4 = 44 — lossless vs the old map). Sub-$1 tokens clamp to
 * a 16px legibility floor (the raw $0.5 token is 4px).
 */
const AVATAR_MIN_PX = 16;
const AVATAR_KNOB_TOKEN: Record<string, string> = { small: '$2', medium: '$3', large: '$4' };

function avatarTokenPx(token: string): number | undefined {
  const resolved = getVariableValue(getSize(token as SizeTokens));
  return typeof resolved === 'number' && Number.isFinite(resolved) ? Math.max(AVATAR_MIN_PX, resolved) : undefined;
}

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: '$green10',
  busy: '$red10',
  away: '$yellow10',
  offline: '$color8',
};

const CUTOUT_BORDER = 2;

function sizeToPx(size: AvatarSize): number | undefined {
  if (typeof size === 'number') {
    return size;
  }
  return avatarTokenPx(String(size));
}

/**
 * Invert the canonical stop→token map so the square face can ask the
 * resolver for a stop, not a raw `$12`. Silent fallback would widen the
 * table; an unknown token is a wiring bug.
 */
function radiusStopFromToken(token: string | number | undefined): BorderRadius {
  if (token === 0 || token === '0') {
    return 'none';
  }
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  throw new Error(
    `Avatar square face: "${String(token)}" is not a borderRadiusMap token; CIRCULAR-AT-FULL needs a known stop`,
  );
}

/** Square face rides CIRCULAR-AT-FULL — full is h/2, not the $12 token. */
function squareFaceRadiusPx(token: string | number | undefined, heightPx: number): number {
  return resolveRadiusClass('CIRCULAR-AT-FULL', radiusStopFromToken(token), { heightPx });
}

function resolveVisualPx(
  sizeProp: AvatarSize | undefined,
  nested: boolean,
  sizeKnob: string,
  nestedPx: number,
): number {
  const mediumPx = avatarTokenPx(AVATAR_KNOB_TOKEN.medium) ?? 36;
  if (sizeProp != null) {
    return sizeToPx(sizeProp) ?? mediumPx;
  }
  if (nested) {
    return nestedPx;
  }
  const knobToken = AVATAR_KNOB_TOKEN[sizeKnob];
  return (knobToken ? avatarTokenPx(knobToken) : undefined) ?? mediumPx;
}

function opticalFont(px: number): SizeTokens {
  if (px <= 20) {
    return '$1';
  }
  if (px <= 32) {
    return '$2';
  }
  return '$3';
}

// The RN/Tamagui `onPress` type is `((event: GestureResponderEvent) => void)
// | null | undefined`; the ring helper only ever calls it with zero args, so a
// bottom-arg function type accepts any handler (and null) without a value cast.
function activateOnEnterSpace(onPress?: ((...args: never[]) => void) | null) {
  if (!onPress) {
    return undefined;
  }
  return {
    onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault?.();
        onPress();
      }
    },
  };
}

// ── Avatar ────────────────────────────────────────────────────

function AvatarRoot({
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
}: AvatarProps) {
  const group = useContext(GroupCtx);
  const circular = group ? group.circular : (circularProp ?? true);
  const nested = nestedProp || Boolean(group?.nested);
  const densityCompact = compact ?? group?.compact;
  const resolvedSizeProp = sizeProp ?? group?.size;
  const { knobProps } = useResolvedKnobs({ compact: densityCompact });
  const visualPx = resolveVisualPx(resolvedSizeProp, nested, knobProps.size, knobProps.nestedControl.px);
  const interactive = typeof onPress === 'function';
  const pressSlop = interactive && visualPx < MIN_PRESS_TARGET ? pressTargetHitSlop(visualPx) : undefined;
  const onAccentInitials = useReadableTextOn('$accentBackground');
  const tone = fallbackBackgroundColor || backgroundColor ? undefined : fallbackTone(name);
  const fallbackBg = backgroundColor ?? fallbackBackgroundColor ?? tone?.bg ?? '$color4';
  const onAccent = fallbackBg === '$accentBackground';
  const fallbackFg =
    fallbackColor ?? (onAccent ? (onAccentInitials ?? '$color') : (tone?.fg ?? componentColors.text.primary));
  const identityProps = circular ? identityShapeProps : null;
  const squareRadiusPx = circular ? undefined : squareFaceRadiusPx(knobProps.borderRadius.borderRadius, visualPx);
  const position = group ? getGroupPosition(group.index, group.count) : undefined;
  const squareFlush = Boolean(group && !group.overlap && !circular && position);
  const stackCorners = squareFlush ? stackRadiusProps(position!, squareRadiusPx, 'horizontal') : undefined;
  const cutout = Boolean(group?.overlap);
  const labeled = Boolean(alt || name);
  const decorative = !labeled && !interactive;
  const label = alt ?? name ?? (interactive ? 'Avatar' : undefined);
  const initialsText = initials ?? (name ? getInitials(name) : '?');
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
      {...(cutout
        ? { borderWidth: CUTOUT_BORDER, borderColor: '$background' }
        : squareFlush && position !== 'first' && position !== 'only'
          ? { borderStartWidth: 1, borderColor: knobProps.borderRadius.borderColor }
          : undefined)}
      {...identityProps}
      {...props}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      role={interactive ? 'button' : props.role}
      tabIndex={interactive ? 0 : undefined}
      cursor={interactive ? 'pointer' : undefined}
      {...activateOnEnterSpace(onPress)}
      data-avatar-px={visualPx}
      data-avatar-nested={nested ? 'true' : undefined}
      data-avatar-interactive={interactive ? 'true' : undefined}
      data-avatar-hitslop={pressSlop ? String(pressSlop.top) : undefined}
      focusStyle={{ outlineWidth: 0, ...focusStyle }}
      focusVisibleStyle={
        interactive
          ? ensureFocusVisibleRing({
              outlineOffset: -2,
              ...(focusVisibleStyle as ControlStateProps),
            })
          : focusVisibleStyle
      }
      hitSlop={pressSlop ?? hitSlopProp}>
      {children != null ? (
        children
      ) : (
        <>
          {src ? <TamaguiAvatar.Image src={src} alt={label ?? ''} /> : null}
          <TamaguiAvatar.Fallback
            backgroundColor={fallbackBg}
            alignItems="center"
            justifyContent="center"
            {...(src ? { delayMs: 600 } : {})}>
            {fallback ??
              (initialsText === '?' ? (
                <View {...({ color: fallbackFg } as Record<string, unknown>)}>
                  <UserIcon size={Math.round(visualPx * 0.42)} color="currentColor" />
                </View>
              ) : (
                <SizableText
                  {...knobProps.label}
                  fontSize={opticalFont(visualPx)}
                  fontWeight="600"
                  color={fallbackFg}
                  textAlign="center"
                  userSelect="none">
                  {initialsText}
                </SizableText>
              ))}
          </TamaguiAvatar.Fallback>
        </>
      )}
    </TamaguiAvatar>
  );

  if (!status) {
    return frame;
  }

  return (
    <View position="relative" width={visualPx} height={visualPx} flexShrink={0}>
      {frame}
      <View
        {...pipShapeProps}
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
}

const AvatarGroupItem = styled(View, {
  name: 'AvatarGroupItem',
  flexShrink: 0,
});

function AvatarGroup({
  children,
  max = 4,
  size,
  circular = true,
  nested = false,
  compact,
  overlap = true,
}: AvatarGroupProps) {
  const { knobProps } = useResolvedKnobs({ compact });
  const visualPx = resolveVisualPx(size, nested, knobProps.size, knobProps.nestedControl.px);
  const overlapPx = overlap ? Math.round(visualPx * 0.32) : 0;
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
        <GroupCtx.Provider key={index} value={{ size, circular, nested, compact, overlap, index, count: total }}>
          <AvatarGroupItem zIndex={index} marginStart={index > 0 ? -overlapPx : 0}>
            {child}
          </AvatarGroupItem>
        </GroupCtx.Provider>
      ))}
      {extra > 0 ? (
        <GroupCtx.Provider
          value={{
            size,
            circular,
            nested,
            compact,
            overlap,
            index: shown.length,
            count: total,
          }}>
          <AvatarGroupItem zIndex={shown.length} marginStart={-overlapPx}>
            <AvatarRoot
              initials={overflowLabel}
              fallbackBackgroundColor="$color4"
              fallbackColor="$color12"
              circular={circular}
              nested={nested}
              compact={compact}
              size={size}
            />
          </AvatarGroupItem>
        </GroupCtx.Provider>
      ) : null}
    </XStack>
  );
}

export const Avatar = withStaticProperties(AvatarRoot, {
  Image: TamaguiAvatar.Image,
  Fallback: TamaguiAvatar.Fallback,
  Group: AvatarGroup,
});

export type { AvatarProps as AvatarFrameProps };
