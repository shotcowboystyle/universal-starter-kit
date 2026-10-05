import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { type SizeTokens, useThemeName } from 'tamagui';

import { defaultIntents } from './intents';
import { defaultKnobs, type Knobs } from './knobs';
import type { IntentOverride } from './preset.types';
import { usePresetContext } from './PresetContext';
import type { KnobPropsOverride, ResolvedKnobs } from './recipes';
import { applyDensity, compactSpaceMap, resolveKnobs } from './resolveKnobs';
import { clampSurfaceDensity, clampSurfaceSize, SurfaceContext, type SurfaceIntent } from './Surface';
import { useTouchSurface } from './useTouchSurface';

export const IntentContext = createContext<string | null>(null);

export function useIntentContext(): string | null {
  return useContext(IntentContext);
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const serverReducedMotion = () => false;

function readReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(reducedMotionQuery).matches;
}

function subscribeReducedMotion(notify: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  const mq = window.matchMedia(reducedMotionQuery);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', notify);
    return () => {
      mq.removeEventListener('change', notify);
    };
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(notify);
    return () => {
      mq.removeListener?.(notify);
    };
  }
  return () => {};
}

/** Adopt the OS motion preference after matching the server's initial markup. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
}

function applySurfaceToKnobs(
  knobs: Knobs,
  surface: SurfaceIntent,
  opts: { sizeOverride: boolean; densityOverride: boolean },
): Knobs {
  let next = knobs;
  if (surface.size !== 'unset') {
    if (!opts.sizeOverride) {
      next = { ...next, size: surface.size };
    } else {
      const size = clampSurfaceSize(next.size, surface.size);
      if (size !== 'unset' && size !== next.size) {
        next = { ...next, size };
      }
    }
  }
  if (surface.density !== 'unset') {
    if (!opts.densityOverride) {
      next = { ...next, density: surface.density };
    } else {
      const density = clampSurfaceDensity(next.density, surface.density);
      if (density !== 'unset' && density !== next.density) {
        next = { ...next, density };
      }
    }
  }
  return next;
}

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

const sizeTokenToKnobSize: Record<string, Knobs['size']> = {
  $1: 'small',
  $2: 'small',
  $3: 'small',
  $4: 'medium',
  $5: 'large',
  $6: 'large',
  $true: 'medium',
};

export const solidButtonIntents = new Set(['error', 'warning', 'success']);

/**
 * Themes that are solid by palette shape: the accent slot's steps 1-10 are all
 * brand surfaces (defaults/accent.ts), so the disabled wash ($color3/$color6)
 * lands one step off the fill and never reads disabled (ΔE 2.5 in
 * dark). A control themed by one paints the wash from its host scope.
 */
export const solidPaletteThemes = new Set(['accent']);

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
export function useResolvedKnobs(options?: UseResolvedKnobsOptions): ResolvedKnobs {
  const touch = useTouchSurface();
  const presetCtx = usePresetContext();
  const contextIntent = useIntentContext();
  const prefersReducedMotion = usePrefersReducedMotion();
  const themeName = useThemeName() as string | undefined;
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

    let merged: Knobs = baseKnobs;
    if (intent) {
      const intentOverrides: IntentOverride | undefined =
        presetCtx?.preset.intents[intent as keyof typeof presetCtx.preset.intents] ?? defaultIntents[intent];

      if (intentOverrides) {
        const knobOverrides: Partial<Knobs> = {};
        for (const [key, value] of Object.entries(intentOverrides)) {
          if (typeof value === 'string') {
            (knobOverrides as Record<string, unknown>)[key] = value;
          }
        }
        merged = { ...merged, ...knobOverrides };

        if (component) {
          const componentOverride = intentOverrides[component];
          if (componentOverride && typeof componentOverride === 'object') {
            merged = { ...merged, ...componentOverride };
          }
        }
      }
    }

    if (sizeOverride) {
      const sizeStr = String(sizeOverride);
      const knobSize = sizeTokenToKnobSize[sizeStr];
      if (knobSize) {
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
    if (merged.density === 'compact') {
      merged = { ...merged, space: compactSpaceMap[spaceBeforeDensity] };
    } else {
      merged = { ...merged, space: spaceBeforeDensity };
    }

    if (prefersReducedMotion) {
      merged = { ...merged, animation: 'none' };
    }

    const resolved = resolveKnobs(merged, override, scheme, { touch });

    if (intent && component === 'Button' && solidButtonIntents.has(intent)) {
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
}
