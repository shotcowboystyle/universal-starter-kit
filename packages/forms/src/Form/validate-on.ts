/**
 * Validation timing helpers (residual).
 *
 * Default is submit-only. After the first submit attempt, `"submit"` upgrades
 * to blur-then-change so inline errors clear live as the user edits.
 */

export type FormValidateOn = 'submit' | 'blur' | 'change';

/** Resolved listener set after applying the post-submit upgrade. */
export type EffectiveValidateOn = 'submit' | 'blur' | 'change' | 'blur-then-change';

const blurThenChange = 'blur-then-change';

export const resolveEffectiveValidateOn = (validateOn: FormValidateOn, hasSubmitted: boolean): EffectiveValidateOn => {
  if (validateOn === 'submit' && hasSubmitted) {
    return blurThenChange;
  }
  return validateOn;
};

/** A field validator: an error message when invalid, `undefined` when valid. */
type ValidatorFn = (args: { value: unknown }) => string | undefined;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack's validators bag is keyed by listener name (onChange, onBlur, onSubmit, ...) with heterogeneous values; it is the shape FieldValidators already has
type ValidatorBag = Record<string, unknown>;

const isValidatorFn = <T>(value: T): value is T & ValidatorFn => typeof value === 'function';

const composeValidator = (existing: ValidatorFn | undefined, fallback: ValidatorFn): ValidatorFn => {
  if (!existing) {
    return fallback;
  }
  return (args) => existing(args) ?? fallback(args);
};

/**
 * Remap `onSubmit` validators onto blur/change listeners per timing policy.
 * Existing onBlur/onChange validators are preserved and composed (run first).
 */
export const remapValidatorsForTiming = (
  validators: ValidatorBag | undefined,
  effective: EffectiveValidateOn,
): ValidatorBag | undefined => {
  if (!validators || effective === 'submit') {
    return validators;
  }

  const { onSubmit, onBlur, onChange } = validators;
  if (!isValidatorFn(onSubmit)) {
    return validators;
  }

  const next = { ...validators };
  const wantBlur = effective === 'blur' || effective === blurThenChange;
  const wantChange = effective === 'change' || effective === blurThenChange;

  if (wantBlur) {
    next.onBlur = composeValidator(isValidatorFn(onBlur) ? onBlur : undefined, onSubmit);
  }
  if (wantChange) {
    next.onChange = composeValidator(isValidatorFn(onChange) ? onChange : undefined, onSubmit);
  }
  return next;
};
