import { CaretDownIcon } from '@phosphor-icons/react';
import { isWeb } from '@repo/platform';
import {
  GroupPositionContext,
  MIN_PRESS_TARGET,
  devWarn,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  stackEdgeRadius,
  useAccentTintedSurface,
  useGroupPosition,
  useLegibleInkOn,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
  type GroupPosition,
  transitionProps,
} from '@repo/theme';
import type { ReactNode } from 'react';
import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';
import { forwardRef } from 'react';
// tamagui 2.0.0-rc dropped the StackProps alias; YStackProps is the same shape.
import type { SizeTokens, YStackProps as StackProps, TamaguiElement } from 'tamagui';
import {
  Accordion as TamaguiAccordion,
  Text,
  View,
  YStack,
  getTokens,
  getVariableValue,
  withStaticProperties,
} from 'tamagui';

import { AnimateHeight } from '../AnimateHeight';
import { componentColors } from '../componentColors';
import { themed } from '../icons/themed';
import { wrapBareTextChildren } from '../shared/textRidesText';

// ── Types ─────────────────────────────────────────────────────

export type AccordionVariant = 'plain' | 'card';
export type AccordionType = 'single' | 'multiple';

interface AccordionCommonProps extends Omit<StackProps, 'onChange' | 'size'> {
  /** Visual variant: "plain" = edge-to-edge divider rows, "card" = each item on its own surface */
  variant?: AccordionVariant;
  /** Disable every item */
  disabled?: boolean;
  /**
   * Compact density. Steps space (and the paired size step the density
   * recipe owns) down one level. Distinct from `size` — density is tightness,
   * size is the control scale. Nested accordions always compact.
   */
  compact?: boolean;
  /** Size-knob override (control height + label type). Not a density switch. */
  size?: SizeTokens;
  children?: ReactNode;
}

export interface AccordionSingleModeProps extends AccordionCommonProps {
  /** Only one item open at a time (default) */
  type?: 'single';
  /** Controlled open item value ("" = none) */
  value?: string;
  /** Uncontrolled initial open item value */
  defaultValue?: string;
  /** Fires with the open item value ("" when all closed) */
  onValueChange?: (value: string) => void;
  /** Whether the open item can be closed again. @default true */
  collapsible?: boolean;
}

export interface AccordionMultipleModeProps extends AccordionCommonProps {
  /** Any number of items open at once */
  type: 'multiple';
  /** Controlled open item values */
  value?: string[];
  /** Uncontrolled initial open item values */
  defaultValue?: string[];
  /** Fires with the list of open item values */
  onValueChange?: (value: string[]) => void;
}

export type AccordionProps = AccordionSingleModeProps | AccordionMultipleModeProps;

/**
 * Internal destructuring shape for AccordionRoot. Intersecting the two mode
 * interfaces reduces to `never` (disjoint `type` literal discriminants), so
 * merge them into one non-discriminated shape instead.
 */
type AccordionAnyModeProps = AccordionCommonProps & {
  type?: AccordionType;
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: any) => void;
  collapsible?: boolean;
};

export interface AccordionItemProps extends StackProps {
  /** Unique value identifying this item within the accordion */
  value: string;
  /** Disable just this item */
  disabled?: boolean;
  children?: ReactNode;
}

export interface AccordionTriggerProps extends Omit<StackProps, 'children'> {
  /** Web button intent; disclosure controls do not submit forms by default. */
  type?: 'button' | 'submit' | 'reset';
  /** Header title (string or custom node) */
  children?: ReactNode;
  /** Secondary line under the title */
  description?: ReactNode;
  /** Leading adornment (icon etc.) */
  icon?: ReactNode;
}

export interface AccordionContentProps extends StackProps {
  children?: ReactNode;
}

// ── Contexts ──────────────────────────────────────────────────

interface AccordionCtxValue {
  variant: AccordionVariant;
  openValues: string[];
  disabled?: boolean;
  /** Undefined lets the density knob restyle. Nested roots force true. */
  compact?: boolean;
  size?: SizeTokens;
  nestLevel: number;
  headingLevel: number;
}

interface AccordionItemCtxValue {
  open: boolean;
  disabled?: boolean;
  triggerId: string;
  contentId: string;
  /** The item's position in the stacked group (card items are "only"). */
  position: GroupPosition;
}

const AccordionCtx = createContext<AccordionCtxValue>({
  variant: 'plain',
  openValues: [],
  nestLevel: 0,
  headingLevel: 3,
});

const AccordionItemCtx = createContext<AccordionItemCtxValue>({
  open: false,
  triggerId: '',
  contentId: '',
  position: 'only',
});

/** The fill an open trigger paints under its title (the accent tint). */
const AccordionTriggerFillCtx = createContext<string | undefined>(undefined);

/**
 * Ink for a title node a consumer renders inside `Accordion.Trigger`:
 * `preferred` while it clears AA on the open trigger's fill, the fill's
 * readable anchor where it does not (a muted `$color11` title on the dark
 * accent tint measured 4.05:1). Bare string titles already get this
 * from the trigger.
 */
export function useAccordionTriggerInk(preferred: string): string {
  return useLegibleInkOn(useContext(AccordionTriggerFillCtx), preferred);
}

function useAccordionKnobs() {
  const { compact, size } = useContext(AccordionCtx);
  return useResolvedKnobs({ component: 'Accordion', compact, size });
}

function tokenPx(token: string | number | undefined, fallback: number, scale: 'size' | 'fontSize'): number {
  if (typeof token === 'number' && Number.isFinite(token)) {
    return token;
  }
  if (token == null) {
    return fallback;
  }
  try {
    const tokens = getTokens();
    const raw = getVariableValue((tokens as any)[scale]?.[token] ?? token);
    const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

// ── Elevation ─────────────────────────────────────────────────
// The card item frame is a plain (Collapsible) View — tamagui's `elevation`
// token shorthand only resolves to a box-shadow on Card/Stack-family frames,
// so convert the knob's elevation token to explicit shadow props (values
// mirror forms/InputParts + elevationToProps; native theme emits numeric
// tokens 20/28/44 per SB-N-04).

const cardElevationShadow: Record<string, Record<string, any>> = {
  $1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    // house light angle: blur = 2 x y-offset on every tier (Axiom 14)
    shadowRadius: 2,
    elevation: 2,
  },
  $2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  $4: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
};

const elevationKeyAlias: Record<string, string> = { '20': '$1', '28': '$2', '44': '$4' };

function getCardElevationProps(token: string | number | undefined): Record<string, any> {
  if (token == null) {
    return {};
  }
  const key = elevationKeyAlias[String(token)] ?? String(token);
  const shadow = cardElevationShadow[key] ?? cardElevationShadow.$2;
  if (isWeb) {
    const { elevation: _elevation, ...webShadow } = shadow;
    return webShadow;
  }
  return shadow;
}

// ── Chevron ───────────────────────────────────────────────────

const ThemedCaretDown = themed(CaretDownIcon as any);

function Chevron({
  open,
  size,
  color,
  transition,
}: {
  open: boolean;
  size: number;
  color: string | undefined;
  transition: ReturnType<typeof useResolvedKnobs>['knobProps']['transition'];
}) {
  return (
    <View
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      rotate={open ? '180deg' : '0deg'}
      aria-hidden
      pointerEvents="none"
      {...transitionProps(transition)}>
      <ThemedCaretDown color={color} size={size} />
    </View>
  );
}

// ── Stacked-group children ────────────────────────────────────

/**
 * Resolve the root's children to the item list for position counting.
 * Arrays and fragments (any nesting) are transparent; a custom component
 * wrapping items is opaque — its items resolve as "only" (uniformly
 * rounded) and a DEV warn fires, because that silent fallback is exactly
 * the geometry defect the stacked-group rule bans.
 */
function flattenStackChildren(children: ReactNode): ReturnType<typeof Children.toArray> {
  const out: ReturnType<typeof Children.toArray> = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Fragment) {
      out.push(...flattenStackChildren((child.props as { children?: ReactNode }).children));
    } else {
      out.push(child);
    }
  }
  return out;
}

// ── Root ──────────────────────────────────────────────────────

const AccordionRoot = forwardRef<TamaguiElement, AccordionProps>(function Accordion(props, ref) {
  const {
    type = 'single',
    value: valueProp,
    defaultValue,
    onValueChange,
    variant = 'plain',
    disabled,
    compact: compactProp,
    size,
    children,
    ...stackProps
  } = props as AccordionAnyModeProps;
  const collapsible = type === 'single' ? ((props as AccordionSingleModeProps).collapsible ?? true) : true;
  const parent = useContext(AccordionCtx);
  // Nested accordions only step DOWN (compact density). A nested root cannot
  // opt into a larger scale than the surface it sits in. Do not coerce an
  // omitted `compact` to false — that made the density knob inert, the
  // Alert gallery hole.
  const nestLevel = parent.nestLevel + 1;
  const compact = nestLevel > 1 ? true : compactProp;
  const headingLevel = Math.min(6, 2 + nestLevel);
  const { knobProps } = useResolvedKnobs({ component: 'Accordion', compact, size });

  // Controlled-or-uncontrolled shim: the house component always drives the tamagui primitive
  // as controlled so items can render open state (chevron, card styling).
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState<string | string[]>(
    defaultValue ?? (type === 'multiple' ? [] : ''),
  );
  const current = isControlled ? valueProp : internalValue;

  const handleValueChange = useCallback(
    (next: string | string[]) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next as any);
    },
    [isControlled, onValueChange],
  );

  const openValues = useMemo<string[]>(() => (Array.isArray(current) ? current : current ? [current] : []), [current]);

  const ctx = useMemo<AccordionCtxValue>(
    () => ({ variant, openValues, disabled, compact, size, nestLevel, headingLevel }),
    [variant, openValues, disabled, compact, size, nestLevel, headingLevel],
  );

  return (
    <AccordionCtx.Provider value={ctx}>
      <TamaguiAccordion
        ref={ref}
        // union-narrowing across single/multiple modes; collapsible only
        // exists on the single-mode primitive — passing it in multiple mode
        // leaks a non-boolean `collapsible` attribute onto the DOM node
        {...({
          type,
          value: current,
          onValueChange: handleValueChange,
          ...(type === 'single' ? { collapsible } : {}),
        } as any)}
        disabled={disabled}
        width="100%"
        {...(variant === 'card' ? knobProps.gap : {})}
        data-testid="accordion"
        data-accordion-level={nestLevel}
        data-density={knobProps.density}
        data-size={knobProps.size}
        {...stackProps}>
        {variant === 'plain'
          ? // Flush plain items form ONE stacked group: tell each item its
            // position so triggers round only the group's outer corners
            // (Axiom 1 R-OUTER via theme groupGeometry). Card items are
            // discrete gapped surfaces — each is its own group of one.
            flattenStackChildren(children).map((child, index, arr) => {
              if (isValidElement(child) && child.type !== AccordionItem) {
                devWarn('opaque-stack-group', {
                  component: 'Accordion',
                  suggest:
                    'render Accordion.Item as direct children (arrays/fragments are fine) so first/middle/last corner geometry can resolve',
                });
              }
              return (
                <GroupPositionContext.Provider
                  // toArray assigns every child a stable key
                  key={(child as { key?: string | null }).key ?? index}
                  value={getGroupPosition(index, arr.length)}>
                  {child}
                </GroupPositionContext.Provider>
              );
            })
          : children}
      </TamaguiAccordion>
    </AccordionCtx.Provider>
  );
});

// ── Item ──────────────────────────────────────────────────────

const AccordionItem = forwardRef<TamaguiElement, AccordionItemProps>(function AccordionItem(
  { value, disabled: disabledProp, children, ...props },
  ref,
) {
  const { knobProps } = useAccordionKnobs();
  const { variant, openValues, disabled: rootDisabled } = useContext(AccordionCtx);
  // Plain items get their stacked-group position from the root; card items
  // are discrete surfaces, each its own group of one.
  const position = useGroupPosition() ?? 'only';
  const open = openValues.includes(value);
  const disabled = rootDisabled || disabledProp;

  // Stable ids for aria wiring (React.useId is stable across renders —
  // the FrappeUI Heading unstable-id failure mode does not apply).
  const uid = useId();
  const itemCtx = useMemo<AccordionItemCtxValue>(
    () => ({
      open,
      disabled,
      triggerId: `mp1-accordion-trigger-${uid}`,
      contentId: `mp1-accordion-content-${uid}`,
      position,
    }),
    [open, disabled, uid, position],
  );

  const { elevation: elevationToken, ...elevatedSurfaceRest } = knobProps.elevatedSurface as any;
  const variantProps =
    variant === 'card'
      ? {
          // card surface honoring radius/elevation/border knobs
          ...elevatedSurfaceRest,
          ...getCardElevationProps(elevationToken),
          overflow: 'hidden' as const,
        }
      : {
          // plain: edge-to-edge divider rows (SP-EDGE); the divider sits
          // BETWEEN items only — a rule under the last item would put a
          // straight edge against the group's rounded bottom highlight.
          borderBottomWidth: position === 'last' || position === 'only' ? 0 : 1,
          borderColor: componentColors.surface.border,
        };

  return (
    <AccordionItemCtx.Provider value={itemCtx}>
      <TamaguiAccordion.Item ref={ref} value={value} disabled={disabled} {...variantProps} {...props}>
        {children}
      </TamaguiAccordion.Item>
    </AccordionItemCtx.Provider>
  );
});

// ── Trigger (header row) ──────────────────────────────────────

const AccordionTrigger = forwardRef<TamaguiElement, AccordionTriggerProps>(function AccordionTrigger(
  { children, description, icon, onFocus, onBlur, type = 'button', ...props },
  ref,
) {
  const { knobProps, control, disabledState } = useAccordionKnobs();
  const { headingLevel } = useContext(AccordionCtx);
  const item = useContext(AccordionItemCtx);
  const [kbFocus, setKbFocus] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // Stacked-group geometry (theme groupGeometry): the hover/press
  // highlight rounds a corner only where it coincides with the GROUP's
  // outer corner — first item top, last item bottom, middles square. An
  // OPEN item's trigger abuts its own content below, so its bottom
  // corners go square regardless of position.
  const cornerProps = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
    start: item.position === 'first' || item.position === 'only',
    end: (item.position === 'last' || item.position === 'only') && !item.open,
  });
  // Selected = fill on the trigger (the one control). Accent tint
  // is the catalog selected language; hover/press stay on the control
  // recipe so they inherit the same corner fragment. Disabled
  // rows stay transparent (list-row family) and mute via textKnobProps —
  // a surface wash here collides with the selected fill.
  const selectedTint = useAccentTintedSurface();
  const onSelectedTint = useReadableTextOn(selectedTint);
  const selectedFill = {
    backgroundColor: selectedTint ?? componentColors.interactive.background,
  };
  const restFill = item.open ? selectedFill : { backgroundColor: 'transparent' as const };
  const hoverFill = item.open
    ? selectedFill
    : (control.hoverKnobProps ?? { backgroundColor: componentColors.interactive.background });
  const pressFill = item.open
    ? selectedFill
    : (control.pressKnobProps ?? { backgroundColor: componentColors.interactive.hover });
  const titleColor = item.disabled
    ? disabledState.textKnobProps.color
    : item.open && onSelectedTint
      ? onSelectedTint
      : componentColors.text.primary;
  const openDescriptionInk = useLegibleInkOn(item.open ? selectedTint : undefined, knobProps.textAccentColor);
  const descriptionColor = item.disabled ? disabledState.textKnobProps.color : openDescriptionInk;
  const visualPx = tokenPx(knobProps.sizeToken, MIN_PRESS_TARGET, 'size');
  const chevronPx = tokenPx(knobProps.label.fontSize, Math.round(knobProps.nestedControl.px / 2), 'fontSize');

  return (
    // Heading wrapper for the ARIA accordion pattern. NOT tamagui's
    // Accordion.Header — that renders a styled H1 whose 64px font/line
    // height cascades into the row texts (and an h1 per section is wrong
    // outline semantics anyway). View ignores `tag`, so use explicit
    // role="heading" + aria-level for AT parity with an h3.
    <View role="heading" aria-level={headingLevel} margin={0} width="100%">
      <TamaguiAccordion.Trigger
        {...(isWeb ? { type } : {})}
        ref={ref}
        unstyled
        id={item.triggerId}
        aria-controls={item.contentId}
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-start"
        width="100%"
        {...knobProps.gap}
        minHeight={knobProps.sizeToken as any}
        hitSlop={pressTargetHitSlop(visualPx)}
        {...knobProps.panelPadding}
        borderWidth={0}
        cursor={item.disabled ? 'not-allowed' : 'pointer'}
        outlineWidth={0}
        data-group-position={item.position}
        {...(item.open ? { 'data-selected': 'true' } : {})}
        {...(kbFocus ? { 'data-keyboard-focus': 'true' } : {})}
        // Interaction rows follow the radius knob through the
        // stacked-group corner fragment above — never a uniform radius,
        // which would seat a rounded highlight against a straight seam.
        {...cornerProps}
        {...restFill}
        {...(!item.disabled && {
          hoverStyle: { ...hoverFill, ...cornerProps },
          pressStyle: { ...pressFill, ...cornerProps },
        })}
        focusStyle={{ outlineWidth: 0, ...restFill, ...cornerProps }}
        focusVisibleStyle={{ outlineWidth: 0 }}
        {...(kbFocus ? keyboardFocusRingProps : undefined)}
        {...(isWeb
          ? {
              onFocus: (event: any) => {
                if (wasKeyboardFocus()) {
                  setKbFocus(true);
                }
                onFocus?.(event);
              },
              onBlur: (event: any) => {
                setKbFocus(false);
                onBlur?.(event);
              },
            }
          : { onFocus, onBlur })}
        {...transitionProps(knobProps.transition)}
        {...props}>
        <Chevron
          open={item.open}
          size={chevronPx}
          color={
            (item.disabled ? disabledState.textKnobProps.color : knobProps.textAccentColor) ?? knobProps.textAccentColor
          }
          transition={knobProps.transition}
        />
        {icon ? (
          <View alignItems="center" justifyContent="center" flexShrink={0}>
            {icon}
          </View>
        ) : null}
        <AccordionTriggerFillCtx.Provider value={item.open ? selectedTint : undefined}>
          <YStack flex={1} minWidth={0} alignItems="flex-start">
            {/* TEXT-RIDES-TEXT: wrap ALL bare string/number children
                (coalesced runs), not just the singleton case. */}
            {/* Label weight rides the fontWeight knob (400 / 700). Never 500
                or 600 — those are not house label weights (text-node trap).
                Selected state is fill, not a heavier weight. */}
            {wrapBareTextChildren(children, (label, key) => (
              <Text key={key} {...knobProps.label} textAlign="left" color={titleColor}>
                {label}
              </Text>
            ))}
            {description != null &&
              wrapBareTextChildren(description, (label, key) => (
                <Text key={key} {...knobProps.label} textAlign="left" color={descriptionColor}>
                  {label}
                </Text>
              ))}
          </YStack>
        </AccordionTriggerFillCtx.Provider>
      </TamaguiAccordion.Trigger>
    </View>
  );
});

// ── Content ───────────────────────────────────────────────────

// The panel is an AnimateHeight collapsible instead of TamaguiAccordion.Content:
// the tamagui primitive unmounts/remounts at intrinsic (auto) height, which no
// driver can tween — the AnimationLab auto-height defect. AnimateHeight keeps
// the a11y contract (region + labelledby ids) and tweens measured px heights.
// Padding lives on the inner YStack so it is part of the measured height.
const AccordionContent = forwardRef<TamaguiElement, AccordionContentProps>(function AccordionContent(
  { children, ...props },
  ref,
) {
  const { knobProps } = useAccordionKnobs();
  const item = useContext(AccordionItemCtx);
  // Open last/only content owns the group's trailing corners (the trigger
  // above is square where it abuts this region).
  const cornerProps = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
    start: false,
    end: item.position === 'last' || item.position === 'only',
  });

  return (
    <AnimateHeight
      ref={ref}
      open={item.open}
      role="region"
      id={item.contentId}
      aria-labelledby={item.triggerId}
      {...cornerProps}>
      <YStack {...knobProps.panelPadding} paddingTop={knobProps.gap.gap} {...props}>
        {/* TEXT-RIDES-TEXT: content is a View slot — bare/array string
              children ride a body Text instead of crashing native. */}
        {wrapBareTextChildren(children, (label, key) => (
          <Text key={key} {...knobProps.body} color={componentColors.text.primary}>
            {label}
          </Text>
        ))}
      </YStack>
    </AnimateHeight>
  );
});

// ── Compound export ───────────────────────────────────────────

export const Accordion = withStaticProperties(AccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
});
