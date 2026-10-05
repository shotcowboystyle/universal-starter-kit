import {
  MIN_PRESS_TARGET,
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  radiusClassProps,
  recipeFamilies,
  resolveControlRadius,
  SIZE_RECIPE_RADIUS_TOKEN_TO_STOP,
  sizeRecipeForToken,
  sizeRecipeFromHeight,
  solidButtonIntents,
  solidPaletteThemes,
  useAccentOnSurface,
  useResolvedKnobs,
  type RecipeFamilyName,
  type SizeRecipe,
  type SizeRecipeRadiusStop,
} from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { getElevation, themeableVariants } from '@tamagui/stacks';
import type { ThemeName } from '@tamagui/web';
import type { SizeTokens, VariantSpreadExtras } from '@tamagui/web';
import { Store, useStore } from '@tanstack/react-store';
import {
  Children,
  createElement,
  isValidElement,
  useCallback,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  Button as TamaguiButton,
  type ButtonProps as TamaguiButtonProps,
  SizableText,
  View,
  XStack,
  YStack,
  Theme,
  getVariableValue,
  styled,
  isWeb,
  useTheme,
} from 'tamagui';

import { formatActionLabel } from '../actionLabel';
import { getFormSubmission } from '../Form/submissionController';
import { formButtonColors, formCommonColors } from '../shared/colorRamps';
import { warnBareDisabled, warnPositiveTabIndex, warnSizeRecipeEscape } from '../shared/devWarn';
import { useControlGrouped } from '../shared/groupContext';
import { pressSlopProps } from '../shared/pressSlopProps';
import { useFormField } from '../shared/utils';
import { Spinner } from '../Spinner';
import type { AnyFormApi } from '../types';

/**
 * Coordinated size recipe (Polaris slim/medium/large, Primer s/m/l, Linear
 * 28/32/40, Spectrum S/M, M3 XS/S). Height, pad, type, icon, gap and radius
 * step together from the size table. The borderRadius knob is an override
 * of painted corners only (`resolveControlRadius`); internal gap keeps the
 * icon and label grouped. Density selects the same-height compact family.
 *
 * GENERATED: Button consumes `recipeFamilies.control` — the
 * handwritten mirror table this file used to carry drifted (md font 13 vs the
 * recipe's 14, lg icon 18 vs 20) and is gone. `fontSize` is the recipe's px
 * number, not a font token.
 */
export type ButtonSizeRecipe = SizeRecipe;

export const buttonSizeRecipes: Record<string, ButtonSizeRecipe> = recipeFamilies.control.recipes;

export function resolveButtonSizeRecipe(
  size: SizeTokens | number | undefined,
  family: RecipeFamilyName = 'control',
): ButtonSizeRecipe {
  // Arbitrary numeric height: derive pad/font/icon/gap in ratio (the
  // non-enumerable escape the recipe reserves for `sizeRecipeFromHeight`).
  if (typeof size === 'number') {
    return sizeRecipeFromHeight(size, recipeFamilies[family]?.ratios);
  }
  return sizeRecipeForToken(size == null ? '$true' : String(size), { family });
}

/**
 * Density selects the recipe FAMILY, it does not subtract from the recipe:
 * control -> controlCompact, same heights, tighter ratios.
 * A hand-set delta is a second density writer and it drifts from the
 * generated table at every token but `$4` — it inverted at `$2`, where
 * `max(8, 7 - 2)` painted a compact Button WIDER than a comfortable one.
 */
export function buttonDensityFamily(family: RecipeFamilyName, densityTight: boolean): RecipeFamilyName {
  return densityTight ? 'controlCompact' : family;
}

/**
 * Tamagui size-token → px (circular variant still uses the token box).
 * Resolved from the live token scale — not a handwritten mirror of it.
 */
function sizeTokenPx(size: SizeTokens | number | undefined): number {
  if (typeof size === 'number') {
    return size;
  }
  if (size == null) {
    return MIN_PRESS_TARGET;
  }
  const resolved = getVariableValue(getSize(size));
  return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : MIN_PRESS_TARGET;
}

/** Role within an ActionBar / action region. */
export type ButtonActionRole = 'primary' | 'secondary' | 'chrome';

type IconLike = ReactNode | ComponentType<{ size?: number }>;

/** Many call sites pass Phosphor `Icon` (component) instead of `<Icon />`. */
function normalizeButtonIcon(icon: IconLike | undefined, iconSize: number): ReactNode {
  if (icon == null || icon === false) {
    return null;
  }
  if (isValidElement(icon)) {
    return icon;
  }
  if (typeof icon === 'function') {
    return createElement(icon, { size: iconSize });
  }
  if (typeof icon === 'object' && icon !== null && '$$typeof' in icon) {
    return createElement(icon as unknown as ComponentType<{ size?: number }>, { size: iconSize });
  }
  return icon;
}

const getButtonSized = (val: SizeTokens | number, { props }: VariantSpreadExtras<any>) => {
  if (!val || props.circular) {
    return;
  }
  const recipe = resolveButtonSizeRecipe(val);
  return {
    paddingHorizontal: recipe.paddingHorizontal,
    height: recipe.height,
    minHeight: recipe.height,
  };
};

const textAccentLow = {
  default: formButtonColors.textLow.base,
  hover: formButtonColors.textLow.hover,
  press: formButtonColors.textLow.active,
} as const;

/** TEXT-RIDES-TEXT: bare string/number children are legal only inside Text. */
const isBareTextChild = (child: unknown): child is string | number =>
  typeof child === 'string' || typeof child === 'number';

/**
 * TEXT-RIDES-TEXT (catalog arm): multi-child arrays are the trap — the
 * singleton auto-wrap misses `{label}{cond ? suffix : ""}` (TWO string
 * children), which web renders and native rejects ("Text strings must be
 * rendered within a <Text> component"), silently dropping the label. Each run
 * of adjacent bare string/number children coalesces into one concatenated
 * label handed to the same Text wrapper the singleton path uses; element
 * children pass through untouched, order preserved (keys via Children.toArray).
 */
function wrapBareTextChildren(
  children: ReturnType<typeof Children.toArray>,
  renderLabel: (label: string, key: string) => ReactNode,
): ReactNode[] {
  const out: ReactNode[] = [];
  let run: string | undefined;
  let runIndex = 0;
  const flushRun = () => {
    if (run !== undefined && run !== '') {
      out.push(renderLabel(run, `lc35-run-${runIndex++}`));
    }
    run = undefined;
  };
  for (const child of children) {
    if (isBareTextChild(child)) {
      run = (run ?? '') + String(child);
    } else {
      flushRun();
      out.push(child);
    }
  }
  flushRun();
  return out;
}

const dummyStore = new Store({ isValid: true });

export const ButtonFrame = styled(View, {
  name: 'Button',
  role: 'button',
  tabIndex: 0,
  cursor: 'pointer',
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'nowrap',
  flexDirection: 'row',
  backgroundColor: '$background',
  // Every button carries a 1px
  // border with a TRANSPARENT colour so filled and outlined share identical
  // box geometry — only the outlined variant paints `$borderColor`.
  borderColor: 'transparent',
  outlineWidth: 0,
  hoverStyle: {
    backgroundColor: '$backgroundHover',
  },
  focusStyle: { outlineWidth: 0 },
  variants: {
    outlined: {
      true: {
        backgroundColor: 'transparent',
        borderColor: '$borderColor',
        hoverStyle: { backgroundColor: 'transparent' },
        pressStyle: { backgroundColor: 'transparent' },
      },
    },
    selected: {
      true: {
        backgroundColor: '$backgroundPress',
        hoverStyle: { backgroundColor: '$backgroundPress' },
        pressStyle: { backgroundColor: '$backgroundPress' },
      },
    },
    circular: themeableVariants.circular,
    chromeless: themeableVariants.chromeless,
    // `styled(View)` inherits no variants, so without this the
    // `elevation={knobProps.elevation}` the frame passes below (and the
    // per-intent `Button: { elevation }` overrides in defaultIntents) were
    // silently dropped — the elevation knob never reached any Button. Same
    // token→shadow mapping the tamagui stacks use; `chromeless` still zeroes
    // the shadow (its shadowColor: transparent rides the later consumer prop).
    elevation: {
      '...size': getElevation,
      ':number': getElevation,
    },
    size: {
      '...size': getButtonSized,
    },
    disabled: {
      true: {
        pointerEvents: 'none',
      },
    },
  } as const,
  defaultVariants: {
    size: '$true' as any,
  },
});

/**
 * `variant` is Omitted, and that Omit IS the guard.
 *
 * `ButtonFrame` is `styled(View)` and declares only an `outlined` BOOLEAN, so
 * `variant="outlined"` was never read — it landed on the frame as an unread
 * prop and the button rendered FILLED. Because `TamaguiButtonProps` carries
 * `variant`, the inherited type advertised a channel this component ignores,
 * so 75 call sites across 29 files typechecked, rendered wrong, and said
 * nothing. Declaring the prop and dropping it on the floor is the lying API
 * this component refuses to ship.
 *
 * Omitting it turns every one of those call sites into a compile error instead
 * of a silent no-op, which is what stops the prop coming back. The house
 * channel is the `outlined` boolean.
 *
 * `@repo/ui`' Button still accepts `variant` and maps it
 * onto `outlined` — that shim is the documented raw-tamagui compat hatch, and
 * it declares the prop itself rather than inheriting it from here.
 */
export interface ButtonProps extends Omit<TamaguiButtonProps, 'form' | 'icon' | 'iconAfter' | 'variant'> {
  action?: 'submit' | 'reset';
  form?: AnyFormApi;
  loading?: boolean;
  accent?: boolean;
  error?: boolean;
  warning?: boolean;
  success?: boolean;
  skeleton?: boolean;
  outlined?: boolean;
  icon?: IconLike;
  iconAfter?: IconLike;
  compact?: boolean;
  /**
   * Spectrum ActionButton / Polaris `pressed`: selected is FILL, never
   * a second ring. Keyboard focus still paints the outline on the frame.
   */
  selected?: boolean;
  /**
   * Nested surfaces (dialog, overlay, calendar) paint `nestedControl`
   * (below the 44px chrome floor) and restore press with hitSlop. Does not
   * change page-level `circularPressFloor` (toolbar icon wells stay 44px).
   */
  nested?: boolean;
  /**
   * Structured label. Used when `children` is omitted.
   * Prefer `{ verb, noun }` over free-form strings for chrome actions.
   */
  verb?: string;
  noun?: string;
  /**
   * Marks the button for ActionBar one-primary DEV scans.
   * Defaults to `"primary"` when `accent` is set.
   */
  actionRole?: ButtonActionRole;
  /**
   * Hide / explain / upgrade — explains why the control is disabled.
   * With `disabled`, the control switches to `aria-disabled` (stays focusable,
   * presses swallowed) and renders the reason as visible adjacent text wired
   * via `aria-describedby` — works without hover (no
   * hover-only tooltips on disabled). Required in DEV when passing `disabled`
   * — bare `disabled` emits `bare-disabled`.
   */
  disabledReason?: string;
  /**
   * Where the visible reason renders relative to the control. `"below"`
   * (default) stacks it under the button — right for forms and vertical
   * layouts. `"inline"` puts it beside the button on the same line — for
   * toolbar/control rows, where a stacked reason breaks the row's shared
   * control height and wraps into cramped multi-line type.
   */
  disabledReasonPlacement?: 'below' | 'inline';
  /**
   * Opt-in to an explicit numeric `height` / `paddingHorizontal`. Required
   * when those props are numbers; without it DEV-warns `size-recipe-escape`
   * and the size recipe still wins.
   */
  sizeRecipeEscape?: string;
  /**
   * Size-recipe FAMILY: same heights, different ratios.
   * `controlCompact` tightens pad/font/icon/gap at the same height — a theme
   * opt-in, never a per-component tweak. Defaults to `control`.
   */
  recipeFamily?: RecipeFamilyName;
}

export function Button({
  children,
  action,
  form: formProp,
  loading,
  accent,
  error,
  warning,
  success,
  skeleton = false,
  outlined,
  disabled,
  theme,
  onPress,
  onKeyDown,
  tabIndex,
  icon,
  iconAfter,
  compact,
  selected,
  nested = false,
  circular,
  chromeless,
  verb,
  noun,
  actionRole,
  disabledReason,
  disabledReasonPlacement = 'below',
  sizeRecipeEscape,
  recipeFamily = 'control',
  height: heightProp,
  paddingHorizontal: paddingHorizontalProp,
  ...props
}: ButtonProps) {
  const { resolvedForm: formFromHook } = useFormField({ form: formProp });
  const resolvedForm = action ? formFromHook : undefined;

  warnBareDisabled({
    component: 'Button',
    id: typeof (props as { id?: string }).id === 'string' ? (props as { id?: string }).id : undefined,
    disabled: Boolean(disabled),
    disabledReason,
    // loading / form-invalid are derived — not a bare unexplained disable.
    skip: Boolean(loading),
  });
  warnPositiveTabIndex({
    component: 'Button',
    value: typeof tabIndex === 'number' ? tabIndex : undefined,
  });
  warnSizeRecipeEscape({
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    sizeRecipeEscape,
    component: 'Button',
    id: typeof (props as { id?: string }).id === 'string' ? (props as { id?: string }).id : undefined,
  });
  const sizeRecipeEscaped = typeof sizeRecipeEscape === 'string' && sizeRecipeEscape.trim().length > 0;
  const sizeRecipeEscapeOverride = sizeRecipeEscaped
    ? {
        ...(typeof heightProp === 'number' ? { height: heightProp } : undefined),
        ...(typeof paddingHorizontalProp === 'number' ? { paddingHorizontal: paddingHorizontalProp } : undefined),
      }
    : undefined;
  const passthroughSizeProps = {
    ...(typeof heightProp !== 'number' && heightProp != null ? { height: heightProp } : undefined),
    ...(typeof paddingHorizontalProp !== 'number' && paddingHorizontalProp != null
      ? { paddingHorizontal: paddingHorizontalProp }
      : undefined),
  };

  const { isValid } = useStore((resolvedForm?.store ?? dummyStore) as Store<{ isValid: boolean }>, (s) => ({
    isValid: s.isValid ?? true,
  }));

  const intent =
    (accent && 'accent') || (error && 'error') || (warning && 'warning') || (success && 'success') || undefined;
  // compact is density, not a size step — do not pass it through
  // useResolvedKnobs (size stays on the size axis). The PROP and the
  // density knob share one channel: both pick the recipe FAMILY, the same
  // way resolveKnobs picks it for every other control, so both land the
  // same padX and the internals stay recipe-generated.
  const { knobProps, control, text, disabledState } = useResolvedKnobs({
    intent,
    component: 'Button',
  });
  // Ring color resolved OUTSIDE the intent <Theme> wrapper below — the
  // page-scope `$outlineColor` literal (see focusVisibleStyle).
  const parentScopeTheme = useTheme();
  const pageOutlineColor = parentScopeTheme.outlineColor?.val as string | undefined;
  const hostAccentInk = useAccentOnSurface();
  const grouped = useControlGrouped();
  const sizeProp = (props as { size?: SizeTokens | number }).size;
  const resolvedSize = sizeProp ?? knobProps.sizeToken;
  const densityTight = compact !== undefined ? compact : knobProps.density === 'compact';
  const recipe = resolveButtonSizeRecipe(resolvedSize, buttonDensityFamily(recipeFamily, densityTight));
  const padX = recipe.paddingHorizontal;
  const radiusToken = knobProps.borderRadius.borderRadius;
  const radiusStop: SizeRecipeRadiusStop | undefined =
    typeof radiusToken === 'string'
      ? SIZE_RECIPE_RADIUS_TOKEN_TO_STOP[radiusToken as keyof typeof SIZE_RECIPE_RADIUS_TOKEN_TO_STOP]
      : undefined;
  const paintedRadius = resolveControlRadius(recipe, radiusStop ?? 'medium');
  const innerGap = paintedRadius.gap;
  if (skeleton) {
    return (
      <View
        {...knobProps.borderRadius}
        backgroundColor="$gray5"
        height={nested ? knobProps.nestedControl.px : recipe.height}
        width={120}
        opacity={0.5}
        {...props}
      />
    );
  }

  const isDisabled = disabled || loading || (action === 'submit' && resolvedForm && !isValid);

  const handlePress = (e: GestureResponderEvent) => {
    // Explained disable keeps the frame press-able (aria-disabled, focusable)
    // so the activation guard lives here, not in pointerEvents.
    if (isDisabled) {
      return;
    }
    if (action === 'submit' && resolvedForm) {
      void getFormSubmission(resolvedForm).submit();
    }
    if (action === 'reset' && resolvedForm) {
      getFormSubmission(resolvedForm).clearError();
      resolvedForm.reset();
    }
    onPress?.(e);
  };

  // Axiom 12 LEGIBLE FLOOR: the frame is a div[role=button], which gets no
  // native Enter/Space activation. Synthesize a real click so activation
  // bubbles exactly like a pointer press (composed asChild triggers included).
  const handleKeyDown = (e: KeyboardEvent) => {
    (onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
    if (e.defaultPrevented || e.repeat) {
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    e.preventDefault(); // stop Space scroll / double native synthesis
    if (isDisabled) {
      return;
    }
    (e.currentTarget as unknown as HTMLElement | null)?.click?.();
  };

  const activeThemeName = theme ?? intent;
  const hostScoped = <T extends object>(fragment: T): T =>
    Object.fromEntries(
      Object.entries(fragment).map(([key, value]) => [
        key,
        typeof value === 'string' && value.startsWith('$')
          ? (parentScopeTheme[value.slice(1) as keyof typeof parentScopeTheme]?.val ?? value)
          : value,
      ]),
    ) as T;
  // A solid-palette theme has no wash tier, so the wash and
  // its ink come from the host scope. Solid-intent ramps keep their own wash,
  // where `$color11` misses 4.5:1 (light warning 4.48, success 4.27) and the
  // hue's `$color12` text step clears it.
  const washOnHost = Boolean(isDisabled && activeThemeName && solidPaletteThemes.has(activeThemeName));
  const disabledSurface = washOnHost ? hostScoped(disabledState.surfaceKnobProps) : disabledState.surfaceKnobProps;
  const disabledText = washOnHost
    ? hostScoped(disabledState.textKnobProps)
    : activeThemeName && solidButtonIntents.has(activeThemeName) && disabledState.textKnobProps.color
      ? { ...disabledState.textKnobProps, color: '$color12' }
      : disabledState.textKnobProps;
  outlined = outlined ?? knobProps.outlined;
  const isLow = knobProps.textAccent === 'low';
  const isMedium = knobProps.textAccent === 'medium';
  const resolvedBorderWidth = knobProps.borderRadius.borderWidth;
  const [hovering, setHovering] = useState(false);
  const [pressing, setPressing] = useState(false);
  const handlePressIn = useCallback(() => {
    setPressing(true);
    if (isWeb) {
      const up = () => {
        setPressing(false);
      };
      document.addEventListener('pointerup', up, { once: true });
    }
  }, []);
  const handlePressOut = useCallback(() => {
    setPressing(false);
  }, []);
  const textColor = isLow
    ? pressing
      ? textAccentLow.press
      : hovering
        ? textAccentLow.hover
        : textAccentLow.default
    : isMedium
      ? formCommonColors.text
      : undefined;
  // The outlined+intent frame re-anchors to `$color11` below, which
  // reaches currentColor icons but NOT the label — SizableText re-resolves
  // `$color` from the solid intent sub-theme, the ON-FILL foreground
  // (measured 1.02–1.06:1 on the page in both schemes). At the default
  // textAccent (`high`, textColor undefined) the label must re-anchor to the
  // same readable text tier the frame uses.
  const outlinedIntentInk = Boolean(outlined && activeThemeName && solidButtonIntents.has(activeThemeName));
  // A solid-palette theme (accent) has no readable-on-page step at
  // all, `$color11` included, so an outlined one takes its ink from the host:
  // the accent that clears AA there, or host-scoped text under a textAccent.
  const outlinedOnHost = Boolean(outlined && activeThemeName && solidPaletteThemes.has(activeThemeName));
  const outlinedInk = outlinedOnHost ? hostAccentInk : outlinedIntentInk ? '$color11' : undefined;

  const resolvedRole: ButtonActionRole | undefined = actionRole ?? (accent ? 'primary' : undefined);
  const labelFromParts = children == null && verb != null ? formatActionLabel({ verb, noun }) : null;
  const resolvedChildren = children ?? labelFromParts;
  const ariaPressedProp = (props as { 'aria-pressed'?: boolean | 'true' | 'false' })['aria-pressed'];
  const isSelected = selected ?? (ariaPressedProp === true || ariaPressedProp === 'true' ? true : undefined);
  const selectedFill = Boolean(isSelected) && !isDisabled;
  const iconSize = nested
    ? Math.min(recipe.iconSize, Math.max(12, Math.round(knobProps.nestedControl.px * 0.45)))
    : recipe.iconSize;

  const renderLabelText = (label: string | number, key?: string) => (
    <SizableText
      key={key}
      userSelect="none"
      flexGrow={0}
      flexShrink={1}
      textOverflow="ellipsis"
      whiteSpace="nowrap"
      overflow="hidden"
      {...knobProps.body}
      {...(nested ? knobProps.label : { fontSize: recipe.fontSize })}
      {...(textColor
        ? outlinedOnHost
          ? hostScoped({ color: textColor })
          : { color: textColor }
        : outlinedInk
          ? { color: outlinedInk }
          : undefined)}
      // On the washed disabled chrome the label leaves the on-fill
      // foreground for the wash's AA ink (keepLabel keeps >=4.5:1).
      {...(isDisabled ? disabledText : undefined)}
      // Boards measure ink.weight on the TEXT NODE, never the frame. The
      // prop is restated after the spreads because SizableText's size
      // variant otherwise leaks 500/600 over it (a literal 400
      // here pinned the label and swallowed the fontWeight knob).
      fontWeight={knobProps.body.fontWeight}
      transition={knobProps.transition}>
      {label}
    </SizableText>
  );
  // TEXT-RIDES-TEXT: wrap ALL bare string/number children — the
  // array path (coalesced runs), not just the singleton case.
  const flattenedChildren = Array.isArray(resolvedChildren) ? Children.toArray(resolvedChildren) : null;
  const textContent = loading ? (
    <Spinner size="small" />
  ) : isBareTextChild(resolvedChildren) ? (
    renderLabelText(resolvedChildren)
  ) : flattenedChildren?.some(isBareTextChild) ? (
    wrapBareTextChildren(flattenedChildren, renderLabelText)
  ) : (
    resolvedChildren
  );

  const hasIcon = icon || iconAfter;
  const iconElement = icon ? <View flexShrink={0}>{normalizeButtonIcon(icon, iconSize)}</View> : null;
  const iconAfterElement = iconAfter ? <View flexShrink={0}>{normalizeButtonIcon(iconAfter, iconSize)}</View> : null;

  const explainedDisable = Boolean(disabledReason?.trim()) && Boolean(isDisabled);
  const generatedId = useId();
  const reasonId = explainedDisable ? `${(props as { id?: string }).id ?? generatedId}-disabled-reason` : undefined;
  const isCircular = Boolean(circular);
  const circularTokenPx = sizeTokenPx(resolvedSize);
  const visualPx = nested ? knobProps.nestedControl.px : recipe.height;
  // Circular tokens below 44 need an explicit box floor (circular variant also
  // sets maxWidth/maxHeight to the token). hitSlop covers native/touch leftovers.
  // Nested circulars skip this — they paint nestedControl and restore press
  // with slop. Page-level toolbar wells keep the 44px painted floor.
  const circularPressFloor =
    isCircular && circularTokenPx < MIN_PRESS_TARGET
      ? {
          width: MIN_PRESS_TARGET,
          height: MIN_PRESS_TARGET,
          minWidth: MIN_PRESS_TARGET,
          minHeight: MIN_PRESS_TARGET,
          maxWidth: MIN_PRESS_TARGET,
          maxHeight: MIN_PRESS_TARGET,
          hitSlop: pressTargetHitSlop(circularTokenPx),
        }
      : isCircular
        ? { minWidth: MIN_PRESS_TARGET, minHeight: MIN_PRESS_TARGET }
        : undefined;
  const nestedFloor = nested
    ? {
        height: visualPx,
        minHeight: visualPx,
        maxHeight: visualPx,
        ...(isCircular
          ? {
              width: visualPx,
              minWidth: visualPx,
              maxWidth: visualPx,
              borderRadius: 100000,
            }
          : {}),
        'data-nested-px': String(visualPx),
        ...pressSlopProps(visualPx, true),
      }
    : undefined;
  const pageSlop = !nested && !isCircular && !grouped ? pressSlopProps(visualPx, true) : undefined;
  // Knob scope (supersedes the old inline squaring):
  // `circular` is an explicit consumer SHAPE eject, so the tamagui
  // `circular` variant's ~100000 radius keeps winning over
  // `knobProps.borderRadius` — INCLUDING at `borderRadius: none`. A circular
  // Button (favorite heart, Pagination prev/next, toolbar icon wells) keeps
  // its circle in the square world, the same way consumer `{...props}` win
  // last per STD-EJECT-LAST; every other channel on the frame (size,
  // elevation, border width, motion, disabled wash) still follows the knobs,
  // and the default/outlined frame goes fully square at `none` via the knob
  // fragment below.
  const selectedHoverFill = selectedFill
    ? outlined
      ? '$backgroundHover'
      : '$backgroundPress'
    : outlined
      ? 'transparent'
      : '$backgroundHover';
  const selectedPressFill = selectedFill ? '$backgroundPress' : outlined ? 'transparent' : '$backgroundPress';
  const restFill = selectedFill ? (outlined ? '$background' : '$backgroundPress') : undefined;
  const buttonElement = (
    <ButtonFrame
      // An explained disable is aria-disabled (focusable, press
      // swallowed in handlePress) instead of a natively disabled dead end.
      disabled={explainedDisable ? false : isDisabled || false}
      opacity={1}
      transition={knobProps.transition}
      {...knobProps.borderRadius}
      {...(radiusStop === 'medium' || radiusStop == null ? { borderRadius: paintedRadius.radius } : undefined)}
      borderWidth={resolvedBorderWidth}
      // The borderRadius knob fragment carries `$borderColor` for
      // bordered chrome, but a filled Button's edge is transparent by contract
      // (reference §6.1) — same-width invisible border keeps filled and
      // outlined boxes identical without the filled one showing a ring.
      borderColor={outlined ? '$borderColor' : 'transparent'}
      size={resolvedSize}
      {...(chromeless ? undefined : knobProps.elevationChrome)}
      elevation={knobProps.elevation}
      // The frame's `outlined` variant declares only a `true` branch, so a
      // literal `false` is not consumed and React receives it as a DOM
      // attribute ("Received `false` for a non-boolean attribute"). Every
      // knob-driven caller passes `knobProps.outlined`, which is a real
      // boolean, so this fired on most screens.
      outlined={outlined || undefined}
      circular={!nested && isCircular ? true : undefined}
      chromeless={selectedFill ? false : chromeless}
      selected={selectedFill || undefined}
      {...(!isCircular || nested
        ? {
            // A nested circle skips the tamagui `circular` variant, which is
            // what zeroes a page circle's padding; padX inside its fixed
            // nestedControl box leaves the label 0px and widens the circle
            // into a pill.
            paddingHorizontal: isCircular ? 0 : padX,
            height: visualPx,
            minHeight: visualPx,
          }
        : undefined)}
      {...(restFill ? { backgroundColor: restFill } : undefined)}
      // Solid-intent sub-themes carry the on-fill foreground as `$color`;
      // outlined frames sit on the page, so re-anchor inherited
      // text/icon color (currentColor) to the hue's readable text tier.
      {...(outlinedInk ? { color: outlinedInk } : undefined)}
      // DISABLED-VISIBLE: keepLabel washes the chrome (muted fill/
      // border) while label/glyphs re-anchor to the lowest AA text tier
      // (`color` inherits into currentColor icons); dimWhole dims the
      // button as its own assembly. Replaces the old hardcoded 0.5
      // whole-dim that dropped label contrast under AA.
      {...(isDisabled
        ? {
            ...disabledSurface,
            ...disabledText,
            ...disabledState.assemblyKnobProps,
          }
        : undefined)}
      {...(isLow
        ? {
            onHoverIn: () => {
              setHovering(true);
            },
            onHoverOut: () => {
              setHovering(false);
            },
            onPressIn: handlePressIn,
            onPressOut: handlePressOut,
          }
        : undefined)}
      hoverStyle={{
        backgroundColor: selectedHoverFill,
        ...(outlined && !selectedFill ? { borderColor: '$borderColorHover' } : undefined),
        ...control.hoverKnobProps,
        ...text.hoverKnobProps,
        ...(selectedFill ? { backgroundColor: selectedHoverFill } : undefined),
      }}
      pressStyle={{
        backgroundColor: selectedPressFill,
        ...(outlined && !selectedFill ? { borderColor: '$borderColorPress' } : undefined),
        ...control.pressKnobProps,
        ...text.pressKnobProps,
        ...(selectedFill ? { backgroundColor: selectedPressFill } : undefined),
      }}
      focusStyle={{ outlineWidth: 0 }}
      // House keyboard ring (≥2px `$outlineColor`) on the
      // whole painted frame. Rest and mouse-focus paint none. Parent-scope
      // `$outlineColor` literal: intent buttons re-theme the frame, and those
      // sub-themes derive a ring for their own inverted surfaces — invisible
      // on the page the ring actually draws on (measured 1.17:1 on the accent
      // pagination button).
      focusVisibleStyle={ensureFocusVisibleRing({
        ...control.focusVisibleKnobProps,
        ...(pageOutlineColor ? { outlineColor: pageOutlineColor } : undefined),
      })}
      onPress={handlePress}
      {...(isWeb ? { onKeyDown: handleKeyDown as unknown as () => void } : undefined)}
      {...(tabIndex != null ? { tabIndex } : undefined)}
      gap={hasIcon && (resolvedChildren || textContent) ? innerGap : undefined}
      // STD-EJECT-LAST: knob fragments and internal defaults (radius/size/
      // elevation/gap above) sit BEFORE the consumer spread so `{...props}`
      // stays the one styling eject. The spreads after it are not defaults:
      // the press-target floor must beat the `circular` variant expansion
      // (which rides the consumer's own `circular` prop inside `{...props}`),
      // the identity declaration licenses that same shape eject so the
      // radius:none sweep does not flatten circles (owner ruling 2026-08-13),
      // and the explained-disable / grouped branches are state & group
      // contracts, not restylable chrome.
      {...props}
      {...passthroughSizeProps}
      {...sizeRecipeEscapeOverride}
      {...(nested ? nestedFloor : isCircular ? circularPressFloor : pageSlop)}
      {...(selectedFill && !isDisabled
        ? {
            backgroundColor: restFill,
            hoverStyle: {
              ...control.hoverKnobProps,
              ...text.hoverKnobProps,
              backgroundColor: selectedHoverFill,
            },
            pressStyle: {
              ...control.pressKnobProps,
              ...text.pressKnobProps,
              backgroundColor: selectedPressFill,
            },
          }
        : undefined)}
      {...(isCircular && !grouped ? radiusClassProps('R-IDENTITY', 'circular Button') : undefined)}
      {...(explainedDisable
        ? {
            // No `title`: hover-only reveals are banned on disabled controls —
            // the reason renders as visible adjacent text.
            'aria-disabled': true,
            ...(isWeb ? { 'aria-describedby': reasonId } : { accessibilityHint: disabledReason }),
            cursor: 'not-allowed',
            // Hover/press keep the washed chrome — an aria-disabled
            // control must not light up like a pressable one.
            hoverStyle: {
              backgroundColor: outlined ? 'transparent' : '$background',
              ...disabledSurface,
            },
            pressStyle: {
              backgroundColor: outlined ? 'transparent' : '$background',
              ...disabledSurface,
            },
            'data-mp-disabled-explained': 'true',
          }
        : undefined)}
      {...(grouped
        ? {
            borderWidth: 0,
            borderRadius: 0,
            elevation: undefined,
            height: '100%',
          }
        : undefined)}
      {...(resolvedRole ? { 'data-mp-action-role': resolvedRole } : undefined)}
      data-mp-button-height={String(
        nested ? visualPx : isCircular ? Math.max(circularTokenPx, MIN_PRESS_TARGET) : visualPx,
      )}
      data-mp-density={densityTight ? 'compact' : 'comfortable'}
      {...(selectedFill ? { 'aria-pressed': true, 'data-mp-selected': 'true' } : undefined)}>
      {iconElement}
      {textContent}
      {iconAfterElement}
    </ButtonFrame>
  );

  const themedButton = activeThemeName ? <Theme name={activeThemeName}>{buttonElement}</Theme> : buttonElement;

  // Explain affordance: visible reason adjacent to the control —
  // discoverable by pointer, touch, keyboard, and SR (aria-describedby)
  // without any hover interaction (Axiom 12). "below" stacks (forms);
  // "inline" keeps toolbar rows on one shared control line, where the
  // stacked reason wrapped into cramped multi-line type under the button.
  // The reason stays OUTSIDE the intent Theme: it is T-HELPER copy on the
  // host surface, and inside it `$color11` is the intent's on-fill ramp
  // (1.17:1 on the light page under accent).
  const reasonText = explainedDisable ? (
    <SizableText id={reasonId} size="$2" color={formCommonColors.muted} flexShrink={1} data-mp-disabled-reason="true">
      {disabledReason}
    </SizableText>
  ) : null;
  if (!explainedDisable) {
    return themedButton;
  }
  return disabledReasonPlacement === 'inline' ? (
    <XStack gap="$2" alignItems="center" flexShrink={1} data-mp-disabled-reason-wrapper="true">
      {themedButton}
      {reasonText}
    </XStack>
  ) : (
    <YStack gap="$1" flexShrink={1} data-mp-disabled-reason-wrapper="true">
      {themedButton}
      {reasonText}
    </YStack>
  );
}

Button.Icon = TamaguiButton.Icon;
Button.Text = SizableText;
