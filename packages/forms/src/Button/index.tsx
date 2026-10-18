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
} from '@repo/theme';
import type { SizeRecipe, SizeRecipeFamilyName, SizeRecipeRadiusStop } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import { getElevation, themeableVariants } from '@tamagui/stacks';
import type { SizeTokens, VariantSpreadExtras } from '@tamagui/web';
import { Store, useSelector } from '@tanstack/react-store';
import { Children, createElement, isValidElement, useCallback, useId, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  Button as TamaguiButton,
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
import type { ButtonProps as TamaguiButtonProps } from 'tamagui';

import { formatActionLabel } from '../action-label';
import { getFormSubmission } from '../Form/submission-controller';
import { formButtonColors, formCommonColors } from '../shared/color-ramps';
import { warnBareDisabled, warnPositiveTabIndex, warnSizeRecipeEscape } from '../shared/dev-warn';
import { useControlGrouped } from '../shared/group-context';
import { pressSlopProps } from '../shared/press-slop-props';
// oxlint-disable-next-line import/no-cycle -- the cycle runs through shared/utils and files outside this directory; it is reported for the owner of those paths
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

// oxlint-disable-next-line react-doctor/only-export-components -- public recipe table consumed by other packages through this module path
export const buttonSizeRecipes: Record<string, ButtonSizeRecipe> = recipeFamilies.control.recipes;

const isNumber = <T,>(value: T): value is T & number => typeof value === 'number';

const isString = (value: unknown): value is string => typeof value === 'string';

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

// oxlint-disable-next-line react-doctor/only-export-components -- public recipe resolver consumed by other packages through this module path
export const resolveButtonSizeRecipe = (
  size: SizeTokens | number | undefined,
  family: SizeRecipeFamilyName = 'control',
): ButtonSizeRecipe => {
  // Arbitrary numeric height: derive pad/font/icon/gap in ratio (the
  // non-enumerable escape the recipe reserves for `sizeRecipeFromHeight`).
  if (isNumber(size)) {
    return sizeRecipeFromHeight(size, recipeFamilies[family]?.ratios);
  }
  return sizeRecipeForToken(size == null ? '$true' : String(size), { family });
};

/**
 * Density selects the recipe FAMILY, it does not subtract from the recipe:
 * control -> controlCompact, same heights, tighter ratios.
 * A hand-set delta is a second density writer and it drifts from the
 * generated table at every token but `$4` — it inverted at `$2`, where
 * `max(8, 7 - 2)` painted a compact Button WIDER than a comfortable one.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public density helper consumed by other packages through this module path
export const buttonDensityFamily = (family: SizeRecipeFamilyName, densityTight: boolean): SizeRecipeFamilyName =>
  densityTight ? 'controlCompact' : family;

/**
 * Tamagui size-token → px (circular variant still uses the token box).
 * Resolved from the live token scale — not a handwritten mirror of it.
 */
const sizeTokenPx = (size: SizeTokens | number | undefined): number => {
  if (isNumber(size)) {
    return size;
  }
  if (size == null) {
    return MIN_PRESS_TARGET;
  }
  const resolved: unknown = getVariableValue(getSize(size));
  return isNumber(resolved) && Number.isFinite(resolved) ? resolved : MIN_PRESS_TARGET;
};

/** Role within an ActionBar / action region. */
export type ButtonActionRole = 'primary' | 'secondary' | 'chrome';

type IconLike = ReactNode | ComponentType<{ size?: number }>;

/** Many call sites pass Phosphor `Icon` (component) instead of `<Icon />`. */
type IconComponent = ComponentType<{ size?: number }>;

/** Plain function components, or memo/forwardRef objects (identified by their `$$typeof` tag). */
const isIconComponent = (icon: IconLike): icon is IconComponent => {
  if (typeof icon === 'function') {
    return true;
  }
  return typeof icon === 'object' && icon !== null && '$$typeof' in icon;
};

const normalizeButtonIcon = (icon: IconLike | undefined, iconSize: number): ReactNode => {
  if (icon == null || icon === false) {
    return null;
  }
  if (isValidElement(icon)) {
    return icon;
  }
  if (isIconComponent(icon)) {
    return createElement(icon, { size: iconSize });
  }
  return icon;
};

const sizedFragment = (val: SizeTokens | number) => {
  const recipe = resolveButtonSizeRecipe(val);
  return {
    paddingHorizontal: recipe.paddingHorizontal,
    height: recipe.height,
    minHeight: recipe.height,
  };
};

const getButtonSized = (val: SizeTokens | number, { props }: VariantSpreadExtras<{ circular?: boolean }>) =>
  val === 0 || val === '' || props.circular === true ? undefined : sizedFragment(val);

const textAccentLow = {
  default: formButtonColors.textLow.base,
  hover: formButtonColors.textLow.hover,
  press: formButtonColors.textLow.active,
} as const;

/** Circular tokens below 44 need an explicit box floor; hitSlop covers native/touch leftovers. */
const circularFloorFor = (tokenPx: number) =>
  tokenPx < MIN_PRESS_TARGET
    ? {
        width: MIN_PRESS_TARGET,
        height: MIN_PRESS_TARGET,
        minWidth: MIN_PRESS_TARGET,
        minHeight: MIN_PRESS_TARGET,
        maxWidth: MIN_PRESS_TARGET,
        maxHeight: MIN_PRESS_TARGET,
        hitSlop: pressTargetHitSlop(tokenPx),
      }
    : { minWidth: MIN_PRESS_TARGET, minHeight: MIN_PRESS_TARGET };

const BACKGROUND_TOKEN = '$background';
const BACKGROUND_HOVER_TOKEN = '$backgroundHover';
const BACKGROUND_PRESS_TOKEN = '$backgroundPress';

const hoverFillFor = (selectedFill: boolean, outlined: boolean) => {
  if (selectedFill) {
    return outlined ? BACKGROUND_HOVER_TOKEN : BACKGROUND_PRESS_TOKEN;
  }
  return outlined ? 'transparent' : BACKGROUND_HOVER_TOKEN;
};

const lowAccentInk = (pressing: boolean, hovering: boolean) => {
  if (pressing) {
    return textAccentLow.press;
  }
  return hovering ? textAccentLow.hover : textAccentLow.default;
};

/** TEXT-RIDES-TEXT: bare string/number children are legal only inside Text. */
const isBareTextChild = <T,>(child: T): child is T & (string | number) =>
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
const wrapBareTextChildren = (
  children: ReturnType<typeof Children.toArray>,
  renderLabel: (label: string, key: string) => ReactNode,
): ReactNode[] => {
  const out: ReactNode[] = [];
  let run: string | null = null;
  let runIndex = 0;
  const flushRun = () => {
    if (run !== null && run !== '') {
      out.push(renderLabel(run, `lc35-run-${runIndex}`));
      runIndex += 1;
    }
    run = null;
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
};

const dummyStore = new Store({ isValid: true });

interface ThemeToken {
  val?: string;
}

/** The Tamagui theme looked up by token name; entries are resolved Variables carrying `val`. */
const useThemeTokens = (): Readonly<Record<string, ThemeToken | undefined>> => useTheme();

const RADIUS_STOP_BY_TOKEN = new Map<string, SizeRecipeRadiusStop>(Object.entries(SIZE_RECIPE_RADIUS_TOKEN_TO_STOP));

const INTENT_PRIORITY = ['accent', 'error', 'warning', 'success'] as const;

// oxlint-disable-next-line react-doctor/only-export-components -- the styled frame is part of this module's public surface (consumed by @repo/ui and tests)
export const ButtonFrame = styled(View, {
  name: 'Button',
  role: 'button',
  tabIndex: 0,
  cursor: 'pointer',
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'nowrap',
  flexDirection: 'row',
  backgroundColor: BACKGROUND_TOKEN,
  // Every button carries a 1px
  // border with a TRANSPARENT colour so filled and outlined share identical
  // box geometry — only the outlined variant paints `$borderColor`.
  borderColor: 'transparent',
  outlineWidth: 0,
  hoverStyle: {
    backgroundColor: BACKGROUND_HOVER_TOKEN,
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
        backgroundColor: BACKGROUND_PRESS_TOKEN,
        hoverStyle: { backgroundColor: BACKGROUND_PRESS_TOKEN },
        pressStyle: { backgroundColor: BACKGROUND_PRESS_TOKEN },
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
    size: '$true',
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
type ButtonInheritedProps = Omit<Omit<TamaguiButtonProps, 'form' | 'icon'>, 'iconAfter' | 'variant'>;

export interface ButtonProps extends ButtonInheritedProps {
  children?: ReactNode;
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
  recipeFamily?: SizeRecipeFamilyName;
}

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- one frame whose chrome (intent, disabled wash, density, circular/nested floors, grouping) all derive from the same knob resolution; splitting it would thread ~40 locals through helpers
export const Button = ({
  children,
  action,
  form: formProp,
  loading,
  accent,
  error,
  warning,
  success,
  skeleton = false,
  outlined: outlinedProp,
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component-level note
}: ButtonProps) => {
  const { resolvedForm: formFromHook } = useFormField({ form: formProp });
  const resolvedForm = action ? formFromHook : undefined;

  // Hooks stay above the skeleton early return so the hook order is stable across renders.
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
  const generatedId = useId();

  warnBareDisabled({
    component: 'Button',
    id: props.id,
    disabled: Boolean(disabled),
    disabledReason,
    // loading / form-invalid are derived — not a bare unexplained disable.
    skip: Boolean(loading),
  });
  warnPositiveTabIndex({
    component: 'Button',
    value: isNumber(tabIndex) ? tabIndex : undefined,
  });
  warnSizeRecipeEscape({
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    sizeRecipeEscape,
    component: 'Button',
    id: props.id,
  });
  const sizeRecipeEscaped = sizeRecipeEscape !== undefined && sizeRecipeEscape.trim().length > 0;
  const sizeRecipeEscapeOverride = sizeRecipeEscaped
    ? {
        ...(isNumber(heightProp) ? { height: heightProp } : undefined),
        ...(isNumber(paddingHorizontalProp) ? { paddingHorizontal: paddingHorizontalProp } : undefined),
      }
    : undefined;
  const passthroughSizeProps = {
    ...(!isNumber(heightProp) && heightProp != null ? { height: heightProp } : undefined),
    ...(!isNumber(paddingHorizontalProp) && paddingHorizontalProp != null
      ? { paddingHorizontal: paddingHorizontalProp }
      : undefined),
  };

  const isValid = useSelector(resolvedForm?.store ?? dummyStore, (s) => s.isValid ?? true);

  const intentFlags = { accent, error, warning, success };
  const intent = INTENT_PRIORITY.find((name) => intentFlags[name] === true);
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
  const parentScopeTheme = useThemeTokens();
  const pageOutlineColor = parentScopeTheme.outlineColor?.val;
  const hostAccentInk = useAccentOnSurface();
  const grouped = useControlGrouped();
  const sizeProp = props.size;
  const resolvedSize = sizeProp ?? knobProps.sizeToken;
  const densityTight = compact ?? knobProps.density === 'compact';
  const recipe = resolveButtonSizeRecipe(resolvedSize, buttonDensityFamily(recipeFamily, densityTight));
  const padX = recipe.paddingHorizontal;
  const radiusStop: SizeRecipeRadiusStop | undefined = RADIUS_STOP_BY_TOKEN.get(knobProps.borderRadius.borderRadius);
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

  const formInvalid = action === 'submit' && resolvedForm != null && !isValid;
  const isDisabled = disabled === true || loading === true || formInvalid;

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
    // SAFETY: the frame only receives React keyboard events on web, which carry the same key/repeat/defaultPrevented fields the DOM event does.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tamagui types onKeyDown with React's event; this handler is typed with the DOM event it actually dispatches
    (onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
    if (e.defaultPrevented || e.repeat) {
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    // Stop Space scroll / double native synthesis.
    e.preventDefault();
    if (isDisabled) {
      return;
    }
    const frame = e.currentTarget;
    if (frame instanceof HTMLElement) {
      frame.click();
    }
  };

  const activeThemeName = theme ?? intent;
  // '' behaves like no theme: it is not a real theme name.
  const themeKey = hasText(activeThemeName) ? activeThemeName : undefined;
  const hostScoped = <T extends object>(fragment: T): T =>
    // SAFETY: only string values that name a `$token` are swapped for their resolved paint; every key is kept, so the result has the same shape as the input.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries erases the key types of the mapped fragment
    Object.fromEntries(
      Object.entries(fragment).map(([key, value]) => [
        key,
        isString(value) && value.startsWith('$') ? (parentScopeTheme[value.slice(1)]?.val ?? value) : value,
      ]),
    ) as T;
  // A solid-palette theme has no wash tier, so the wash and
  // its ink come from the host scope. Solid-intent ramps keep their own wash,
  // where `$color11` misses 4.5:1 (light warning 4.48, success 4.27) and the
  // hue's `$color12` text step clears it.
  const washOnHost = isDisabled && themeKey !== undefined && solidPaletteThemes.has(themeKey);
  const disabledSurface = washOnHost ? hostScoped(disabledState.surfaceKnobProps) : disabledState.surfaceKnobProps;
  const solidIntentInk =
    themeKey !== undefined && solidButtonIntents.has(themeKey) && Boolean(disabledState.textKnobProps.color);
  const solidIntentDisabledText = solidIntentInk ? { ...disabledState.textKnobProps, color: '$color12' } : undefined;
  const disabledText = washOnHost
    ? hostScoped(disabledState.textKnobProps)
    : (solidIntentDisabledText ?? disabledState.textKnobProps);
  const outlined = outlinedProp ?? knobProps.outlined;
  const isLow = knobProps.textAccent === 'low';
  const isMedium = knobProps.textAccent === 'medium';
  const resolvedBorderWidth = knobProps.borderRadius.borderWidth;
  const mediumInk = isMedium ? formCommonColors.text : undefined;
  const textColor = isLow ? lowAccentInk(pressing, hovering) : mediumInk;
  // The outlined+intent frame re-anchors to `$color11` below, which
  // reaches currentColor icons but NOT the label — SizableText re-resolves
  // `$color` from the solid intent sub-theme, the ON-FILL foreground
  // (measured 1.02–1.06:1 on the page in both schemes). At the default
  // textAccent (`high`, textColor undefined) the label must re-anchor to the
  // same readable text tier the frame uses.
  const outlinedIntentInk = outlined && themeKey !== undefined && solidButtonIntents.has(themeKey);
  // A solid-palette theme (accent) has no readable-on-page step at
  // all, `$color11` included, so an outlined one takes its ink from the host:
  // the accent that clears AA there, or host-scoped text under a textAccent.
  const outlinedOnHost = outlined && themeKey !== undefined && solidPaletteThemes.has(themeKey);
  const intentInk = outlinedIntentInk ? '$color11' : undefined;
  const outlinedInk = outlinedOnHost ? hostAccentInk : intentInk;

  const resolvedRole: ButtonActionRole | undefined = actionRole ?? (accent ? 'primary' : undefined);
  const labelFromParts = children == null && verb != null ? formatActionLabel({ verb, noun }) : null;
  const resolvedChildren: ReactNode = children ?? labelFromParts;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- the type-aware linter cannot resolve the inherited Tamagui aria prop type (tsc types it); the value is only compared against literals below
  const ariaPressedProp = props['aria-pressed'];
  const isSelected = selected ?? (ariaPressedProp === true || ariaPressedProp === 'true' ? true : undefined);
  const selectedFill = Boolean(isSelected) && !isDisabled;
  const iconSize = nested
    ? Math.min(recipe.iconSize, Math.max(12, Math.round(knobProps.nestedControl.px * 0.45)))
    : recipe.iconSize;

  // Label ink: an explicit text-accent ink wins (host-scoped on a solid palette); otherwise
  // an outlined intent frame re-anchors the label to its readable tier.
  const textColorFragment = outlinedOnHost ? hostScoped({ color: textColor }) : { color: textColor };
  const outlinedInkFragment = hasText(outlinedInk) ? { color: outlinedInk } : undefined;
  const labelColorFragment = textColor === undefined ? outlinedInkFragment : textColorFragment;

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
      {...labelColorFragment}
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
  // oxlint-disable-next-line react/no-react-children -- toArray assigns the stable keys the coalesced label runs rely on
  const flattenedChildren = Array.isArray(resolvedChildren) ? Children.toArray(resolvedChildren) : null;
  const renderTextContent = (): ReactNode => {
    if (loading) {
      return <Spinner size="small" />;
    }
    if (isBareTextChild(resolvedChildren)) {
      return renderLabelText(resolvedChildren);
    }
    if (flattenedChildren?.some(isBareTextChild)) {
      return wrapBareTextChildren(flattenedChildren, renderLabelText);
    }
    return resolvedChildren;
  };
  const textContent = renderTextContent();

  const hasIconStart = Boolean(icon);
  const hasIconEnd = Boolean(iconAfter);
  const hasIcon = hasIconStart || hasIconEnd;
  const hasContent = Boolean(resolvedChildren) || Boolean(textContent);
  const iconElement = hasIconStart ? <View flexShrink={0}>{normalizeButtonIcon(icon, iconSize)}</View> : null;
  const iconAfterElement = hasIconEnd ? <View flexShrink={0}>{normalizeButtonIcon(iconAfter, iconSize)}</View> : null;

  const explainedDisable = Boolean(disabledReason?.trim()) && isDisabled;
  const reasonId = explainedDisable ? `${props.id ?? generatedId}-disabled-reason` : undefined;
  const isCircular = Boolean(circular);
  const circularTokenPx = sizeTokenPx(resolvedSize);
  const visualPx = nested ? knobProps.nestedControl.px : recipe.height;
  // Circular tokens below 44 need an explicit box floor (circular variant also
  // sets maxWidth/maxHeight to the token). hitSlop covers native/touch leftovers.
  // Nested circulars skip this — they paint nestedControl and restore press
  // with slop. Page-level toolbar wells keep the 44px painted floor.
  const circularPressFloor = isCircular ? circularFloorFor(circularTokenPx) : undefined;
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
              borderRadius: 100_000,
            }
          : undefined),
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
  const selectedHoverFill = hoverFillFor(selectedFill, outlined);
  const selectedPressFill = !selectedFill && outlined ? 'transparent' : BACKGROUND_PRESS_TOKEN;
  const selectedRestFill = outlined ? BACKGROUND_TOKEN : BACKGROUND_PRESS_TOKEN;
  const restFill = selectedFill ? selectedRestFill : undefined;
  const floorProps = nested ? nestedFloor : (circularPressFloor ?? pageSlop);
  const buttonHeightPx = nested || !isCircular ? visualPx : Math.max(circularTokenPx, MIN_PRESS_TARGET);
  // SAFETY: the frame is a div on web, so it dispatches DOM key events; tamagui's View props only type the native zero-arg signature.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- bridging the DOM-event handler to the View prop signature
  const webKeyDownProps = { onKeyDown: handleKeyDown as unknown as () => void };
  const buttonElement = (
    <ButtonFrame
      // An explained disable is aria-disabled (focusable, press
      // swallowed in handlePress) instead of a natively disabled dead end.
      disabled={explainedDisable ? false : isDisabled}
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
      {...(chromeless === undefined || chromeless === false ? knobProps.elevationChrome : undefined)}
      elevation={knobProps.elevation}
      // The frame's `outlined` variant declares only a `true` branch, so a
      // literal `false` is not consumed and React receives it as a DOM
      // attribute ("Received `false` for a non-boolean attribute"). Every
      // knob-driven caller passes `knobProps.outlined`, which is a real
      // boolean, so this fired on most screens.
      outlined={outlined ? true : undefined}
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
      {...outlinedInkFragment}
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
        ...(hasText(pageOutlineColor) ? { outlineColor: pageOutlineColor } : undefined),
      })}
      onPress={handlePress}
      {...(isWeb ? webKeyDownProps : undefined)}
      {...(tabIndex == null ? undefined : { tabIndex })}
      gap={hasIcon && hasContent ? innerGap : undefined}
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
      {...floorProps}
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
              backgroundColor: outlined ? 'transparent' : BACKGROUND_TOKEN,
              ...disabledSurface,
            },
            pressStyle: {
              backgroundColor: outlined ? 'transparent' : BACKGROUND_TOKEN,
              ...disabledSurface,
            },
            'data-mp-disabled-explained': 'true',
          }
        : undefined)}
      {...(grouped
        ? {
            borderWidth: 0,
            borderRadius: 0,
            // oxlint-disable-next-line sonarjs/no-undefined-assignment -- must override the knob elevation set earlier on the frame; omitting the key would keep it
            elevation: undefined,
            height: '100%',
          }
        : undefined)}
      {...(resolvedRole === undefined ? undefined : { 'data-mp-action-role': resolvedRole })}
      data-mp-button-height={String(buttonHeightPx)}
      data-mp-density={densityTight ? 'compact' : 'comfortable'}
      {...(selectedFill ? { 'aria-pressed': true, 'data-mp-selected': 'true' } : undefined)}>
      {iconElement}
      {textContent}
      {iconAfterElement}
    </ButtonFrame>
  );

  const themedButton = themeKey === undefined ? buttonElement : <Theme name={themeKey}>{buttonElement}</Theme>;

  // Explain affordance: visible reason adjacent to the control —
  // discoverable by pointer, touch, keyboard, and SR (aria-describedby)
  // without any hover interaction (Axiom 12). "below" stacks (forms);
  // "inline" keeps toolbar rows on one shared control line, where the
  // stacked reason wrapped into cramped multi-line type under the button.
  // The reason stays OUTSIDE the intent Theme: it is T-HELPER copy on the
  // host surface, and inside it `$color11` is the intent's on-fill ramp
  // (1.17:1 on the light page under accent).
  const reasonText = explainedDisable ? (
    <SizableText
      id={reasonId}
      size="$2"
      color={formCommonColors.muted}
      flexShrink={1}
      data-mp-disabled-reason="true">
      {disabledReason}
    </SizableText>
  ) : null;
  if (!explainedDisable) {
    return themedButton;
  }
  return disabledReasonPlacement === 'inline' ? (
    <XStack
      gap="$2"
      alignItems="center"
      flexShrink={1}
      data-mp-disabled-reason-wrapper="true">
      {themedButton}
      {reasonText}
    </XStack>
  ) : (
    <YStack
      gap="$1"
      flexShrink={1}
      data-mp-disabled-reason-wrapper="true">
      {themedButton}
      {reasonText}
    </YStack>
  );
};

Button.Icon = TamaguiButton.Icon;
Button.Text = SizableText;
