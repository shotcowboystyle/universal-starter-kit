/** Platform floor for interactive targets (Fluent/HIG web+iOS 44; M3 48 on Android). */
export const MIN_PRESS_TARGET = 44;

export interface HitSlopInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Expand hit area when the visual control is smaller than the floor. */
export const pressTargetHitSlop = (visualSize: number, min: number = MIN_PRESS_TARGET): HitSlopInsets => {
  const pad = Math.max(0, Math.ceil((min - visualSize) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
};
