import { useResolvedKnobs } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { Field as TanstackField } from '@tanstack/react-form';
import type { AnyFieldApi } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { FontSizeTokens, LabelProps, SizeTokens, YStackProps } from 'tamagui';
import { isWeb, Paragraph, XStack, YStack } from 'tamagui';

import { fieldWidthStyle } from './field-defaults';
import { Label } from './Label';
import { formatRequiredMarkSuffix, mapHouseRequiredMarking, useRequiredMarking } from './required-marking';
import type { RequiredMarkMode } from './required-marking';
import { formCommonColors } from './shared/color-ramps';
import { warnBannedErrorWords, warnPlaceholderAsLabel } from './shared/dev-warn';
import type { FieldValidators } from './shared/utils';
import type { AnyFormApi, SimpleFieldApi } from './types';

const FieldDescribedByContext = createContext<string | undefined>(undefined);
export const useFieldDescribedBy = () => useContext(FieldDescribedByContext);

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
export const useFieldA11y = () => useContext(FieldA11yContext);

// ── Helper ────────────────────────────────────────────────────────────────────

const HELPER_TEXT_SIZE_MAP = new Map<string, FontSizeTokens>(
  Object.entries({
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
  } satisfies Record<string, FontSizeTokens>),
);

const getHelperTextSize = (size?: SizeTokens): FontSizeTokens => {
  if (size === undefined || size === 0) {
    return '$1';
  }
  return HELPER_TEXT_SIZE_MAP.get(size.toString()) ?? '$1';
};

// ── FieldLayout ──────────────────────────────────────────────────────────────

export interface FieldLayoutProps {
  id?: string;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  error?: string | boolean;
  field?: AnyFieldApi;
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
  // oxlint-disable-next-line typescript/no-explicit-any -- ComponentProps<typeof FieldLayout>['onBlur'] is reused by Input/DatePicker as a handler type for blur, change and focus events; any narrower parameter type breaks their assignability
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

const firstFieldError = (field: AnyFieldApi | undefined): string | undefined => {
  const errors = field?.state.meta.errors;
  return errors !== undefined && errors.length > 0 ? String(errors[0]) : undefined;
};

const asNonEmptyString = (value: string | boolean | undefined): string | undefined =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `error` is string | boolean | undefined with no discriminant; only a non-empty string is a message
  typeof value === 'string' && value.length > 0 ? value : undefined;

const isNonEmpty = (value: string | undefined): value is string => value !== undefined && value !== '';

const suffixedId = (id: string | undefined, suffix: string): string | undefined =>
  isNonEmpty(id) ? `${id}-${suffix}` : undefined;

const describedByFor = (
  id: string | undefined,
  errorMessage: string | undefined,
  helperText: string | undefined,
): string | undefined => {
  if (errorMessage !== undefined) {
    return suffixedId(id, 'error');
  }
  return isNonEmpty(helperText) ? suffixedId(id, 'description') : undefined;
};

const resolveWidthProps = (
  { maxWidth, width }: Pick<FieldLayoutProps, 'maxWidth' | 'width'>,
  purpose: string | undefined,
  autoComplete: string | undefined,
): Pick<FieldLayoutProps, 'maxWidth' | 'width'> => {
  // Purpose / autocomplete → default width; explicit maxWidth/width win.
  const purposeWidth =
    maxWidth !== undefined || width !== undefined ? undefined : fieldWidthStyle(purpose, autoComplete);
  const widthProps: Pick<FieldLayoutProps, 'maxWidth' | 'width'> = { ...purposeWidth };
  if (maxWidth !== undefined) {
    widthProps.maxWidth = maxWidth;
  }
  if (width !== undefined) {
    widthProps.width = width;
  }
  return widthProps;
};

const resolveMarkMode = (
  explicit: RequiredMarkMode | undefined,
  context: ReturnType<typeof useRequiredMarking>,
  houseMarking: KnobProps['requiredMarking'],
): RequiredMarkMode => explicit ?? context?.mode ?? mapHouseRequiredMarking(houseMarking);

const a11yLabelFor = (label: ReactNode, requiredSuffix: string, ariaLabel: string | undefined): string | undefined =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label yields an accessible-name string
  typeof label === 'string' ? `${label}${requiredSuffix}` : ariaLabel;

const resolveDisabledFlags = (disabled = false, disabledStyle: KnobProps['disabledStyle'] = 'keepLabel') => {
  const isDimWhole = disabledStyle === 'dimWhole';
  return {
    disabledStyle,
    dimWhole: disabled && isDimWhole,
    keepLabelReadable: disabled && !isDimWhole,
  };
};

const isSideLabel = (placement: KnobProps['fieldLabelPlacement'], hasLabel: boolean, compactSpacing = false): boolean =>
  (placement ?? 'top') === 'side' && hasLabel && !compactSpacing;

const resolveHelperSize = (size: SizeTokens | undefined, knobSize: SizeTokens): FontSizeTokens =>
  getHelperTextSize(size === undefined || size === 0 ? knobSize : size);

interface FieldLayoutNodeContext {
  id: string | undefined;
  helperSize: FontSizeTokens;
  knobProps: KnobProps;
}

const renderHelperNode = (
  { id, helperSize, knobProps }: FieldLayoutNodeContext,
  helperText: string | undefined,
  hasError: boolean,
  keepLabelReadable: boolean,
) =>
  isNonEmpty(helperText) && !hasError ? (
    <Paragraph
      id={suffixedId(id, 'description')}
      size={helperSize}
      {...knobProps.body}
      color={formCommonColors.text}
      opacity={keepLabelReadable ? 1 : undefined}>
      {helperText}
    </Paragraph>
  ) : null;

const renderErrorNode = ({ id, helperSize, knobProps }: FieldLayoutNodeContext, errorMessage: string | undefined) =>
  errorMessage === undefined ? null : (
    <Paragraph
      id={suffixedId(id, 'error')}
      size={helperSize}
      {...knobProps.body}
      color={formCommonColors.error}
      role="alert"
      aria-live="polite">
      {errorMessage}
    </Paragraph>
  );

export const FieldLayout = ({
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
}: FieldLayoutProps) => {
  const { knobProps: resolvedKnobs, disabledState } = useResolvedKnobs();
  const knobProps = knobPropsProp ?? resolvedKnobs;
  const markingCtx = useRequiredMarking();
  const markMode = resolveMarkMode(requiredMarkingProp, markingCtx, knobProps.requiredMarking);
  const requiredSuffix = formatRequiredMarkSuffix(required, markMode);
  // Axiom 5 eject-last: an explicit consumer `error` prop is an eject and wins
  // over field-meta errors — same contract as getFieldError (shared/utils.ts).
  const error = propError ?? firstFieldError(field);
  const errorMessage = asNonEmptyString(error);
  const hasErrorState = Boolean(error);
  const helperSize = resolveHelperSize(size, knobProps.sizeToken);
  const { disabledStyle, dimWhole, keepLabelReadable } = resolveDisabledFlags(_disabled, knobProps.disabledStyle);
  const hasLabel = Boolean(label);
  const sideLabel = isSideLabel(knobProps.fieldLabelPlacement, hasLabel, compactSpacing);

  warnPlaceholderAsLabel({
    placeholder,
    label,
    ariaLabel,
    id,
    component: 'FieldLayout',
  });
  if (errorMessage !== undefined) {
    warnBannedErrorWords(errorMessage, { component: 'FieldLayout', id });
  }

  // Use compact gap for inline-label fields (checkbox, switch) or when explicitly requested
  const useCompact = compactSpacing === true || !hasLabel;
  const gapProps = useCompact ? { gap: '$1' } : knobProps.gap;

  const widthProps = resolveWidthProps({ maxWidth, width }, purpose, autoComplete);

  const describedBy = describedByFor(id, errorMessage, helperText);

  const a11yLabel = a11yLabelFor(label, requiredSuffix, ariaLabel);
  const a11yDescription = errorMessage ?? helperText;
  const fieldA11y = useMemo<FieldA11y>(
    () => ({ label: a11yLabel, description: a11yDescription, required }),
    [a11yLabel, a11yDescription, required],
  );

  // iOS has no aria-live regions — speak new errors explicitly. Web keeps the
  // role="alert" / aria-live wiring on the error Paragraph below.
  useEffect(() => {
    if (!isWeb && errorMessage !== undefined) {
      AccessibilityInfo.announceForAccessibility(errorMessage);
    }
  }, [errorMessage]);

  // On web, tamagui's Label resolves `htmlFor` and PREPENDS its own id onto
  // that control's `aria-labelledby` — so a labeled field is already wired
  // and a control that also sets `aria-labelledby={`${id}-label`}` ends up
  // with the token twice and an accessible name spoken twice ("Birth Date
  // Birth Date"). Controls carry the field `id` and an `aria-label` fallback
  // for the label-less case; they must not name themselves when a Label exists.
  // House Label owns T-LABEL (weight 400) and must not receive a
  // control-height sizeToken. Required mark is applied once here
  // via the house `required` prop — do not also suffix children.
  const labelNode = hasLabel ? (
    <Label
      id={suffixedId(id, 'label')}
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

  const nodeContext: FieldLayoutNodeContext = { id, helperSize, knobProps };
  const helperNode = renderHelperNode(nodeContext, helperText, errorMessage !== undefined, keepLabelReadable);
  const errorNode = renderErrorNode(nodeContext, errorMessage);

  const controlColumn = (
    <YStack
      flex={sideLabel ? 1 : undefined}
      {...gapProps}>
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
              data-gap={knobProps.gap.gap}>
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
};

export type FormFieldProps<
  _TParentData = object,
  _TName extends string = string,
  _TFieldValidator = unknown,
  _TFormValidator = unknown,
  _TData = unknown,
> = FieldLayoutProps & Omit<YStackProps, keyof FieldLayoutProps>;

// ── Field (typed TanStack Field wrapper) ──────────────────────────────────────

export interface FieldProps<_TParentData = object, TName extends string = string, TValue = unknown> {
  name: TName;
  form?: AnyFormApi;
  defaultValue?: TValue;
  mode?: 'value' | 'array';
  preserveValue?: boolean;
  validators?: FieldValidators;
  children: (field: SimpleFieldApi<TValue>) => ReactNode;
}

// SAFETY: TanstackField is generic over 23 form/field validator parameters; this narrows it to the single-value surface (FieldProps) that the package's fields use, which is a subset of TanstackField's runtime props.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- re-typing TanStack's 23-parameter Field to the package's simplified FieldProps
export const Field = TanstackField as <TParentData = object, TName extends string = string, TValue = unknown>(
  props: FieldProps<TParentData, TName, TValue>,
) => ReactNode;
