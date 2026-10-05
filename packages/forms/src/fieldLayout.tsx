import { useResolvedKnobs } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type { FieldApi } from '@tanstack/form-core';
import { Field as TanstackField } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { FontSizeTokens, LabelProps, SizeTokens, YStackProps } from 'tamagui';
import { isWeb, Paragraph, XStack, YStack } from 'tamagui';

import { fieldWidthStyle } from './fieldDefaults';
import { Label } from './Label';
import {
  formatRequiredMarkSuffix,
  mapHouseRequiredMarking,
  type RequiredMarkMode,
  useRequiredMarking,
} from './requiredMarking';
import { formCommonColors } from './shared/colorRamps';
import { warnBannedErrorWords, warnPlaceholderAsLabel } from './shared/devWarn';
import type { AnyFormApi, SimpleFieldApi } from './types';

const FieldDescribedByContext = createContext<string | undefined>(undefined);
export function useFieldDescribedBy() {
  return useContext(FieldDescribedByContext);
}

/**
 * Accessible-name STRINGS for the current field. The id-based wiring above
 * (`aria-labelledby` / `aria-describedby` / `htmlFor`) is web-only — iOS has
 * no equivalent, so native controls consume these strings directly as
 * `accessibilityLabel` / `accessibilityHint`.
 */
export interface FieldA11y {
  /** Visible label text incl. required mark (only when the label is a string). */
  label?: string;
  /** Error message when present, else helper text — VoiceOver hint. */
  description?: string;
  required?: boolean;
}

const FieldA11yContext = createContext<FieldA11y | undefined>(undefined);
export function useFieldA11y() {
  return useContext(FieldA11yContext);
}

// ── Helper ────────────────────────────────────────────────────────────────────

function getHelperTextSize(size?: SizeTokens): FontSizeTokens {
  if (!size) {
    return '$1';
  }
  const sizeMap: Record<string, FontSizeTokens> = {
    $1: '$1',
    $2: '$1',
    $3: '$2',
    $4: '$3',
    $5: '$4',
    $6: '$5',
    $7: '$6',
    $8: '$7',
    $9: '$8',
    $10: '$9',
    $11: '$10',
    $12: '$11',
    $13: '$12',
    $14: '$13',
    $15: '$14',
    $16: '$15',
    $17: '$16',
  };
  return sizeMap[size.toString()] || '$1';
}

// ── FieldLayout ──────────────────────────────────────────────────────────────

export interface FieldLayoutProps {
  id?: string;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  error?: string | boolean;
  field?: FieldApi<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >;
  helperText?: string;
  required?: boolean;
  /**
   * Required/optional mark mode. Prefers form/schema context
   * from {@link useRequiredMarking}; defaults to `"asterisk"` standalone.
   */
  requiredMarking?: RequiredMarkMode;
  /**
   * When true, the *control* is disabled — the Field label and helper stay
   * fully opaque/readable. Never dims the FieldLayout wrapper.
   */
  disabled?: boolean;
  size?: SizeTokens;
  knobProps?: KnobProps;
  onBlur?: (...args: any[]) => void;
  /**
   * Use compact spacing between field and helper/error text.
   * Useful for inline-label fields (checkbox, switch) where the label
   * is beside the control rather than above it.
   */
  compactSpacing?: boolean;
  /**
   * Semantic content purpose. Drives default maxWidth in `ch`
   * via `FIELD_WIDTH_BY_PURPOSE`. Explicit `maxWidth` / `width` eject.
   */
  purpose?: string;
  /**
   * HTML autocomplete token. When `purpose` is omitted, maps to a purpose
   * (e.g. `postal-code` → postalCode) for default width.
   */
  autoComplete?: string;
  /**
   * Placeholder on the inner control — used only for the DEV
   * placeholder-as-label guardrail. Not rendered.
   */
  placeholder?: string;
  /**
   * Accessible name when there is no visible label. Suppresses the
   * placeholder-as-label DEV warning when set.
   */
  'aria-label'?: string;
  /** Eject: override purpose-derived maxWidth. */
  maxWidth?: number | string;
  /** Eject: override purpose-derived width. */
  width?: number | string;
  children: ReactNode;
}

export function FieldLayout({
  id,
  label,
  labelProps,
  error: propError,
  field,
  helperText,
  required,
  requiredMarking: requiredMarkingProp,
  disabled: _disabled,
  size,
  knobProps: knobPropsProp,
  onBlur,
  compactSpacing,
  purpose,
  autoComplete,
  placeholder,
  'aria-label': ariaLabel,
  maxWidth,
  width,
  children,
}: FieldLayoutProps) {
  const { knobProps: resolvedKnobs, disabledState } = useResolvedKnobs();
  const knobProps = knobPropsProp ?? resolvedKnobs;
  const markingCtx = useRequiredMarking();
  const markMode: RequiredMarkMode =
    requiredMarkingProp ?? markingCtx?.mode ?? mapHouseRequiredMarking(knobProps.requiredMarking);
  const requiredSuffix = formatRequiredMarkSuffix(required, markMode);
  // Axiom 5 eject-last: an explicit consumer `error` prop is an eject and wins
  // over field-meta errors — same contract as getFieldError (shared/utils.ts).
  const fieldError = field?.state.meta.errors.length ? String(field.state.meta.errors[0]) : undefined;
  const error = propError ?? fieldError;
  const errorMessage = typeof error === 'string' && error.length > 0 ? error : undefined;
  const hasErrorState = Boolean(error);
  const helperSize = getHelperTextSize(size || knobProps.sizeToken);
  const disabledStyle = knobProps.disabledStyle ?? 'keepLabel';
  const dimWhole = Boolean(_disabled) && disabledStyle === 'dimWhole';
  const keepLabelReadable = Boolean(_disabled) && disabledStyle !== 'dimWhole';
  const labelPlacement = knobProps.fieldLabelPlacement ?? 'top';
  const sideLabel = labelPlacement === 'side' && Boolean(label) && !compactSpacing;

  warnPlaceholderAsLabel({
    placeholder,
    label,
    ariaLabel,
    id,
    component: 'FieldLayout',
  });
  if (errorMessage) {
    warnBannedErrorWords(errorMessage, { component: 'FieldLayout', id });
  }

  // Use compact gap for inline-label fields (checkbox, switch) or when explicitly requested
  const useCompact = compactSpacing || !label;
  const gapProps = useCompact ? { gap: '$1' } : knobProps.gap;

  // Purpose / autocomplete → default width; explicit maxWidth/width win.
  const purposeWidth =
    maxWidth !== undefined || width !== undefined ? undefined : fieldWidthStyle(purpose, autoComplete);
  const widthProps = {
    ...purposeWidth,
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(width !== undefined ? { width } : {}),
  };

  const describedBy = id ? (errorMessage ? `${id}-error` : helperText ? `${id}-description` : undefined) : undefined;

  const a11yLabel = typeof label === 'string' ? `${label}${requiredSuffix}` : ariaLabel;
  const a11yDescription = errorMessage ?? helperText;
  const fieldA11y = useMemo<FieldA11y>(
    () => ({ label: a11yLabel, description: a11yDescription, required }),
    [a11yLabel, a11yDescription, required],
  );

  // iOS has no aria-live regions — speak new errors explicitly. Web keeps the
  // role="alert" / aria-live wiring on the error Paragraph below.
  useEffect(() => {
    if (!isWeb && errorMessage) {
      AccessibilityInfo.announceForAccessibility(errorMessage);
    }
  }, [errorMessage]);

  // On web, tamagui's Label resolves `htmlFor` and PREPENDS its own id onto
  // that control's `aria-labelledby` — so a labelled field is already wired
  // and a control that also sets `aria-labelledby={`${id}-label`}` ends up
  // with the token twice and an accessible name spoken twice ("Birth Date
  // Birth Date"). Controls carry the field `id` and an `aria-label` fallback
  // for the label-less case; they must not name themselves when a Label exists.
  // House Label owns T-LABEL (weight 400) and must not receive a
  // control-height sizeToken. Required mark is applied once here
  // via the house `required` prop — do not also suffix children.
  const labelNode = label ? (
    <Label
      id={id ? `${id}-label` : undefined}
      htmlFor={id}
      required={required}
      requiredMarking={requiredMarkingProp}
      error={hasErrorState}
      fontWeight="400"
      flexShrink={sideLabel ? 0 : undefined}
      {...labelProps}>
      {label}
    </Label>
  ) : null;

  const helperNode =
    helperText && !errorMessage ? (
      <Paragraph
        id={id ? `${id}-description` : undefined}
        size={helperSize}
        {...knobProps.body}
        color={formCommonColors.text}
        opacity={keepLabelReadable ? 1 : undefined}>
        {helperText}
      </Paragraph>
    ) : null;

  const errorNode = errorMessage ? (
    <Paragraph
      id={id ? `${id}-error` : undefined}
      size={helperSize}
      {...knobProps.body}
      color={formCommonColors.error}
      role="alert"
      aria-live="polite">
      {errorMessage}
    </Paragraph>
  ) : null;

  const controlColumn = (
    <YStack flex={sideLabel ? 1 : undefined} {...gapProps}>
      {helperNode}
      {errorNode}
      {children}
    </YStack>
  );

  return (
    <FieldDescribedByContext.Provider value={describedBy}>
      <FieldA11yContext.Provider value={fieldA11y}>
        <YStack
          theme={hasErrorState ? 'error' : undefined}
          // The assembly-wide dim (label included) rides the resolved
          // recipe and is populated only under `dimWhole`; `keepLabel`
          // treatment lives on the control chrome itself.
          opacity={1}
          {...(dimWhole ? disabledState.assemblyKnobProps : undefined)}
          {...(sideLabel ? {} : gapProps)}
          {...widthProps}
          onBlur={onBlur}
          data-disabled-style={disabledStyle}
          data-disabled-dimmed={dimWhole ? 'true' : 'false'}
          data-label-placement={sideLabel ? 'side' : 'top'}>
          {sideLabel ? (
            <XStack
              alignItems="flex-start"
              {...knobProps.gap}
              width="100%"
              data-label-placement="side"
              data-gap={String(knobProps.gap.gap)}>
              {labelNode}
              {controlColumn}
            </XStack>
          ) : (
            <>
              {labelNode}
              {helperNode}
              {errorNode}
              {children}
            </>
          )}
        </YStack>
      </FieldA11yContext.Provider>
    </FieldDescribedByContext.Provider>
  );
}

export type FormFieldProps<
  _TParentData = Record<string, unknown>,
  _TName extends string = string,
  _TFieldValidator = unknown,
  _TFormValidator = unknown,
  _TData = unknown,
> = FieldLayoutProps & Omit<YStackProps, keyof FieldLayoutProps>;

// ── Field (typed TanStack Field wrapper) ──────────────────────────────────────

export interface FieldProps<_TParentData = Record<string, unknown>, TName extends string = string, TValue = unknown> {
  name: TName;
  form?: AnyFormApi<any>;
  defaultValue?: TValue;
  mode?: 'value' | 'array';
  preserveValue?: boolean;
  validators?: Record<string, unknown>;
  children: (field: SimpleFieldApi<TValue>) => ReactNode;
}

export const Field = TanstackField as <
  TParentData = Record<string, unknown>,
  TName extends string = string,
  TValue = unknown,
>(
  props: FieldProps<TParentData, TName, TValue>,
) => ReactNode;
