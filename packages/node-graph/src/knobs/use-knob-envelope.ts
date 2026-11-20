/**
 * Host side of the knob envelope: read the real knob stack, hand back the
 * inputs that reproduce it. Design: docs/design/node-graph-editor.md 6.1.
 */

import { SurfaceContext, defaultKnobs, useIntentContext, usePresetContext, useResolvedKnobs } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';
import { useThemeName } from 'tamagui';

import type { GraphCssVarsOptions } from '../theme/graph-vars';
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

/** `window` and `matchMedia` are both absent under React Native and some test hosts. */
const hasMatchMedia = (): boolean =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `window` may be undeclared (React Native); a bare reference would throw
  typeof window !== 'undefined' && 'matchMedia' in window && typeof window.matchMedia === 'function';

/**
 * `prefers-reduced-motion: reduce`, read the way the theme package reads it.
 *
 * A copy rather than an import: `usePrefersReducedMotion` is module-private in
 * `useResolvedKnobs.ts:22` and is not exported from `@repo/theme`.
 * The value has to be resolved HOST-side because a WKWebView's `matchMedia`
 * does not see the iOS setting.
 */
const useHostPrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => {
    if (!hasMatchMedia()) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (!hasMatchMedia()) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- typescript/consistent-return wants every path to return explicitly
      return undefined;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => {
      setReduced(query.matches);
    };
    handler();
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- feature detection: Safari < 14 MediaQueryList has no addEventListener
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return () => {
        query.removeEventListener('change', handler);
      };
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof, typescript/no-deprecated -- legacy fallback for Safari < 14, the only API it has
    if (typeof query.addListener === 'function') {
      // oxlint-disable-next-line typescript/no-deprecated -- legacy fallback for Safari < 14
      query.addListener(handler);
      return () => {
        // oxlint-disable-next-line typescript/no-deprecated -- legacy fallback for Safari < 14
        query.removeListener?.(handler);
      };
    }
    // oxlint-disable-next-line unicorn/no-useless-undefined -- typescript/consistent-return wants every path to return explicitly
    return undefined;
  }, []);
  return reduced;
};

/** Drop keys whose value is `undefined` so a spread cannot erase a default. */
const definedOnly = <T extends object>(value: T): Partial<T> => {
  const out = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  // SAFETY: `out` holds a subset of `value`'s own keys with their original values, which is exactly Partial<T>.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot carry T's key types
  return out as Partial<T>;
};

const emptyFonts: readonly GraphFontRef[] = [];

const hostPixelRatio = (): number =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `window` may be undeclared (React Native); devicePixelRatio may be absent in test hosts
  typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;

const mergeHostKnobs = (
  presetCtx: ReturnType<typeof usePresetContext>,
  propKnobs: Partial<Knobs> | undefined,
): Knobs => ({
  ...defaultKnobs,
  ...definedOnly(presetCtx ? { ...presetCtx.preset.knobs, ...presetCtx.overrides } : defaultKnobs),
  ...definedOnly(propKnobs ?? {}),
});

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
export const useKnobEnvelope = (options?: UseKnobEnvelopeOptions): KnobEnvelope => {
  const presetCtx = usePresetContext();
  const contextIntent = useIntentContext();
  const surfaceCtx = SurfaceContext.useStyledContext();
  // SAFETY: Tamagui types the name as always set, but it is undefined outside a provider; widening only adds a case we handle.
  const themeName = (useThemeName() as string | undefined) ?? '';
  const prefersReducedMotion = useHostPrefersReducedMotion();
  // The var layer is canvas CHROME, so it resolves with the ambient intent and
  // no component: a node's own paint comes from `useGraphNodeKnobs`, not from
  // a `--xy-*` variable (design 6.2 — the `--xy-node-*` family is allowlisted
  // out precisely because it never binds to a Tamagui node).
  const chromeKnobs = useResolvedKnobs();
  const builtVars = useGraphCssVars(chromeKnobs, { pointer: options?.pointer });

  const merged = mergeHostKnobs(presetCtx, options?.knobs);

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
    pixelRatio: hostPixelRatio(),
  };

  const identity = knobEnvelopeIdentity(body);
  const state = useRef<{ identity: string; envelope: KnobEnvelope } | null>(null);
  /* oxlint-disable react/refs -- render-time memo keyed on `identity`; see the comment below for why the write is pure */
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
  /* oxlint-enable react/refs */
};
