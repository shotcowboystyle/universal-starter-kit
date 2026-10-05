import { type RefObject, useCallback, useEffect, useRef } from 'react';

export interface UseWheelIncrementOptions {
  /** Function to call when incrementing */
  onIncrement: () => void;
  /** Function to call when decrementing */
  onDecrement: () => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is read-only */
  readOnly?: boolean;
  /** Minimum delta to trigger increment/decrement (helps with trackpad smoothness) */
  threshold?: number;
}

export interface UseWheelIncrementReturn {
  /** Props to spread onto the wrapper element (includes ref) */
  wheelProps: { ref: RefObject<HTMLDivElement | null> };
}

/**
 * Hook to enable mouse wheel increment/decrement on number inputs and similar controls.
 * Scrolling up increments, scrolling down decrements.
 *
 * Uses native event listener with { passive: false } to allow preventDefault(),
 * which is required because browsers treat wheel events as passive by default.
 */
export function useWheelIncrement(options: UseWheelIncrementOptions): UseWheelIncrementReturn {
  const { onIncrement, onDecrement, disabled, readOnly, threshold = 1 } = options;
  const ref = useRef<HTMLDivElement | null>(null);

  // Accumulate delta for smooth trackpad scrolling
  const accumulatedDelta = useRef(0);
  const lastWheelTime = useRef(0);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (disabled || readOnly) {
        return;
      }

      // Prevent page scroll - this only works with { passive: false }
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      // Reset accumulated delta if there's been a pause
      if (now - lastWheelTime.current > 150) {
        accumulatedDelta.current = 0;
      }
      lastWheelTime.current = now;

      // Accumulate the delta
      accumulatedDelta.current += e.deltaY;

      // Check if we've crossed the threshold
      if (Math.abs(accumulatedDelta.current) >= threshold * 30) {
        if (accumulatedDelta.current > 0) {
          onDecrement();
        } else {
          onIncrement();
        }
        accumulatedDelta.current = 0;
      }
    },
    [disabled, readOnly, onIncrement, onDecrement, threshold],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // Must use { passive: false } to allow preventDefault() on wheel events
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  return { wheelProps: { ref } };
}
