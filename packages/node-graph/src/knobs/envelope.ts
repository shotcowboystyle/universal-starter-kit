/**
 * The knob ENVELOPE: the inputs to the knob stack, serialized.
 *
 * MPO-191 AC-3 asks for the real `useResolvedKnobs` with its Preset / Surface /
 * Intent context stack, not the pure `resolveKnobs` function. React context does
 * not cross a WebView, so what crosses is the INPUTS to that stack, never the
 * resolved outputs — the DOM side rebuilds the stack out of the theme package's
 * own components and resolves for itself. One code path: the web host is the
 * degenerate case where the envelope never leaves the process.
 *
 * Design: docs/design/node-graph-editor.md section 6.1.
 */

import type { Knobs, SurfaceDensity, SurfaceSize } from '@repo/theme';

/**
 * `unset` is part of the surface vocabulary, and dropping it changes what
 * resolves.
 *
 * Design 6.1 types the envelope's surface as `{ size: SurfaceSize; density:
 * SurfaceDensity }`, but `SurfaceContext`'s default is `{ size: "unset",
 * density: "unset" }` (Surface.tsx:23-26) and `applySurfaceToKnobs`
 * (useResolvedKnobs.ts:44-70) SKIPS an `unset` axis entirely. Coercing a host
 * that sits under no `<Surface>` to "medium" would then step `knobs.size` down
 * from `large`, and the rehydrated tree would resolve differently from the host
 * it copied. So the envelope carries the third value.
 */
export type GraphSurfaceSize = SurfaceSize | 'unset';
export type GraphSurfaceDensity = SurfaceDensity | 'unset';

/** A face the DOM side has to register itself, because WKWebView cannot see an expo-font registration. */
export interface GraphFontRef {
  readonly family: string;
  /** Asset URL or `data:` URI the WebView can fetch. */
  readonly src: string;
  readonly weight?: number;
  readonly style?: 'normal' | 'italic';
}

/** Bumped when the envelope's shape changes in a way the DOM side must refuse. */
export const knobEnvelopeSchemaVersion = 1;

export interface KnobEnvelope {
  readonly schemaVersion: typeof knobEnvelopeSchemaVersion;
  /** Fully merged host knobs: preset.knobs + every Preset override in the chain + props.knobs. */
  readonly knobs: Knobs;
  /**
   * REQUIRED when the host is under a NAMED preset. Without it the DOM side
   * loses that preset's `intents` map: `useResolvedKnobs.ts:139` reads
   * `presetCtx?.preset.intents[intent] ?? defaultIntents[intent]`, so a
   * rehydrated tree with no name falls back to the defaults and a
   * preset-specific intent override vanishes inside the WebView.
   *
   * It is a PROP, not a context read, because `PresetContextValue`
   * (PresetContext.ts:7-10) carries `{ preset, overrides }` and no name — the
   * name genuinely cannot be recovered from the context. The host passes the
   * name it mounted `<Preset preset=…>` with, or `useTheme()`'s active preset.
   */
  readonly presetName?: string;
  readonly intent: string | null;
  readonly surface: { readonly size: GraphSurfaceSize; readonly density: GraphSurfaceDensity };
  readonly scheme: 'light' | 'dark';
  readonly themeName: string;
  /**
   * Resolved HOST-side. `usePrefersReducedMotion` (useResolvedKnobs.ts:22-41)
   * reads `window.matchMedia`, which inside a WKWebView does not see the iOS
   * setting.
   */
  readonly prefersReducedMotion: boolean;
  /** The `--xy-*` / `--mpo-graph-*` layer, built host-side by `graphCssVars`. */
  readonly vars: Readonly<Record<string, string>>;
  readonly fonts: readonly GraphFontRef[];
  readonly pixelRatio: number;
  /** Bumped on any change above, so the DOM side memoises cheaply. */
  readonly revision: number;
}

/** Everything except `revision` — two envelopes with the same identity are the same envelope. */
export type KnobEnvelopeBody = Omit<KnobEnvelope, 'revision'>;

/**
 * Deterministic JSON. `JSON.stringify` preserves INSERTION order, and the host
 * knobs are built by spreading, so `{...defaults, ...overrides}` and
 * `{...overrides, ...defaults}` stringify differently while being the same
 * object. A revision that bumps on key order alone would re-emit the whole var
 * sheet on every unrelated render.
 */
const byKey = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- generic serializer: any JSON-able value is valid input by design
export const stableStringify = (value: unknown): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- structural dispatch over arbitrary JSON values, not contract narrowing
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .toSorted(byKey)
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
};

/** Stable identity of an envelope's inputs, ignoring `revision`. */
export const knobEnvelopeIdentity = (body: KnobEnvelopeBody): string => stableStringify(body);

export const serializeKnobEnvelope = (envelope: KnobEnvelope): string => JSON.stringify(envelope);

/**
 * Parse an envelope that crossed the bridge.
 *
 * A version mismatch throws rather than rendering: a DOM bundle older than its
 * host would otherwise resolve against a knob set it does not understand and
 * paint something plausible but wrong, which is the failure that takes longest
 * to find.
 */
export const parseKnobEnvelope = (text: string): KnobEnvelope => {
  // SAFETY: the schemaVersion guard below is the parse boundary; a body with the right version is the shape this module serialized.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; the version check is the contract gate
  const parsed = JSON.parse(text) as KnobEnvelope;
  if (parsed?.schemaVersion !== knobEnvelopeSchemaVersion) {
    throw new Error(
      `knob envelope schemaVersion ${String(parsed?.schemaVersion)} is not ${String(knobEnvelopeSchemaVersion)} — ` +
        'the DOM bundle and its native host are out of step; rebuild the app rather than rendering against a knob set it cannot read.',
    );
  }
  return parsed;
};

/** `animation: "none"` forced in, idempotent against the resolver's own reduced-motion branch. */
export const knobsForEnvelope = (envelope: KnobEnvelope): Knobs => {
  if (!envelope.prefersReducedMotion) {
    return envelope.knobs;
  }
  return { ...envelope.knobs, animation: 'none' };
};
