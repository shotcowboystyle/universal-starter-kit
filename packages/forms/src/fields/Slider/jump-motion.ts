import { isTouchSurface, sizeRecipeForToken } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';

/**
 * Jump motion for NATIVE: the RN animation driver
 * (`@tamagui/animations-react-native`) partitions `left`/`top`/`right`/
 * `bottom`/`width`/`height` into the non-animated style object before
 * `animateOnly` is consulted, so the thumb's `left: <percent>%` position can
 * never tween natively. Discrete jumps instead ride `transform: translateX`
 * via a FLIP: the layout value snaps to the target while a transform delta
 * (previous position − new position) is applied in the same commit, then
 * animated to 0 on the next frame so the thumb visually glides.
 *
 * Web is untouched: the css driver interpolates `left`/`transform` fine, and
 * the Slider keeps its existing string `transition` session behavior there.
 */

/**
 * `transition="none"` is NOT instant on the RN driver: "none" is not a
 * registered animation token, so the config lookup returns `{}` and the
 * driver falls back to a DEFAULT RN spring. A per-property 0-duration timing
 * is truly instant — and on the JS driver it applies synchronously inside the
 * layout-effect runner, landing in the same frame as the layout snap (no
 * teleport-flash frame between FLIP phases).
 */
export const INSTANT_X_TRANSITION = {
  x: { type: 'timing', duration: 0 },
} as const;

/**
 * Fallback settle window when the motion token's physics are unknown (token
 * missing from the config, or a config shape we cannot model). When the
 * physics ARE known, the release is scheduled analytically instead — see
 * {@link getJumpSettleMs}.
 */
export const NATIVE_JUMP_SETTLE_MS = 550;

/**
 * The FLIP override is released only once the spring's residual envelope has
 * decayed below this many px, so removing the override (which snaps the
 * transform to the base under an instant transition) can never produce a
 * visible pop (>0.5pt frame delta) across the release boundary.
 */
export const JUMP_RELEASE_THRESHOLD_PX = 0.25;

/** Deltas smaller than this are not worth arming a session for. */
const MIN_JUMP_DELTA_PX = 0.5;

/** Bounds for the analytic settle window (sanity clamp). */
const MIN_SETTLE_MS = 250;
const MAX_SETTLE_MS = 2000;
const TIMING_SETTLE_BUFFER_MS = 50;

export type SliderJumpPhase = 'apply' | 'animate';

export interface SliderJumpFlip {
  phase: SliderJumpPhase;
  /** Sorted values the slider lands on (mirrors tamagui's updateValues). */
  targetValues: number[];
  /**
   * Index (within the sorted target values) of the ONE thumb whose value
   * jumped. The FLIP session is scoped strictly to this thumb: other thumbs
   * never receive an `x` override, so they cannot shift when a session arms
   * or pop when it releases.
   */
  movedIndex: number;
  /** Visual px offset from the target back to the origin for the moved thumb. */
  delta: number;
}

/** Motion props spread onto a thumb frame (native only; `{}` when disabled). */
export interface SliderThumbMotionProps {
  transition?: typeof INSTANT_X_TRANSITION | { x: string };
  x?: number;
}

/**
 * Mirrors tamagui `convertValueToPercentage` (same operation order so the
 * computed base translateX is bit-identical to the internal positional style).
 */
export function convertSliderValueToPercent(value: number, min: number, max: number): number {
  const maxSteps = max - min;
  if (maxSteps === 0) {
    return 0;
  }
  const percentPerStep = 100 / maxSteps;
  return percentPerStep * (value - min);
}

/** Mirrors tamagui's updateValues step-snap + clamp for a raw pointer value. */
export function snapSliderValue(raw: number, min: number, max: number, step: number): number {
  const decimalCount = (String(step).split('.')[1] || '').length;
  const rounder = 10 ** decimalCount;
  const stepped = Math.round((raw - min) / step) * step + min;
  const rounded = Math.round(stepped * rounder) / rounder;
  return Math.min(max, Math.max(min, rounded));
}

/** Mirrors tamagui `getClosestValueIndex`. */
export function getClosestThumbIndex(values: number[], next: number): number {
  if (values.length === 1) {
    return 0;
  }
  const distances = values.map((value) => Math.abs(value - next));
  const closestDistance = Math.min(...distances);
  return distances.indexOf(closestDistance);
}

/** Mirrors tamagui `getNextSortedValues`. */
export function getNextSortedValues(values: number[], next: number, atIndex: number): number[] {
  const nextValues = [...values];
  nextValues[atIndex] = next;
  return nextValues.sort((a, b) => a - b);
}

/** Mirrors tamagui `hasMinStepsBetweenValues` (rejected clicks never move). */
export function hasMinStepsBetween(values: number[], minStepsBetweenValues: number): boolean {
  if (minStepsBetweenValues <= 0) {
    return true;
  }
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i + 1] - values[i] < minStepsBetweenValues) {
      return false;
    }
  }
  return true;
}

/**
 * The RENDERED thumb diameter used by jump FLIP math (and the visual thumb
 * size once the slider frame applies it).
 *
 * Visual size is the size-recipe height for the token — not
 * Tamagui's `getSize(token, { shift: -1 })` nor the unshifted size ramp
 * (`$4` is 32, not 44). Radius is not on the recipe; circular vs square
 * does not change diameter.
 */
export function getSliderThumbRenderSize(sizeToken: string, _circular?: boolean, touch = isTouchSurface()): number {
  return sizeRecipeForToken(sizeToken, { touch }).height;
}

/**
 * Replica of the thumb's internal horizontal translateX (LTR):
 * `(getThumbInBoundsOffset(size, percent, 1) - size / 2)` — tamagui offsets
 * the thumb by a quarter-width so it overhangs the track ends slightly.
 * Same operation order as tamagui so the fallback (override removed after the
 * session) resolves to the exact same number and never nudges the thumb.
 * `thumbSize` MUST be the rendered size ({@link getSliderThumbRenderSize}) —
 * tamagui recomputes this offset from its measured layout size.
 */
export function getThumbBaseX(percent: number, thumbSize: number): number {
  const quarterWidth = thumbSize / 4;
  const offset = (quarterWidth / 50) * percent;
  return quarterWidth - offset - thumbSize / 2;
}

export interface JumpDeltaContext {
  min: number;
  max: number;
  trackWidth: number;
  thumbSize: number;
}

/**
 * Pixel distance the thumb's visual position moves between two values.
 * visualX(p) = trackWidth·p/100 + baseX(p) ⇒
 * Δ = (pOld − pNew)/100 · (trackWidth − thumbSize/2).
 */
export function getJumpDelta(
  oldValue: number,
  newValue: number,
  { min, max, trackWidth, thumbSize }: JumpDeltaContext,
): number {
  const oldPercent = convertSliderValueToPercent(oldValue, min, max);
  const newPercent = convertSliderValueToPercent(newValue, min, max);
  return ((oldPercent - newPercent) / 100) * (trackWidth - thumbSize / 2);
}

// ── Spring settle analytics ──────────────────────────────────────────────────
//
// The RN driver's spring (`Animated.spring` with damping/mass/stiffness) is
// the closed-form solution of a damped harmonic oscillator released from rest
// at the FLIP delta. Its rest thresholds (0.001) mean it converges to the
// base exactly, but a FIXED release timer either cuts long jumps early (the
// 1–4pt @550ms pop the sweep measured on 100–350pt jumps: the envelope is
// still ~1% of the amplitude at 550ms) or holds short ones too long. The
// release is therefore scheduled from the physics: the first time the
// residual envelope of THIS jump's amplitude is below
// {@link JUMP_RELEASE_THRESHOLD_PX}.

interface SpringConfigLike {
  type?: string;
  duration?: number;
  damping?: number;
  mass?: number;
  stiffness?: number;
}

interface SpringPhysics {
  /** Natural frequency ωn = √(k/m) in rad/s. */
  omega: number;
  /** Damping ratio ζ = c / (2√(k·m)). */
  zeta: number;
}

function getSpringPhysics(config: SpringConfigLike): SpringPhysics {
  // RN Animated.spring defaults for the stiffness/damping/mass parametrization.
  const stiffness = config.stiffness ?? 100;
  const damping = config.damping ?? 10;
  const mass = config.mass ?? 1;
  return {
    omega: Math.sqrt(stiffness / mass),
    zeta: damping / (2 * Math.sqrt(stiffness * mass)),
  };
}

/**
 * Monotone-decreasing bound on |x(t)|/|Δ| for a spring released from rest.
 * Underdamped: e^(−ζωt)/√(1−ζ²); critically/overdamped: the exact (monotone)
 * response itself.
 */
function springEnvelopeRatio({ omega, zeta }: SpringPhysics, tSec: number): number {
  if (zeta < 1) {
    return Math.exp(-zeta * omega * tSec) / Math.sqrt(1 - zeta * zeta);
  }
  const root = Math.sqrt(Math.max(zeta * zeta - 1, 0));
  if (root < 1e-6) {
    return (1 + omega * tSec) * Math.exp(-omega * tSec);
  }
  const r1 = omega * (zeta - root);
  const r2 = omega * (zeta + root);
  return (r2 * Math.exp(-r1 * tSec) - r1 * Math.exp(-r2 * tSec)) / (r2 - r1);
}

/**
 * Ms until a jump of `deltaPx` animated with `config` has a residual envelope
 * below `thresholdPx` — i.e. the earliest safe moment to release the FLIP
 * override with no visible pop. Unknown configs fall back to
 * {@link NATIVE_JUMP_SETTLE_MS}.
 */
export function getJumpSettleMs(
  config: unknown,
  deltaPx: number,
  thresholdPx: number = JUMP_RELEASE_THRESHOLD_PX,
): number {
  if (!config || typeof config !== 'object') {
    return NATIVE_JUMP_SETTLE_MS;
  }
  const cfg = config as SpringConfigLike;
  if (cfg.type === 'timing') {
    return clampSettleMs((cfg.duration ?? 250) + TIMING_SETTLE_BUFFER_MS);
  }
  if (cfg.type !== undefined && cfg.type !== 'spring') {
    return NATIVE_JUMP_SETTLE_MS;
  }
  const absDelta = Math.abs(deltaPx);
  if (absDelta <= thresholdPx) {
    return MIN_SETTLE_MS;
  }
  const physics = getSpringPhysics(cfg);
  const targetRatio = thresholdPx / absDelta;
  let lo = 0;
  let hi = MAX_SETTLE_MS / 1000;
  if (springEnvelopeRatio(physics, hi) > targetRatio) {
    return MAX_SETTLE_MS;
  }
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (springEnvelopeRatio(physics, mid) > targetRatio) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return clampSettleMs(hi * 1000);
}

function clampSettleMs(ms: number): number {
  return Math.min(MAX_SETTLE_MS, Math.max(MIN_SETTLE_MS, Math.ceil(ms)));
}

/**
 * Signed px offset from the base `elapsedMs` into a jump of `deltaPx` —
 * the closed-form spring position (released from rest). Used to re-anchor a
 * NEW session armed while the previous one is mid-flight (a re-tap folds the
 * in-flight residual into the new delta instead of teleporting the thumb to
 * where the old glide WOULD have ended).
 */
export function getSpringResidualPx(config: unknown, deltaPx: number, elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return deltaPx;
  }
  if (!config || typeof config !== 'object') {
    return 0;
  }
  const cfg = config as SpringConfigLike;
  if (cfg.type === 'timing') {
    const duration = cfg.duration ?? 250;
    return elapsedMs >= duration ? 0 : deltaPx * (1 - elapsedMs / duration);
  }
  if (cfg.type !== undefined && cfg.type !== 'spring') {
    return 0;
  }
  const { omega, zeta } = getSpringPhysics(cfg);
  const t = elapsedMs / 1000;
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    return (
      deltaPx * Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
    );
  }
  const root = Math.sqrt(Math.max(zeta * zeta - 1, 0));
  if (root < 1e-6) {
    return deltaPx * (1 + omega * t) * Math.exp(-omega * t);
  }
  const r1 = omega * (zeta - root);
  const r2 = omega * (zeta + root);
  return (deltaPx * (r2 * Math.exp(-r1 * t) - r1 * Math.exp(-r2 * t))) / (r2 - r1);
}

function valuesEqual(a: number[], b: number[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

export interface SliderJumpMotionOptions {
  /** False on web / vertical / rtl — every callback becomes a no-op. */
  enabled: boolean;
  min: number;
  max: number;
  step: number;
  /** Animation token for the glide (e.g. "quick"). */
  transitionToken: string;
  /** Slider values at mount; kept in sync via onInternalValueChange. */
  initialValues: number[];
  minStepsBetweenThumbs?: number;
  /** Reads the measured track width in px (0 = unmeasured, skips the FLIP). */
  getTrackWidth: () => number;
  /** RENDERED thumb diameter in px — see {@link getSliderThumbRenderSize}. */
  thumbSize: number;
  /**
   * Looks up the RN animation config object for a transition token so the
   * release can be scheduled from the spring physics. Missing/unknown configs
   * fall back to {@link NATIVE_JUMP_SETTLE_MS}.
   */
  resolveAnimationConfig?: (token: string) => unknown;
}

export interface SliderJumpMotion {
  flip: SliderJumpFlip | null;
  /** Track-press with the raw (unsnapped) pointer value from onSlideStart. */
  onTrackPress: (rawValue: number) => void;
  /** Every internal tamagui value change (fires from onValueChange). */
  onInternalValueChange: (values: number[]) => void;
  /** Thumb-grab drag session start — kills any in-flight jump session. */
  onDragStart: () => void;
  getThumbMotionProps: (index: number) => SliderThumbMotionProps;
}

/**
 * Session state machine: null → "apply" (delta committed instantly alongside
 * the layout snap) → "animate" (next frame; transform springs back to base)
 * → null (analytic settle window elapsed — residual envelope < 0.5pt — and
 * the override is removed with no visual change).
 * A drag session or a value change that diverges from the jump target demotes
 * the session immediately so drags stay 1:1. The session is scoped to
 * `movedIndex` only: other thumbs never carry an override.
 */
export function useSliderJumpMotion({
  enabled,
  min,
  max,
  step,
  transitionToken,
  initialValues,
  minStepsBetweenThumbs = 0,
  getTrackWidth,
  thumbSize,
  resolveAnimationConfig,
}: SliderJumpMotionOptions): SliderJumpMotion {
  const [flip, setFlip] = useState<SliderJumpFlip | null>(null);
  const internalValuesRef = useRef<number[]>(initialValues);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  /** When the "animate" phase (the actual spring) started, for re-anchoring. */
  const animateStartAtRef = useRef(0);

  const clearTimers = () => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const clearFlip = () => {
    clearTimers();
    setFlip(null);
  };

  // FLIP release: promote "apply" → "animate" one frame after the delta
  // commit so the driver springs the transform from the origin to the target,
  // and schedule the override release for when the spring has settled within
  // JUMP_RELEASE_THRESHOLD_PX of the base (never a visible pop).
  useEffect(() => {
    if (!flip || flip.phase !== 'apply') {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      animateStartAtRef.current = Date.now();
      const settleMs = getJumpSettleMs(resolveAnimationConfig?.(transitionToken), flip.delta);
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setFlip(null);
      }, settleMs);
      setFlip((current) => (current && current.phase === 'apply' ? { ...current, phase: 'animate' } : current));
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [flip]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );

  const onTrackPress = (rawValue: number) => {
    if (!enabled) {
      return;
    }
    const trackWidth = getTrackWidth();
    if (!trackWidth) {
      return;
    }
    const oldValues = internalValuesRef.current;
    if (!oldValues.length) {
      return;
    }
    const snapped = snapSliderValue(rawValue, min, max, step);
    const index = getClosestThumbIndex(oldValues, snapped);
    const targetValues = getNextSortedValues(oldValues, snapped, index);
    // Tamagui rejects the update outright in this case — no motion happens.
    if (!hasMinStepsBetween(targetValues, minStepsBetweenThumbs * step)) {
      return;
    }
    // Mirrors tamagui's `valueIndexToChangeRef = nextValues.indexOf(nextValue)`
    // — the thumb that visually moves after the sort.
    const movedIndex = targetValues.indexOf(snapped);
    const context: JumpDeltaContext = { min, max, trackWidth, thumbSize };
    let delta = getJumpDelta(oldValues[movedIndex] ?? snapped, snapped, context);
    const continuesLiveSession = flip !== null && flip.movedIndex === movedIndex;
    if (flip && continuesLiveSession) {
      // Re-tap while the previous glide is still in flight: fold the current
      // in-flight residual into the new delta so the thumb glides from where
      // it visually IS, not from where the old glide would have ended.
      delta +=
        flip.phase === 'apply'
          ? flip.delta
          : getSpringResidualPx(
              resolveAnimationConfig?.(transitionToken),
              flip.delta,
              Date.now() - animateStartAtRef.current,
            );
    }
    if (Math.abs(delta) < MIN_JUMP_DELTA_PX && !continuesLiveSession) {
      return;
    }
    clearTimers();
    setFlip({ phase: 'apply', targetValues, movedIndex, delta });
  };

  const onInternalValueChange = (values: number[]) => {
    internalValuesRef.current = values;
    if (!enabled || !flip) {
      return;
    }
    // A value diverging from the jump target means the pointer kept moving
    // after a track-press — demote to a 1:1 drag session.
    if (!valuesEqual(values, flip.targetValues)) {
      clearFlip();
    }
  };

  const onDragStart = () => {
    if (!enabled) {
      return;
    }
    clearFlip();
  };

  const getThumbMotionProps = (index: number): SliderThumbMotionProps => {
    if (!enabled) {
      return {};
    }
    // Session scoped strictly to the moved thumb: every other thumb keeps the
    // no-session props so it can never shift with the session or pop back.
    if (!flip || index !== flip.movedIndex) {
      return { transition: INSTANT_X_TRANSITION };
    }
    const value = flip.targetValues[index];
    if (value === undefined) {
      return { transition: INSTANT_X_TRANSITION };
    }
    const percent = convertSliderValueToPercent(value, min, max);
    const baseX = getThumbBaseX(percent, thumbSize);
    if (flip.phase === 'apply') {
      return {
        transition: INSTANT_X_TRANSITION,
        x: baseX + flip.delta,
      };
    }
    return { transition: { x: transitionToken }, x: baseX };
  };

  return {
    flip,
    onTrackPress,
    onInternalValueChange,
    onDragStart,
    getThumbMotionProps,
  };
}
