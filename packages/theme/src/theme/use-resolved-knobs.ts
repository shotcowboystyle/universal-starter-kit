import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { useThemeName } from 'tamagui';
import type { SizeTokens } from 'tamagui';

import { defaultIntents } from './intents';
import { defaultKnobs } from './knobs';
import type { Knobs } from './knobs';
import { usePresetContext } from './preset-context';
import type { PresetContextValue } from './preset-context';
import type { IntentOverride } from './preset.types';
import type { KnobPropsOverride, ResolvedKnobs } from './recipes';
import { applyDensity, compactSpaceMap, resolveKnobs } from './resolve-knobs';
import { clampSurfaceDensity, clampSurfaceSize, SurfaceContext } from './surface-context';
import type { SurfaceIntent } from './surface-context';
import { useTouchSurface } from './use-touch-surface';

export const IntentContext = createContext<string | null>(null);

export const useIntentContext = (): string | null => useContext(IntentContext);

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const serverReducedMotion = () => false;

const readReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia !== undefined && window.matchMedia(reducedMotionQuery).matches;

const unsubscribeNothing = (): void => {
  // Nothing was subscribed, so there is nothing to undo.
};

/** Pre-Safari 14 MediaQueryList exposes only the legacy listener pair. */
interface LegacyMediaQueryList {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

const subscribeReducedMotion = (notify: () => void) => {
  if (typeof window === 'undefined' || window.matchMedia === undefined) {
    return unsubscribeNothing;
  }
  const mq = window.matchMedia(reducedMotionQuery);
  if (mq.addEventListener !== undefined) {
    mq.addEventListener('change', notify);
    return () => {
      mq.removeEventListener('change', notify);
    };
  }
  const legacy: LegacyMediaQueryList = mq;
  if (legacy.addListener !== undefined) {
    legacy.addListener(notify);
    return () => {
      legacy.removeListener?.(notify);
    };
  }
  return unsubscribeNothing;
};

/** Adopt the OS motion preference after matching the server's initial markup. */
const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);

const applySurfaceToKnobs = (
  knobs: Knobs,
  surface: SurfaceIntent,
  opts: { sizeOverride: boolean; densityOverride: boolean },
): Knobs => {
  let next = knobs;
  if (surface.size !== 'unset') {
    if (opts.sizeOverride) {
      const size = clampSurfaceSize(next.size, surface.size);
      if (size !== 'unset' && size !== next.size) {
        next = { ...next, size };
      }
    } else {
      next = { ...next, size: surface.size };
    }
  }
  if (surface.density !== 'unset') {
    if (opts.densityOverride) {
      const density = clampSurfaceDensity(next.density, surface.density);
      if (density !== 'unset' && density !== next.density) {
        next = { ...next, density };
      }
    } else {
      next = { ...next, density: surface.density };
    }
  }
  return next;
};

export interface UseResolvedKnobsOptions {
  intent?: string;
  component?: string;
  override?: KnobPropsOverride;
  /** Override the size from knobs */
  size?: SizeTokens;
  /**
   * Density-compact override (layout gaps only — does not step size).
   * When set, wins over `knobs.density`:
   * `true` forces compact density; `false` forces comfortable.
   * Then re-clamped to the parent Surface ceiling.
   * When omitted, the density knob / Surface controls compact vs comfortable.
   */
  compact?: boolean;
}

const sizeTokenToKnobSize = new Map<string, Knobs['size']>([
  ['$1', 'small'],
  ['$2', 'small'],
  ['$3', 'small'],
  ['$4', 'medium'],
  ['$5', 'large'],
  ['$6', 'large'],
  ['$true', 'medium'],
]);

export const solidButtonIntents = new Set(['error', 'warning', 'success']);

/**
 * Themes that are solid by palette shape: the accent slot's steps 1-10 are all
 * brand surfaces (defaults/accent.ts), so the disabled wash ($color3/$color6)
 * lands one step off the fill and never reads disabled (ΔE 2.5 in
 * dark). A control themed by one paints the wash from its host scope.
 */
export const solidPaletteThemes = new Set(['accent']);

const findIntentOverride = (presetCtx: PresetContextValue | null, intent: string): IntentOverride | undefined =>
  Object.entries(presetCtx?.preset.intents ?? {}).find(([name]) => name === intent)?.[1] ?? defaultIntents[intent];

const stringKnobOverrides = (intentOverrides: IntentOverride): Partial<Knobs> =>
  // SAFETY: IntentOverride's non-component entries are Knobs keys; string-valued entries are knob values, object-valued ones are component overrides.
  Object.fromEntries(
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- value kind (string knob vs component object) is the only discriminator IntentOverride carries
    Object.entries(intentOverrides).filter(([, value]) => typeof value === 'string'),
  ) as Partial<Knobs>;

const applyIntentKnobs = (
  baseKnobs: Knobs,
  presetCtx: PresetContextValue | null,
  intent: string | undefined,
  component: string | undefined,
): Knobs => {
  if (intent === undefined || intent === '') {
    return baseKnobs;
  }
  const intentOverrides = findIntentOverride(presetCtx, intent);
  if (intentOverrides === undefined) {
    return baseKnobs;
  }
  const merged: Knobs = { ...baseKnobs, ...stringKnobOverrides(intentOverrides) };
  if (component === undefined || component === '') {
    return merged;
  }
  const componentOverride = intentOverrides[component];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- component entries are `Partial<Knobs> | string | undefined`; only the object form is a knob override
  if (componentOverride !== undefined && typeof componentOverride === 'object') {
    return { ...merged, ...componentOverride };
  }
  return merged;
};

/**
 * Resolve knobs → { knobProps }.
 *
 * Resolution order:
 *   1. Base knobs from nearest <Preset> context
 *   2. Merge intent-level overrides (if intent provided or from context)
 *   3. Merge intent+component overrides (if both provided)
 *   4. Apply size override if provided
 *   5. Clamp size/density to Surface context (step-down only)
 *   6. Apply density (space only; compact option wins when provided)
 *   7. Re-clamp to Surface ceiling (compact option cannot exceed parent)
 *   8. OS reduced-motion forces animation="none"
 *   9. Call resolveKnobs(mergedKnobs, override, scheme) — override merges last
 */
export const useResolvedKnobs = (options?: UseResolvedKnobsOptions): ResolvedKnobs => {
  const touch = useTouchSurface();
  const presetCtx = usePresetContext();
  const contextIntent = useIntentContext();
  const prefersReducedMotion = usePrefersReducedMotion();
  const themeName: string | undefined = useThemeName();
  const scheme = themeName?.startsWith('dark') ? 'dark' : 'light';
  const surfaceCtx = SurfaceContext.useStyledContext();
  const surfaceSize = surfaceCtx?.size ?? 'unset';
  const surfaceDensity = surfaceCtx?.density ?? 'unset';

  const intent = options?.intent ?? contextIntent ?? undefined;
  const component = options?.component;
  const override = options?.override;
  const sizeOverride = options?.size;
  const compact = options?.compact;

  return useMemo(() => {
    const baseKnobs: Knobs = presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : { ...defaultKnobs };

    let merged = applyIntentKnobs(baseKnobs, presetCtx, intent, component);

    if (sizeOverride !== undefined) {
      const knobSize = sizeTokenToKnobSize.get(String(sizeOverride));
      if (knobSize !== undefined) {
        merged = { ...merged, size: knobSize };
      }
    }

    const surfaceIntent: SurfaceIntent = { size: surfaceSize, density: surfaceDensity };
    merged = applySurfaceToKnobs(merged, surfaceIntent, {
      sizeOverride: Boolean(sizeOverride),
      densityOverride: compact !== undefined,
    });

    const spaceBeforeDensity = merged.space;
    merged = applyDensity(merged, compact);
    merged = applySurfaceToKnobs(merged, surfaceIntent, {
      sizeOverride: true,
      densityOverride: true,
    });
    merged = {
      ...merged,
      space: merged.density === 'compact' ? compactSpaceMap[spaceBeforeDensity] : spaceBeforeDensity,
    };

    if (prefersReducedMotion) {
      merged = { ...merged, animation: 'none' };
    }

    const resolved = resolveKnobs(merged, override, scheme, { touch });

    if (intent !== undefined && intent !== '' && component === 'Button' && solidButtonIntents.has(intent)) {
      const labelColor = merged.fillStyle === 'filled' ? '$color' : '$color11';
      return {
        ...resolved,
        knobProps: {
          ...resolved.knobProps,
          body: { ...resolved.knobProps.body, color: labelColor },
        },
      };
    }

    return resolved;
  }, [
    presetCtx,
    intent,
    component,
    override,
    sizeOverride,
    compact,
    prefersReducedMotion,
    surfaceSize,
    surfaceDensity,
    scheme,
    touch,
  ]);
};
