import type {
  BorderRadius,
  ElevationChromeProps,
  ElevationStateProps,
  KnobProps,
  KnobRecipe,
  ResolvedKnobs,
} from '@repo/theme';
import { borderRadiusMap, isTouchSurface, resolveRadiusClass, sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { SizeTokens } from 'tamagui';

// oxlint-disable-next-line import/no-cycle -- Form consumes shared helpers and shared needs Form context; splitting the context out would move exported modules
import { useFormContext, useFormValidate } from '../Form';
import { remapValidatorsForTiming, resolveEffectiveValidateOn } from '../Form/validate-on';
import type { AnyFormApi, SimpleFieldApi } from '../types';

/**
 * Resolve a size token to its recipe height, optionally multiplied by a row count.
 * e.g. getFieldHeight("$4") → 32, getFieldHeight("$4", 3) → 96
 */
export const getFieldHeight = (sizeToken: SizeTokens, rows = 1, touch = isTouchSurface()): number =>
  sizeRecipeForToken(String(sizeToken), { touch }).height * rows;

const clampRadius = (radiusToken: string | undefined, maxTokenNum: number, fallback: string): string | 0 => {
  if (radiusToken === undefined || radiusToken === '') {
    return fallback;
  }
  if (radiusToken === '$0') {
    return 0;
  }
  if (radiusToken.startsWith('$')) {
    const num = Math.trunc(Number(radiusToken.slice(1)));
    return num > maxTokenNum ? `$${maxTokenNum}` : radiusToken;
  }
  return radiusToken;
};

/**
 * Clamp border radius token so controls (buttons, inputs, checkbox) don't become
 * fully circular/pill-shaped when knob is "full". Returns token string e.g. "$4".
 */
export const clampRadiusForControl = (radiusToken: string | undefined, maxTokenNum = 6): string | 0 =>
  clampRadius(radiusToken, maxTokenNum, '$4');

/**
 * Clamp border radius for large multi-line components (TextArea, RichTextEditor,
 * CodeEditor, FileUpload dropzone, etc.). These components should never have
 * pill-shaped corners as it wastes space and looks odd.
 *
 * Max default is $4 which provides subtle rounding without being excessive.
 */
export const clampRadiusForLargeComponent = (radiusToken: string | undefined, maxTokenNum = 4): string | 0 =>
  clampRadius(radiusToken, maxTokenNum, '$3');

type OtpRadiusStop = keyof typeof borderRadiusMap;

const isBorderRadiusStop = (key: string): key is OtpRadiusStop => Object.hasOwn(borderRadiusMap, key);

const BORDER_RADIUS_STOPS = Object.keys(borderRadiusMap).filter(isBorderRadiusStop);

const otpRadiusStop = (radiusToken: string | undefined): OtpRadiusStop => {
  if (radiusToken == null) {
    return 'medium';
  }
  for (const stop of BORDER_RADIUS_STOPS) {
    if (stop === radiusToken || borderRadiusMap[stop] === radiusToken) {
      return stop;
    }
  }
  throw new Error(`getOTPCellRadius: "${radiusToken}" is not a borderRadiusMap token; cannot resolve CIRCULAR-AT-FULL`);
};

/**
 * OTP cells are CIRCULAR-AT-FULL: ride the token scale,
 * true circle at full = the cell's own height/2 — never a raw 1000 / browser
 * clamp. Equal-w/h parts; single-line controls are the pill case of the same
 * family (leftover). Thin alias over resolveRadiusClass.
 */
export const getOTPCellRadius = (radiusToken: string | undefined, heightPx: number): number =>
  resolveRadiusClass('CIRCULAR-AT-FULL', otpRadiusStop(radiusToken), { heightPx });

/**
 * Build elevation props for a wrapper View around HOC-based components.
 *
 * Tamagui's create* HOC chains (createCheckbox, createSwitch, etc.) swallow
 * the elevation variant. Spread the complete `elevationChrome` fragment from
 * resolveKnobs — scheme-aware tint lives on `inputBackground` /
 * `elevatedSurface`, not here.
 */
// Pick (a mapped type) rather than the interface itself so the result keeps an implicit index signature for prop-bag consumers.
export type ElevationWrapperProps = Pick<ElevationChromeProps, keyof ElevationChromeProps> & {
  overflow?: 'visible';
  hoverStyle?: ElevationStateProps;
  pressStyle?: ElevationStateProps;
  focusVisibleStyle?: ElevationStateProps;
  animation?: NonNullable<KnobProps['transition']>;
};

type RadiusValue = string | number | undefined;

const hasElevation = (elevation: RadiusValue): boolean =>
  elevation !== undefined && elevation !== '' && elevation !== 0;

export const getElevationWrapperProps = (
  knobProps: KnobProps,
  elevationRecipe: KnobRecipe<ElevationStateProps>,
): ElevationWrapperProps => {
  const { elevation } = knobProps;
  if (
    !hasElevation(elevation) &&
    !hasElevation(elevationRecipe.hoverKnobProps?.elevation) &&
    !hasElevation(elevationRecipe.pressKnobProps?.elevation) &&
    !hasElevation(elevationRecipe.focusVisibleKnobProps?.elevation)
  ) {
    return {};
  }
  const props: ElevationWrapperProps = {
    overflow: 'visible' as const,
    ...knobProps.elevationChrome,
  };
  if (elevationRecipe.hoverKnobProps) {
    props.hoverStyle = elevationRecipe.hoverKnobProps;
  }
  if (elevationRecipe.pressKnobProps) {
    props.pressStyle = elevationRecipe.pressKnobProps;
  }
  if (elevationRecipe.focusVisibleKnobProps) {
    props.focusVisibleStyle = elevationRecipe.focusVisibleKnobProps;
  }
  if (knobProps.transition !== undefined && knobProps.transition !== null) {
    props.animation = knobProps.transition;
  }
  return props;
};

export const useFormField = (props: {
  form?: AnyFormApi;
  id?: string;
  compact?: boolean;
  size?: SizeTokens;
}): {
  resolvedForm: AnyFormApi | undefined;
  id: string;
} & ResolvedKnobs => {
  const formContext: AnyFormApi = useFormContext();
  const resolvedForm = props.form ?? formContext ?? undefined;
  const resolved = useResolvedKnobs({ compact: props.compact, size: props.size });
  const generatedId = useId();
  const id = props.id === undefined || props.id === '' ? generatedId : props.id;
  return { resolvedForm, ...resolved, id };
};

export const getFieldError = <TValue>(
  field: SimpleFieldApi<TValue>,
  propError?: string | boolean,
): string | boolean | undefined => {
  const fieldError = field.state.meta.errors.length ? String(field.state.meta.errors[0]) : undefined;
  return propError ?? fieldError;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- generic emptiness predicate: receives any field value, by design
const defaultIsEmpty = (v: unknown) => v == null || v === '';

type ValidatorFn = (args: { value: unknown }) => string | undefined;

const isValidatorFn = (v: unknown): v is ValidatorFn => typeof v === 'function';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors TanStack's validators bag consumed by remapValidatorsForTiming
export type FieldValidators = Record<string, unknown>;

const requiredFieldLabel = (label: ReactNode, name: string | undefined): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label is usable in the message
  if (typeof label === 'string') {
    return label;
  }
  return name === undefined || name === '' ? 'Field' : name;
};

export const useResolvedValidators = (
  // oxlint-disable-next-line sonarjs/bool-param-default -- positional parameter before required ones; a default here would make the following parameters optional
  required: boolean | undefined,
  validators: FieldValidators | undefined,
  label?: ReactNode,
  name?: string,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- predicate over any field value
  isEmpty: (value: unknown) => boolean = defaultIsEmpty,
): FieldValidators | undefined => {
  const { validateOn, hasSubmitted } = useFormValidate();
  const effective = resolveEffectiveValidateOn(validateOn, hasSubmitted);

  return useMemo(() => {
    let resolved = validators;
    if (required) {
      const fieldLabel = requiredFieldLabel(label, name);
      const requiredValidator: ValidatorFn = ({ value }) => (isEmpty(value) ? `${fieldLabel} is required` : undefined);
      if (validators) {
        const existingOnSubmit = validators.onSubmit;
        const composedOnSubmit: ValidatorFn = isValidatorFn(existingOnSubmit)
          ? ({ value }) => existingOnSubmit({ value }) ?? requiredValidator({ value })
          : requiredValidator;
        resolved = { ...validators, onSubmit: composedOnSubmit };
      } else {
        resolved = { onSubmit: requiredValidator };
      }
    }
    return remapValidatorsForTiming(resolved, effective);
  }, [required, validators, label, name, isEmpty, effective]);
};

export const mergeFieldHandler =
  <TValue, TArgs extends unknown[]>(
    field: SimpleFieldApi<TValue>,
    name: 'handleBlur' | 'handleChange',
    handler?: (...args: TArgs) => void,
  ): ((...args: TArgs) => void) =>
  (...args: TArgs) => {
    // SAFETY: handleBlur/handleChange are only ever invoked with the args the caller's own event handler received, which is what TanStack's field handlers accept at runtime.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- field handlers are typed per-name; the merged handler forwards the caller's event args verbatim
    (field[name] as (...fieldArgs: TArgs) => void)(...args);
    handler?.(...args);
  };

/**
 * State props type for control knob recipes.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, typescript/no-explicit-any -- exported type consumed by Switch/RadioGroup JSX style props; unknown values would break their assignability
type ControlStateProps = Record<string, any> | undefined;

/**
 * Strip borderRadius from state props. Use for controls that must maintain
 * a fixed shape (e.g., Radio buttons are always circular).
 */
export const stripRadiusFromStateProps = (props: ControlStateProps): ControlStateProps => {
  if (props === undefined || !('borderRadius' in props)) {
    return props;
  }
  const rest = { ...props };
  delete rest.borderRadius;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

/**
 * Radius resolution class. Same vocabulary as theme `RadiusResolutionClass`
 * (`resolveRadiusClass`).
 */
export type StatePropsRadiusClass = 'DEFAULT' | 'CIRCULAR-AT-FULL' | 'BINARY' | 'CONTAINER-CAP';

export interface ClampRadiusInStatePropsOptions {
  maxTokenNum?: number;
  /**
   * Anatomy class the bag is being applied to. BINARY (thumb AND track)
   * resolves to 0 or h/2; a token clamp must not
   * inject an intermediate radius onto either part.
   */
  radiusClass?: StatePropsRadiusClass;
  /** The part's own painted height (shorter edge). Required for BINARY. */
  heightPx?: number;
}

const STATE_STYLE_KEYS = ['hoverStyle', 'pressStyle', 'focusStyle', 'focusVisibleStyle'] as const;

/**
 * Token/stop-name lookup DERIVED from `borderRadiusMap` — the same single
 * source `otpRadiusStop` reads a few lines up. A hand-kept second copy of the
 * token scale is how this file would end up with two answers for one stop, so
 * there is only one (ONE-IMPLEMENTATION).
 */
const RADIUS_TOKEN_TO_STOP = new Map<string, BorderRadius>(
  BORDER_RADIUS_STOPS.flatMap((stop) => [
    [stop, stop],
    [borderRadiusMap[stop], stop],
  ]),
);

/**
 * A state bag carries whatever the recipe put in it — a stop name, a radius
 * token, or a raw px value. An unrecognized value resolves to `full`, which
 * for BINARY is h/2: the safe direction, because the class has no
 * intermediate value to fall back to.
 */
const radiusValueToStop = (value: RadiusValue): BorderRadius => {
  if (value == null || value === 0) {
    return 'none';
  }
  const key = String(value).trim();
  if (key === '0' || key === '0px') {
    return 'none';
  }
  return RADIUS_TOKEN_TO_STOP.get(key) ?? 'full';
};

/**
 * BINARY class contract: none is square, every other stop is h/2,
 * and tracks square with their thumbs.
 *
 * The table is NOT restated here. It is read from the doctrine-GENERATED
 * resolver in `@repo/theme`, so a DG-RAD edit reaches per-state
 * override bags the same way it reaches the base radius — a local copy of the
 * BINARY row would keep answering with the old doctrine.
 *
 * The `heightPx` guard is the CALLER's contract rather than the table's: the
 * doctrine only needs a height for the h/2 stops, but a part that declares
 * BINARY without its height would resolve at `none` and throw at every other
 * stop. Refusing up front beats working in one state and throwing in the next.
 */
const resolveBinaryStateRadius = (value: RadiusValue, heightPx: number | undefined): number => {
  if (heightPx === undefined || heightPx <= 0) {
    throw new Error(
      "clampRadiusInStateProps: BINARY resolves to 0 or h/2 and needs heightPx — the part's own painted height (shorter edge)",
    );
  }
  return resolveRadiusClass('BINARY', radiusValueToStop(value), { heightPx });
};

const clampOneStateRadius = (
  borderRadius: RadiusValue,
  options: { maxTokenNum: number; radiusClass?: StatePropsRadiusClass; heightPx?: number },
): string | number => {
  if (options.radiusClass === 'BINARY') {
    return resolveBinaryStateRadius(borderRadius, options.heightPx);
  }
  return clampRadiusForControl(borderRadius === undefined ? undefined : String(borderRadius), options.maxTokenNum);
};

const isClampOptions = (
  value: number | ClampRadiusInStatePropsOptions | undefined,
): value is ClampRadiusInStatePropsOptions => typeof value === 'object' && value !== null;

const hasBorderRadius = (value: unknown): value is { borderRadius?: string | number } =>
  typeof value === 'object' && value !== null && 'borderRadius' in value;

/**
 * Clamp borderRadius in a per-state override bag.
 *
 * Default (no class / DEFAULT): token clamp so a control cannot go fully
 * circular. BINARY: the bag resolves to 0 or h/2 — never an intermediate
 * token. A hover/press/focus/focusVisible radius cannot turn a thumb or
 * track into a partly-rounded shape.
 */
export const clampRadiusInStateProps = (
  props: ControlStateProps,
  maxTokenNumOrOptions: number | ClampRadiusInStatePropsOptions = 6,
): ControlStateProps => {
  if (props === undefined) {
    return props;
  }
  const options = isClampOptions(maxTokenNumOrOptions)
    ? {
        maxTokenNum: maxTokenNumOrOptions.maxTokenNum ?? 6,
        radiusClass: maxTokenNumOrOptions.radiusClass,
        heightPx: maxTokenNumOrOptions.heightPx,
      }
    : { maxTokenNum: maxTokenNumOrOptions };

  const nested = STATE_STYLE_KEYS.flatMap((key) => {
    const bag: unknown = props[key];
    return hasBorderRadius(bag) ? [[key, bag] as const] : [];
  });
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- hasBorderRadius is a structural guard over untyped recipe bags
  const ownRadius: { borderRadius?: string | number } | undefined = hasBorderRadius(props) ? props : undefined;
  if (ownRadius === undefined && nested.length === 0) {
    return props;
  }

  const next = { ...props };
  if (ownRadius !== undefined) {
    next.borderRadius = clampOneStateRadius(ownRadius.borderRadius, options);
  }
  for (const [key, bag] of nested) {
    next[key] = {
      ...bag,
      borderRadius: clampOneStateRadius(bag.borderRadius, options),
    };
  }
  return next;
};
