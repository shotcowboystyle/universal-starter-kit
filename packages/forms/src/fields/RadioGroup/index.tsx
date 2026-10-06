import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  radiusClassProps,
  useReadableTextOn,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type { ControlStateProps, DisabledChromeProps, KnobProps, KnobRecipe } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Label, RadioGroup as TamaguiRadioGroup, View, XStack, YStack, getVariableValue, isWeb, styled } from 'tamagui';
import type {
  FontSizeTokens,
  LabelProps,
  SizeTokens,
  TamaguiElement,
  RadioGroupProps as TamaguiRadioGroupProps,
} from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { formControlColors, formSelectedColors } from '../../shared/color-ramps';
import { choiceItemA11y, composeA11yName } from '../../shared/native-a-11y';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  stripRadiusFromStateProps,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import {
  CheckboxCardContent,
  CheckboxCardDescription,
  CheckboxCardFrame,
  CheckboxCardLabel,
  getCardDescriptionSize,
  getCheckboxCardLayout,
} from '../Checkbox/CheckboxCard';

/** Minimum pressable target for an individual radio control (WCAG 2.5.5 / SP-FIXED). */
const radioTargetSize = 44;

/**
 * Radio disc is R-IDENTITY (Clay 2026-08-28): always a circle, including at
 * `borderRadius:none`. Checkbox is the inverse (never circular). The 44px
 * hit target stays transparent; this radius is the visible glyph + pip.
 */
const radioDiscRadius = 1000;
/** Deterministic skeleton label bar widths (see the skeleton branch). */
const skeletonLabelWidths = [88, 64, 76];

type BlurHandler = ComponentProps<typeof FieldLayout>['onBlur'];

interface RadioA11yRefs {
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

// The DOM invokes onKeyDown with the event; tamagui's prop type omits the parameter.
// SAFETY: the DOM always invokes onKeyDown with a KeyboardEvent-shaped argument; only tamagui's prop type omits it
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- see SAFETY above
const asKeyDownProp = (handler: (e: { key?: string }) => void): (() => void) => handler as unknown as () => void;

// SAFETY: knobProps.sizeToken is always one of the theme's size token names
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const toFontSizeToken = (token: string | number): FontSizeTokens => token as FontSizeTokens;

/** Per-option accessible props: web carries an aria-label only when the option sets one; native gets the RN set. */
const radioItemA11yProps = (
  option: RadioGroupOption,
  nativeLabel: string,
  nativeHint: string | undefined,
  selected: boolean,
  isDisabled: boolean,
) => {
  if (!isWeb) {
    return choiceItemA11y({ kind: 'radio', name: nativeLabel, selected, disabled: isDisabled, hint: nativeHint });
  }
  const { accessibilityLabel } = option;
  return accessibilityLabel === undefined || accessibilityLabel === '' ? {} : { 'aria-label': accessibilityLabel };
};
const radioDiscIdentity = radiusClassProps('R-IDENTITY', 'radio disc');

// The pressable/focusable role=radio element is a 44px transparent target;
// the visible circle is the inner RadioGlyph. Sizing the target (not the
// glyph) keeps visual density while flooring the touch target.
const RadioItemFrame = styled(TamaguiRadioGroup.Item, {
  width: radioTargetSize,
  height: radioTargetSize,
  minWidth: radioTargetSize,
  minHeight: radioTargetSize,
  padding: 0,
  borderWidth: 0,
  borderRadius: 1000,
  backgroundColor: 'transparent',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',
  // The 44px hit target never carries a ring. Ring lives on the glyph
  // of the focused radio only (keyboard modality), never every sibling.
  outlineWidth: 0,
  hoverStyle: { backgroundColor: 'transparent' },
  pressStyle: { backgroundColor: 'transparent' },
  focusStyle: { backgroundColor: 'transparent', outlineWidth: 0 },
  focusVisibleStyle: { backgroundColor: 'transparent', outlineWidth: 0 },
});

// Visual radio circle, sized like tamagui's radio item (size token * 0.5).
// Unselected (Polaris / Spectrum): empty-ring — transparent fill with a
// ≥3:1 boundary. Selected (Primer): accent fill via direct props, not
// a second outline on every sibling. Keyboard ring is painted on this glyph.
const RadioGlyph = styled(View, {
  borderRadius: 1000,
  backgroundColor: 'transparent',
  borderColor: formControlColors.boundary,
  alignItems: 'center',
  justifyContent: 'center',
  // Paint-only: on RN the inner View / indicator steals the responder from
  // the 44px role=radio frame (same steal as CheckboxGlyphBox). `none` lets
  // the press reach RadioItemFrame.
  pointerEvents: 'none',
  variants: {
    size: {
      '...size': (val: SizeTokens) => {
        const glyphSize = Math.floor(getVariableValue(getSize(val)) * 0.5);
        return { width: glyphSize, height: glyphSize };
      },
    },
    outlined: {
      true: { backgroundColor: 'transparent' },
    },
  } as const,
});

/**
 * Ring width floor: a 1px hairline at the boundary tier still under-signals a
 * 22px control (platform radios sit at ~2px); knob borderWidth applies above
 * the floor. Purely the glyph ring — knob-driven seams elsewhere unchanged.
 */
const radioRingWidth = (knobBorderWidth: number | undefined) => Math.max(knobBorderWidth ?? 1, 2);

const RadioIndicatorFrame = styled(TamaguiRadioGroup.Indicator, {
  pointerEvents: 'none',
  borderRadius: 1000,
  // Primer / Spectrum inner mark on a FILLED disc (selected = fill): the
  // inverse center is ~1/3 of the outer control (Primer radial-gradient 33%,
  // Spectrum inner pip). Percentage sizes resolve against the glyph content
  // box (disc minus the 2px ring), so 40% of content ≈ 0.33 of the disc.
  width: '40%',
  height: '40%',
});

export interface RadioGroupOption {
  label: string;
  value: string;
  disabled?: boolean;
  /** Muted secondary line under the label; rendered in `card` mode. */
  description?: string;
  /**
   * Accessible name for THIS option, overriding `label`. Use it
   * when the option carries meaning the label text does not: a glyph, or a
   * state encoded in fill/weight/position rather than words.
   */
  accessibilityLabel?: string;
  /** Extra spoken context for this option (native `accessibilityHint`). */
  accessibilityHint?: string;
}

export interface RadioGroupProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: string;
  defaultValue?: string;
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string) => void;
  /** @deprecated Use `onChange` instead. Kept as an alias for the tamagui/Radix name. */
  onValueChange?: (value: string) => void;
  onBlur?: BlurHandler;
  options?: RadioGroupOption[];
  orientation?: 'horizontal' | 'vertical';
  radioGroupProps?: Omit<TamaguiRadioGroupProps, 'value' | 'defaultValue' | 'id' | 'onValueChange' | 'children'>;
  children?: ReactNode;
  /**
   * Ignored. The radio disc is R-IDENTITY (always round), including at
   * `borderRadius:none`. Kept so existing callers do not type-error.
   */
  pointy?: boolean;
  /** When true, renders a skeleton placeholder instead of the radio group */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
  /**
   * When true, renders each option as a selection card: radio in a
   * leading slot, bold label to its right, muted `option.description` under
   * the label; the whole card selects. Consumes the shared CheckboxCard
   * primitives (same anatomy as `CheckboxGroup card`).
   */
  card?: boolean;
  /**
   * Accessible name for the whole group.
   *
   * tamagui does not map `aria-label` onto React Native's
   * `accessibilityLabel`, so the web attribute is inert on native; this prop
   * is the native channel and `aria-label` is accepted as an alias.
   *
   * iOS speaks elements, never non-element containers, so a name set here is
   * PREFIXED onto each option's accessible name ("Phase, CREDITS") instead of
   * sitting on the frame where nothing reads it. Options stay individually
   * reachable and keep their own checked state.
   */
  accessibilityLabel?: string;
  /** Alias for `accessibilityLabel`; also emitted as the web attribute. */
  'aria-label'?: string;
  /** Web-only name reference. Native has no id-based equivalent. */
  'aria-labelledby'?: string;
  /** Extra spoken context for the group (native `accessibilityHint`). */
  accessibilityHint?: string;
}

interface RadioOptionItemProps {
  option: RadioGroupOption;
  itemId: string;
  /** The resolved native accessible name for this option. */
  nativeLabel: string;
  nativeHint?: string;
  a11y?: RadioA11yRefs;
  selected: boolean;
  isTabStop?: boolean;
  knobProps: KnobProps;
  control: KnobRecipe<ControlStateProps>;
  disabledChrome?: DisabledChromeProps;
  groupDisabled?: boolean;
  readOnly?: boolean;
  elevationWrapperProps: ReturnType<typeof getElevationWrapperProps>;
}

/**
 * One radio: Primer/Spectrum/Polaris anatomy.
 * Unselected = empty disc (Polaris/Spectrum boundary ring). Selected = accent
 * fill with an inverse inner pip (Primer). Keyboard ring on this glyph only.
 */
const RadioOptionItem = ({
  option,
  itemId,
  nativeLabel,
  nativeHint,
  a11y,
  selected,
  isTabStop,
  knobProps,
  control,
  disabledChrome,
  groupDisabled,
  readOnly,
  elevationWrapperProps,
}: RadioOptionItemProps) => {
  const [kbFocus, setKbFocus] = useState(false);
  ensureKeyboardModalityTracking();
  const detachKb = useRef<(() => void) | null>(null);
  const frameRef = useCallback((node: TamaguiElement | null) => {
    detachKb.current?.();
    detachKb.current = null;
    if (!isWeb || !(node instanceof HTMLElement)) {
      return;
    }
    const el = node;
    const onIn = () => {
      if (wasKeyboardFocus()) {
        setKbFocus(true);
      }
    };
    const onOut = () => {
      setKbFocus(false);
    };
    // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- released through detachKb, which the next ref call (or unmount, ref=null) runs
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    detachKb.current = () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, []);
  const onMark = useReadableTextOn(formSelectedColors.mark);
  const hoverProps = stripRadiusFromStateProps(control.hoverKnobProps);
  const pressProps = stripRadiusFromStateProps(control.pressKnobProps);
  const focusProps = stripRadiusFromStateProps(control.focusKnobProps);
  const isDisabled = groupDisabled === true || option.disabled === true;

  const hasElevation = elevationWrapperProps.elevation !== undefined;

  const glyph = (
    <RadioGlyph
      size={knobProps.sizeToken}
      borderWidth={radioRingWidth(knobProps.borderRadius.borderWidth)}
      borderRadius={radioDiscRadius}
      {...radioDiscIdentity}
      outlined={knobProps.outlined}
      // Direct props (not a selected variant): fill must win over hover/press
      // fragments the way ToggleGroup's selected fill does.
      backgroundColor={selected ? formSelectedColors.mark : 'transparent'}
      borderColor={selected ? formSelectedColors.mark : formControlColors.boundary}
      {...(kbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 as const })}
      data-radio-kb-focus={kbFocus ? 'true' : 'false'}
      {...transitionProps(knobProps.transition)}>
      <RadioIndicatorFrame
        borderRadius={radioDiscRadius}
        backgroundColor={onMark ?? '$color1'}
        {...transitionProps(knobProps.transition)}
      />
    </RadioGlyph>
  );

  return (
    <RadioItemFrame
      value={option.value}
      id={itemId}
      // Roving tabindex (single tab stop): tamagui's vendored roving-focus
      // item leaves tabIndex=0 on every radio, so a 3-option group was 3
      // tab stops. Only the checked radio (or the first enabled one when
      // none is checked) stays in the page tab order; arrows move + select.
      {...(isWeb && isTabStop !== undefined ? { tabIndex: isTabStop ? 0 : -1 } : undefined)}
      borderRadius={radioDiscRadius}
      transition={knobProps.transition}
      disabled={isDisabled}
      // Ring is text-free chrome — dim it while the
      // sibling label stays readable (read-only never dims).
      {...(isDisabled ? disabledChrome : undefined)}
      pointerEvents={readOnly ? 'none' : undefined}
      {...a11y}
      // RN only exposes the radio when `accessible` is set, and the
      // aria-* spellings this block used to carry never reached iOS at all:
      // tamagui does not map them onto React Native's accessibility props, so
      // options came back as bare StaticText with no role and no checked
      // state. The RN prop names are the ones iOS actually reads.
      {...radioItemA11yProps(option, nativeLabel, nativeHint, selected, isDisabled)}
      {...(hoverProps && {
        hoverStyle: {
          ...hoverProps,
          backgroundColor: 'transparent',
        },
      })}
      {...(pressProps && {
        pressStyle: {
          ...pressProps,
          backgroundColor: 'transparent',
        },
      })}
      {...(focusProps && {
        focusStyle: {
          ...focusProps,
          backgroundColor: 'transparent',
          outlineWidth: 0,
        },
      })}
      focusVisibleStyle={{ backgroundColor: 'transparent', outlineWidth: 0 }}
      ref={isWeb ? frameRef : undefined}>
      {hasElevation ? (
        <View
          {...elevationWrapperProps}
          borderRadius={radioDiscRadius}
          pointerEvents="none">
          {glyph}
        </View>
      ) : (
        glyph
      )}
    </RadioItemFrame>
  );
};

// oxlint-disable-next-line react-doctor/no-giant-component -- one field shell: the standalone and form branches share the item renderers' closure over id, knobs and handlers
export const RadioGroup = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  // oxlint-disable-next-line typescript/no-deprecated -- `onValueChange` is a supported alias that must keep firing alongside `onChange`
  onValueChange,
  onBlur,
  options,
  orientation = 'vertical',
  radioGroupProps,
  children,
  skeleton,
  compact,
  card,
  accessibilityLabel,
  accessibilityHint,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: RadioGroupProps) => {
  // Canonical `onChange` and the alias `onValueChange` both fire from the
  // single emit site below (same reconciliation as Switch).
  const handleValueChange = (val: string) => {
    onChange?.(val);
    onValueChange?.(val);
  };
  // One name, two channels — tamagui drops `aria-label` on native, so
  // the prop and the attribute are reconciled here.
  const groupA11yName = accessibilityLabel ?? ariaLabel;
  const hasGroupName = (groupA11yName ?? '') !== '';
  const hasChildren = Boolean(children);
  // iOS reads elements, not containers, so an explicit group name rides in
  // front of each option's own name rather than sitting on the frame.
  const optionA11yName = (option: RadioGroupOption) =>
    composeA11yName(groupA11yName, option.accessibilityLabel ?? option.label);
  const { resolvedForm, knobProps, control, text, elevation, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const elevationWrapperProps = getElevationWrapperProps(knobProps, elevation);
  const resolvedSize = size ?? knobProps.sizeToken;
  // Uncontrolled state for card-mode whole-card press (and standalone use) —
  // without this, card body presses only fire parent handlers while Tamagui's
  // defaultValue-driven group stays stale.
  const [internalValue, setInternalValue] = useState<string | undefined>(defaultValue);

  // Tamagui's RadioGroup renders its RovingFocusGroup as a separate View
  // AROUND the role=radiogroup frame (Radix merges both onto one element via
  // asChild; the tamagui port does not), leaving a focusable outer div with
  // no role/name in the tab order (voiceover pass, SchemaForm radiogroup).
  // Neutralize that wrapper's tabindex on web so only the radiogroup's
  // radios participate in tab order. The roving group re-applies tabIndex=0
  // whenever its focusable-item count or tab-back state re-renders, so a
  // one-shot strip does not hold — an attribute observer keeps it out.
  const wrapperTabIndexObserver = useRef<MutationObserver | null>(null);
  const frameRef = useCallback((node: TamaguiElement | null) => {
    wrapperTabIndexObserver.current?.disconnect();
    wrapperTabIndexObserver.current = null;
    if (!isWeb || !(node instanceof HTMLElement)) {
      return;
    }
    const wrapper = node.parentElement;
    // The roving wrapper is role-less and carries data-orientation; anything
    // else means the structure changed and we must not touch it.
    if (wrapper === null || (wrapper.getAttribute('role') ?? '') !== '' || wrapper.dataset.orientation === undefined) {
      return;
    }
    const strip = () => {
      if (wrapper.getAttribute('tabindex') === '0') {
        wrapper.setAttribute('tabindex', '-1');
      }
    };
    strip();
    const observer = new MutationObserver(strip);
    // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- disconnected through wrapperTabIndexObserver on the next ref call (or unmount, ref=null)
    observer.observe(wrapper, { attributes: true, attributeFilter: ['tabindex'] });
    wrapperTabIndexObserver.current = observer;
  }, []);

  // Render skeleton placeholder
  if (skeleton) {
    // Mirror the real anatomy: each row is a
    // 20px circular disc (R-IDENTITY — never squares at none / pointy),
    // then a label bar separated by the real control↔label gap. Label widths
    // are DETERMINISTIC per index (never %, never random): a percentage width
    // inside an auto-width horizontal row resolves against a width computed
    // without it, so the bar paints past the row's edge and fuses with the
    // next item's control.
    const optionCount = options?.length ?? 3;
    const Container = orientation === 'horizontal' ? XStack : YStack;
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Container gap="$2">
          {Array.from({ length: optionCount }, (_, i) => (
            <XStack
              key={i}
              gap="$2"
              alignItems="center">
              {/* Mirror the 44px pressable target box around the 20px glyph */}
              <View
                width={radioTargetSize}
                height={radioTargetSize}
                alignItems="center"
                justifyContent="center">
                <Skeleton
                  variant="circular"
                  width={20}
                  height={20}
                  borderRadius={radioDiscRadius}
                />
              </View>
              <Skeleton
                variant="text"
                width={skeletonLabelWidths[i % skeletonLabelWidths.length]}
                height={14}
              />
            </XStack>
          ))}
        </Container>
      </FieldLayout>
    );
  }

  const renderRadioItem = (
    option: RadioGroupOption,
    itemId: string,
    a11y?: RadioA11yRefs,
    selected = false,
    // oxlint-disable-next-line sonarjs/bool-param-default -- undefined means "tab order not managed" (callers pass children), which a default would erase
    isTabStop?: boolean,
  ) => (
    <RadioOptionItem
      option={option}
      itemId={itemId}
      nativeLabel={optionA11yName(option)}
      nativeHint={option.accessibilityHint ?? accessibilityHint}
      a11y={a11y}
      selected={selected}
      isTabStop={isTabStop}
      knobProps={knobProps}
      control={control}
      disabledChrome={disabledState.chromeKnobProps}
      groupDisabled={disabled}
      readOnly={readOnly}
      elevationWrapperProps={elevationWrapperProps}
    />
  );

  // oxlint-disable-next-line typescript/promise-function-async -- ReactNode includes Promise in React 19 types; this renders synchronously
  const renderItems = (currentValue: string | undefined, emit: (val: string) => void) => {
    if (hasChildren) {
      return children;
    }
    if (!options) {
      return null;
    }
    const Container = orientation === 'horizontal' ? XStack : YStack;
    // Exactly one radio stays tabbable: the checked enabled one, else the
    // first enabled one (WAI-ARIA radio-group pattern).
    const checkedEnabled = options.findIndex(
      (o) => o.value === currentValue && !(disabled === true || o.disabled === true),
    );
    const tabStopIndex =
      checkedEnabled === -1 ? options.findIndex((o) => !(disabled === true || o.disabled === true)) : checkedEnabled;

    if (card) {
      const layout = getCheckboxCardLayout(knobProps.space);
      const descriptionSize = getCardDescriptionSize(resolvedSize);
      return (
        <Container gap="$2">
          {options.map((option, index) => {
            // Include the index so duplicate option values don't produce
            // duplicate React keys / DOM ids.
            const itemId = `${id}-${index}-${option.value}`;
            const labelId = `${itemId}-label`;
            const hasDescription = (option.description ?? '') !== '';
            const descriptionId = hasDescription ? `${itemId}-description` : undefined;
            const isSelected = currentValue === option.value;
            const isDisabled = disabled === true || option.disabled === true;
            return (
              <CheckboxCardFrame
                // oxlint-disable-next-line react-doctor/no-array-index-as-key -- option values may repeat; the index disambiguates the key
                key={`${index}-${option.value}`}
                active={isSelected}
                {...layout}
                borderRadius={knobProps.borderRadius.borderRadius}
                // Selection cards dim as chrome (label rides the card).
                {...(isDisabled ? disabledState.chromeKnobProps : undefined)}
                // Whole card selects. Clicking the radio itself may also fire
                // this; both emit the same value, so the double emit is
                // idempotent (same pattern as CheckboxGroup card).
                onPress={() => {
                  if (isDisabled || readOnly) {
                    return;
                  }
                  emit(option.value);
                }}>
                {renderRadioItem(
                  option,
                  itemId,
                  {
                    'aria-labelledby': labelId,
                    ...(descriptionId === undefined ? undefined : { 'aria-describedby': descriptionId }),
                  },
                  isSelected,
                  index === tabStopIndex,
                )}
                <CheckboxCardContent>
                  {/* fontWeight after size: the size variant's font weight
                      would otherwise override the styled bold default */}
                  <CheckboxCardLabel
                    id={labelId}
                    size={toFontSizeToken(resolvedSize)}
                    fontWeight="600">
                    {option.label}
                  </CheckboxCardLabel>
                  {hasDescription ? (
                    <CheckboxCardDescription
                      id={descriptionId}
                      size={descriptionSize}>
                      {option.description}
                    </CheckboxCardDescription>
                  ) : null}
                </CheckboxCardContent>
              </CheckboxCardFrame>
            );
          })}
        </Container>
      );
    }

    return (
      <Container gap="$2">
        {options.map((option, index) => {
          const itemId = `${id}-${index}-${option.value}`;
          return (
            <XStack
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- option values may repeat; the index disambiguates the key
              key={`${index}-${option.value}`}
              gap="$2"
              alignItems="center">
              {renderRadioItem(option, itemId, undefined, currentValue === option.value, index === tabStopIndex)}
              <Label
                htmlFor={itemId}
                // On native the radio itself now carries this text as
                // its accessible name, so leaving the Label in the tree reads
                // every option twice. Web keeps the label/control association.
                {...(isWeb
                  ? undefined
                  : {
                      accessibilityElementsHidden: true,
                      importantForAccessibility: 'no-hide-descendants' as const,
                    })}
                size={toFontSizeToken(resolvedSize)}
                {...knobProps.body}
                color={knobProps.textAccentColor}
                hoverStyle={{ color: knobProps.textAccentColor, ...text.hoverKnobProps }}
                pressStyle={{ color: knobProps.textAccentColor, ...text.pressKnobProps }}
                focusStyle={{ color: knobProps.textAccentColor, ...text.focusKnobProps }}
                focusVisibleStyle={{
                  color: knobProps.textAccentColor,
                  ...text.focusVisibleKnobProps,
                }}>
                {option.label}
              </Label>
            </XStack>
          );
        })}
      </Container>
    );
  };

  const renderRadioGroup = (
    radioValue: string | undefined,
    handleChange?: (val: string) => void,
    handleBlur?: BlurHandler,
    hasError = false,
  ) => {
    const emit = (val: string) => {
      if (disabled || readOnly) {
        return;
      }
      setInternalValue(val);
      handleChange?.(val);
      handleValueChange(val);
    };
    // Always controlled: `radioValue` is the live upstream value (controlled
    // `value` prop, TanStack field state, or the internal uncontrolled state,
    // which `emit` keeps current) — passing it as Tamagui `defaultValue` was
    // mount-only, so a value arriving AFTER first paint (e.g. create-mode
    // engine seeding) never displayed. Tamagui's prop-wins controllable state
    // adopts a late-arriving prop without firing onValueChange (a
    // programmatic value application is not a user edit).
    const valueProps = { value: radioValue };

    // WAI-ARIA radio group: arrow keys move focus AND select the newly
    // focused radio (Tab entry alone never selects). Tamagui's roving group
    // moves focus on this same keydown via a deferred focus call, so read
    // document.activeElement one tick later and activate it — a real click
    // flows through Tamagui's value machinery (controlled AND uncontrolled).
    const handleArrowSelect = (e: { key?: string }) => {
      if (!options || disabled || readOnly) {
        return;
      }
      const { key } = e;
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
        return;
      }
      setTimeout(() => {
        const { activeElement: active } = document;
        if (!(active instanceof HTMLElement) || !active.id.startsWith(`${id}-`)) {
          return;
        }
        if (active.getAttribute('role') !== 'radio') {
          return;
        }
        if (active.getAttribute('aria-checked') === 'true') {
          return;
        }
        active.click();
      }, 0);
    };

    return (
      <TamaguiRadioGroup
        {...radioGroupProps}
        ref={frameRef}
        id={id}
        {...valueProps}
        onValueChange={emit}
        {...(handleBlur === undefined ? undefined : { onBlur: handleBlur })}
        {...(isWeb && options !== undefined && !hasChildren
          ? { onKeyDown: asKeyDownProp(handleArrowSelect) }
          : undefined)}
        aria-required={required === true || undefined}
        aria-invalid={hasError || undefined}
        aria-readonly={readOnly === true || undefined}
        // Web reads the attribute, Android reads the RN prop off the
        // container. iOS reads neither, which is why the name is also prefixed
        // onto every option above.
        {...(hasGroupName ? { 'aria-label': groupA11yName } : undefined)}
        {...((ariaLabelledBy ?? '') === '' ? undefined : { 'aria-labelledby': ariaLabelledBy })}
        {...(!isWeb && hasGroupName
          ? { accessibilityLabel: groupA11yName, accessibilityRole: 'radiogroup' as const }
          : undefined)}>
        {renderItems(radioValue, emit)}
      </TamaguiRadioGroup>
    );
  };

  if (!resolvedForm || name === undefined || name === '') {
    const currentValue = value ?? internalValue;
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        required={required}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        {renderRadioGroup(currentValue, undefined, onBlur, Boolean(error))}
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        // SAFETY: a RadioGroup field holds the selected option's string value, or nothing before a selection
        const fieldValue = field.state.value as string | undefined;
        const currentValue = value ?? fieldValue;
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            required={required}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            {renderRadioGroup(
              currentValue,
              (val) => {
                field.handleChange(val);
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              Boolean(resolvedError),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};

RadioGroup.Item = TamaguiRadioGroup.Item;
RadioGroup.Indicator = TamaguiRadioGroup.Indicator;
