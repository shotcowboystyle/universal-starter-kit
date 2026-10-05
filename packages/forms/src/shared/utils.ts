import type { BorderRadius, ElevationStateProps, KnobProps, KnobRecipe, ResolvedKnobs } from '@repo/theme';
import { borderRadiusMap, isTouchSurface, resolveRadiusClass, sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import { type ReactNode, useId, useMemo } from 'react';
import type { SizeTokens } from 'tamagui';

import { useFormContext, useFormValidate } from '../Form';
import { remapValidatorsForTiming, resolveEffectiveValidateOn } from '../Form/validateOn';
import type { AnyFormApi, SimpleFieldApi } from '../types';

/**
 * Resolve a size token to its recipe height, optionally multiplied by a row count.
 * e.g. getFieldHeight("$4") → 32, getFieldHeight("$4", 3) → 96
 */
export function getFieldHeight(sizeToken: SizeTokens, rows = 1, touch = isTouchSurface()): number {
  return sizeRecipeForToken(String(sizeToken), { touch }).height * rows;
}

function clampRadius(radiusToken: string | undefined, maxTokenNum: number, fallback: string): string | 0 {
  if (!radiusToken) {
    return fallback;
  }
  if (radiusToken === '$0') {
    return 0;
  }
  if (typeof radiusToken === 'string' && radiusToken.startsWith('$')) {
    const num = Number.parseInt(radiusToken.slice(1), 10);
    return num > maxTokenNum ? `$${maxTokenNum}` : radiusToken;
  }
  return radiusToken;
}

/**
 * Clamp border radius token so controls (buttons, inputs, checkbox) don't become
 * fully circular/pill-shaped when knob is "full". Returns token string e.g. "$4".
 */
export function clampRadiusForControl(radiusToken: string | undefined, maxTokenNum = 6): string | 0 {
  return clampRadius(radiusToken, maxTokenNum, '$4');
}

/**
 * Clamp border radius for large multi-line components (TextArea, RichTextEditor,
 * CodeEditor, FileUpload dropzone, etc.). These components should never have
 * pill-shaped corners as it wastes space and looks odd.
 *
 * Max default is $4 which provides subtle rounding without being excessive.
 */
export function clampRadiusForLargeComponent(radiusToken: string | undefined, maxTokenNum = 4): string | 0 {
  return clampRadius(radiusToken, maxTokenNum, '$3');
}

type OtpRadiusStop = keyof typeof borderRadiusMap;

const OTP_RADIUS_STOPS = Object.keys(borderRadiusMap) as OtpRadiusStop[];

function otpRadiusStop(radiusToken: string | undefined): OtpRadiusStop {
  if (radiusToken == null) {
    return 'medium';
  }
  for (const stop of OTP_RADIUS_STOPS) {
    if (stop === radiusToken || borderRadiusMap[stop] === radiusToken) {
      return stop;
    }
  }
  throw new Error(`getOTPCellRadius: "${radiusToken}" is not a borderRadiusMap token; cannot resolve CIRCULAR-AT-FULL`);
}

/**
 * OTP cells are CIRCULAR-AT-FULL: ride the token scale,
 * true circle at full = the cell's own height/2 — never a raw 1000 / browser
 * clamp. Equal-w/h parts; single-line controls are the pill case of the same
 * family (leftover). Thin alias over resolveRadiusClass.
 */
export function getOTPCellRadius(radiusToken: string | undefined, heightPx: number): number {
  return resolveRadiusClass('CIRCULAR-AT-FULL', otpRadiusStop(radiusToken), { heightPx });
}

/**
 * Build elevation props for a wrapper View around HOC-based components.
 *
 * Tamagui's create* HOC chains (createCheckbox, createSwitch, etc.) swallow
 * the elevation variant. Spread the complete `elevationChrome` fragment from
 * resolveKnobs — scheme-aware tint lives on `inputBackground` /
 * `elevatedSurface`, not here.
 */
export function getElevationWrapperProps(
  knobProps: KnobProps,
  elevationRecipe: KnobRecipe<ElevationStateProps>,
): Record<string, any> {
  const elevation = knobProps.elevation;
  if (
    !elevation &&
    !elevationRecipe.hoverKnobProps?.elevation &&
    !elevationRecipe.pressKnobProps?.elevation &&
    !elevationRecipe.focusVisibleKnobProps?.elevation
  ) {
    return {};
  }
  const props: Record<string, any> = {
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
  if (knobProps.transition) {
    props.animation = knobProps.transition;
  }
  return props;
}

export function useFormField(props: { form?: AnyFormApi; id?: string; compact?: boolean; size?: SizeTokens }): {
  resolvedForm: AnyFormApi | undefined;
  id: string;
} & ResolvedKnobs {
  const formContext = useFormContext();
  const resolvedForm = (props.form || formContext || undefined) as AnyFormApi | undefined;
  const resolved = useResolvedKnobs({ compact: props.compact, size: props.size });
  const generatedId = useId();
  const id = props.id || generatedId;
  return { resolvedForm, ...resolved, id };
}

export function getFieldError(field: SimpleFieldApi<any>, propError?: string | boolean): string | boolean | undefined {
  const fieldError = field.state.meta.errors.length ? String(field.state.meta.errors[0]) : undefined;
  return propError ?? fieldError;
}

const defaultIsEmpty = (v: unknown) => v == null || v === '';

export function useResolvedValidators(
  required: boolean | undefined,
  validators: Record<string, unknown> | undefined,
  label?: ReactNode,
  name?: string,
  isEmpty: (value: unknown) => boolean = defaultIsEmpty,
): Record<string, unknown> | undefined {
  const { validateOn, hasSubmitted } = useFormValidate();
  const effective = resolveEffectiveValidateOn(validateOn, hasSubmitted);

  return useMemo(() => {
    let resolved = validators;
    if (required) {
      const requiredValidator = ({ value }: { value: unknown }) =>
        isEmpty(value) ? `${typeof label === 'string' ? label : name || 'Field'} is required` : undefined;
      if (!validators) {
        resolved = { onSubmit: requiredValidator };
      } else {
        const existingOnSubmit = validators.onSubmit as ((...args: any[]) => any) | undefined;
        const composedOnSubmit = existingOnSubmit
          ? ({ value }: { value: unknown }) => existingOnSubmit({ value }) ?? requiredValidator({ value })
          : requiredValidator;
        resolved = { ...validators, onSubmit: composedOnSubmit };
      }
    }
    return remapValidatorsForTiming(resolved, effective);
  }, [required, validators, label, name, isEmpty, effective]);
}

export function mergeFieldHandler(
  field: SimpleFieldApi<any>,
  name: 'handleBlur' | 'handleChange',
  handler?: (...args: any[]) => void,
): (...args: any[]) => void {
  return (...args: any[]) => {
    (field[name] as (...args: any[]) => void)(...args);
    handler?.(...args);
  };
}

/**
 * State props type for control knob recipes.
 */
type ControlStateProps = Record<string, any> | undefined;

/**
 * Strip borderRadius from state props. Use for controls that must maintain
 * a fixed shape (e.g., Radio buttons are always circular).
 */
export function stripRadiusFromStateProps(props: ControlStateProps): ControlStateProps {
  if (!props || !('borderRadius' in props)) {
    return props;
  }
  const { borderRadius: _, ...rest } = props;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

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
const RADIUS_TOKEN_TO_STOP = Object.fromEntries(
  (Object.keys(borderRadiusMap) as BorderRadius[]).flatMap((stop) => [
    [stop, stop],
    [borderRadiusMap[stop], stop],
  ]),
) as Record<string, BorderRadius>;

/**
 * A state bag carries whatever the recipe put in it — a stop name, a radius
 * token, or a raw px value. An unrecognised value resolves to `full`, which
 * for BINARY is h/2: the safe direction, because the class has no
 * intermediate value to fall back to.
 */
function radiusValueToStop(value: unknown): BorderRadius {
  if (value == null || value === 0) {
    return 'none';
  }
  const key = String(value).trim();
  if (key === '0' || key === '0px') {
    return 'none';
  }
  return RADIUS_TOKEN_TO_STOP[key] ?? 'full';
}

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
function resolveBinaryStateRadius(value: unknown, heightPx: number | undefined): number {
  if (heightPx === undefined || heightPx <= 0) {
    throw new Error(
      "clampRadiusInStateProps: BINARY resolves to 0 or h/2 and needs heightPx — the part's own painted height (shorter edge)",
    );
  }
  return resolveRadiusClass('BINARY', radiusValueToStop(value), { heightPx });
}

function clampOneStateRadius(
  borderRadius: unknown,
  options: { maxTokenNum: number; radiusClass?: StatePropsRadiusClass; heightPx?: number },
): unknown {
  if (options.radiusClass === 'BINARY') {
    return resolveBinaryStateRadius(borderRadius, options.heightPx);
  }
  return clampRadiusForControl(
    typeof borderRadius === 'string' || borderRadius === undefined ? borderRadius : String(borderRadius),
    options.maxTokenNum,
  );
}

function isClampOptions(
  value: number | ClampRadiusInStatePropsOptions | undefined,
): value is ClampRadiusInStatePropsOptions {
  return typeof value === 'object' && value !== null;
}

/**
 * Clamp borderRadius in a per-state override bag.
 *
 * Default (no class / DEFAULT): token clamp so a control cannot go fully
 * circular. BINARY: the bag resolves to 0 or h/2 — never an intermediate
 * token. A hover/press/focus/focusVisible radius cannot turn a thumb or
 * track into a partly-rounded shape.
 */
export function clampRadiusInStateProps(
  props: ControlStateProps,
  maxTokenNumOrOptions: number | ClampRadiusInStatePropsOptions = 6,
): ControlStateProps {
  if (!props) {
    return props;
  }
  const options = isClampOptions(maxTokenNumOrOptions)
    ? {
        maxTokenNum: maxTokenNumOrOptions.maxTokenNum ?? 6,
        radiusClass: maxTokenNumOrOptions.radiusClass,
        heightPx: maxTokenNumOrOptions.heightPx,
      }
    : { maxTokenNum: maxTokenNumOrOptions, radiusClass: undefined, heightPx: undefined };

  const nestedKeys = STATE_STYLE_KEYS.filter(
    (key) => props[key] && typeof props[key] === 'object' && 'borderRadius' in props[key],
  );
  if (!('borderRadius' in props) && nestedKeys.length === 0) {
    return props;
  }

  const next: Record<string, any> = { ...props };
  if ('borderRadius' in props) {
    next.borderRadius = clampOneStateRadius(props.borderRadius, options);
  }
  for (const key of nestedKeys) {
    const bag = props[key] as Record<string, any>;
    next[key] = {
      ...bag,
      borderRadius: clampOneStateRadius(bag.borderRadius, options),
    };
  }
  return next;
}
