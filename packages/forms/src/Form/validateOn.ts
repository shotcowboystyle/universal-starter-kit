/**
 * Validation timing helpers (residual).
 *
 * Default is submit-only. After the first submit attempt, `"submit"` upgrades
 * to blur-then-change so inline errors clear live as the user edits.
 */

export type FormValidateOn = 'submit' | 'blur' | 'change';

/** Resolved listener set after applying the post-submit upgrade. */
export type EffectiveValidateOn = 'submit' | 'blur' | 'change' | 'blur-then-change';

export function resolveEffectiveValidateOn(validateOn: FormValidateOn, hasSubmitted: boolean): EffectiveValidateOn {
  if (validateOn === 'submit' && hasSubmitted) {
    return 'blur-then-change';
  }
  return validateOn;
}

function composeValidator(
  existing: ((args: { value: unknown }) => unknown) | undefined,
  fallback: (args: { value: unknown }) => unknown,
): (args: { value: unknown }) => unknown {
  if (!existing) {
    return fallback;
  }
  return (args) => existing(args) ?? fallback(args);
}

/**
 * Remap `onSubmit` validators onto blur/change listeners per timing policy.
 * Existing onBlur/onChange validators are preserved and composed (run first).
 */
export function remapValidatorsForTiming(
  validators: Record<string, unknown> | undefined,
  effective: EffectiveValidateOn,
): Record<string, unknown> | undefined {
  if (!validators || effective === 'submit') {
    return validators;
  }

  const onSubmit = validators.onSubmit as ((args: { value: unknown }) => unknown) | undefined;
  if (typeof onSubmit !== 'function') {
    return validators;
  }

  const next: Record<string, unknown> = { ...validators };
  const wantBlur = effective === 'blur' || effective === 'blur-then-change';
  const wantChange = effective === 'change' || effective === 'blur-then-change';

  if (wantBlur) {
    next.onBlur = composeValidator(validators.onBlur as ((args: { value: unknown }) => unknown) | undefined, onSubmit);
  }
  if (wantChange) {
    next.onChange = composeValidator(
      validators.onChange as ((args: { value: unknown }) => unknown) | undefined,
      onSubmit,
    );
  }
  return next;
}
