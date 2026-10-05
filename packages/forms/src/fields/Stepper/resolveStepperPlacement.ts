export type StepperButtonPosition = 'left' | 'right' | 'both';

/**
 * Default minus|value|plus. Stacked carets (left/right) are a desktop
 * eject; on a touch surface they coerce to `both`.
 */
export function resolveStepperPlacement(
  buttonPosition: StepperButtonPosition | undefined,
  touch: boolean,
): StepperButtonPosition {
  const requested = buttonPosition ?? 'both';
  if (touch && requested !== 'both') {
    return 'both';
  }
  return requested;
}
