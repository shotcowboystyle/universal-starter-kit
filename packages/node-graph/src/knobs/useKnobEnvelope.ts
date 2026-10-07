/**
 * Host side of the knob envelope: read the real knob stack, hand back the
 * inputs that reproduce it. Design: docs/design/node-graph-editor.md 6.1.
 */

import {
  SurfaceContext,
  defaultKnobs,
  useIntentContext,
  usePresetContext,
  useResolvedKnobs,
} from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';
import { useThemeName } from 'tamagui';

import type { GraphCssVarsOptions } from '../theme/graphVars';
import { useGraphCssVars } from '../theme/GraphVarsStyle';

import { knobEnvelopeIdentity, knobEnvelopeSchemaVersion } from './envelope';
import type { GraphFontRef, KnobEnvelope, KnobEnvelopeBody } from './envelope';

export interface UseKnobEnvelopeOptions {
  /** `props.knobs` — merged last, on top of the whole Preset chain. */
  readonly knobs?: Partial<Knobs>;
  /**
   * The name the host mounted `<Preset preset=…>` with. Not readable from
   * context (see `KnobEnvelope.presetName`), so a host under a named preset
   * has to say so or the DOM side loses that preset's `intents` map.
   */
  readonly presetName?: string;
  /** Overrides the ambient `IntentContext` when the graph itself carries an intent. */
  readonly intent?: string | null;
  readonly fonts?: readonly GraphFontRef[];
  /**
   * Pointer class the graph is painted for, threaded into the var layer so the
   * handle HIT region gets the 44 px floor on touch.
   */
  readonly pointer?: GraphCssVarsOptions['pointer'];
  /**
   * The `--xy-*` / `--mpo-graph-*` layer. Built from `graphCssVars` against the
   * live theme by default; pass your own only to override the whole layer.
   */
  readonly vars?: Readonly<Record<string, string>>;
}

/**
 * `prefers-reduced-motion: reduce`, read the way the theme package reads it.
 *
 * A copy rather than an import: `usePrefersReducedMotion` is module-private in
 * `useResolvedKnobs.ts:22` and is not exported from `@repo/theme`.
 * The value has to be resolved HOST-side because a WKWebView's `matchMedia`
 * does not see the iOS setting.
 */
function useHostPrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => {
      setReduced(query.matches);
    };
    handler();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return () => {
        query.removeEventListener('change', handler);
      };
    }
    if (typeof query.addListener === 'function') {
      query.addListener(handler);
      return () => {
        query.removeListener?.(handler);
      };
    }
  }, []);
  return reduced;
}

/** Drop keys whose value is `undefined` so a spread cannot erase a default. */
function definedOnly<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      out[key] = item;
    }
  }
  return out as Partial<T>;
}

const emptyFonts: readonly GraphFontRef[] = [];

/**
 * Build the envelope from the live knob stack.
 *
 * The knob merge is deliberately the SAME expression `useResolvedKnobs` uses
 * for its base (`{...presetCtx.preset.knobs, ...presetCtx.overrides}`,
 * useResolvedKnobs.ts:131-133) — anything cleverer is a second resolver to keep
 * in step. It is then completed against `defaultKnobs`, because `JSON.stringify`
 * DROPS a key whose value is `undefined`: without the completion an optional
 * knob (`cornerSmoothing`, `pageTitleScale`) would arrive absent on the far
 * side and the rehydrating `<Preset>`'s own base would show through the gap.
 */
export function useKnobEnvelope(options?: UseKnobEnvelopeOptions): KnobEnvelope {
  const presetCtx = usePresetContext();
  const contextIntent = useIntentContext();
  const surfaceCtx = SurfaceContext.useStyledContext();
  const themeName = (useThemeName() as string | undefined) ?? '';
  const prefersReducedMotion = useHostPrefersReducedMotion();
  // The var layer is canvas CHROME, so it resolves with the ambient intent and
  // no component: a node's own paint comes from `useGraphNodeKnobs`, not from
  // a `--xy-*` variable (design 6.2 — the `--xy-node-*` family is allowlisted
  // out precisely because it never binds to a Tamagui node).
  const chromeKnobs = useResolvedKnobs();
  const builtVars = useGraphCssVars(chromeKnobs, { pointer: options?.pointer });

  const merged: Knobs = {
    ...defaultKnobs,
    ...definedOnly(presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : defaultKnobs),
    ...definedOnly(options?.knobs ?? {}),
  };

  const body: KnobEnvelopeBody = {
    schemaVersion: knobEnvelopeSchemaVersion,
    knobs: merged,
    presetName: options?.presetName,
    intent: options?.intent === undefined ? contextIntent : options.intent,
    surface: { size: surfaceCtx?.size ?? 'unset', density: surfaceCtx?.density ?? 'unset' },
    scheme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersReducedMotion,
    vars: options?.vars ?? builtVars,
    fonts: options?.fonts ?? emptyFonts,
    pixelRatio:
      typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
  };

  const identity = knobEnvelopeIdentity(body);
  const state = useRef<{ identity: string; envelope: KnobEnvelope } | null>(null);
  if (!state.current || state.current.identity !== identity) {
    // Derived from this render's own inputs, so the ref write is pure in the
    // sense React cares about: a re-render with the same inputs produces the
    // same envelope, identity included.
    state.current = {
      identity,
      envelope: { ...body, revision: (state.current?.envelope.revision ?? 0) + 1 },
    };
  }
  return state.current.envelope;
}
