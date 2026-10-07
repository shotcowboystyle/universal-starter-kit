/**
 * MPO-191 AC-3, mechanised.
 *
 * The claim is that a Tamagui node inside the WebView resolves knobs through
 * the REAL stack — `<Preset>` / `<Surface>` / `IntentContext` /
 * `useResolvedKnobs` — and lands on the same answer the host would. A
 * screenshot cannot prove that; two trees and a deep-equal can.
 *
 * The comparison is against the ORIGINAL CONTEXT, not against a second
 * envelope. Comparing envelope to envelope would pass for a knob that stops
 * crossing entirely, because both sides would lose it together. This way any
 * knob mpo adds later breaks this spec the day it is added, which is the point.
 *
 * The crossing is a real `JSON.stringify` / `JSON.parse`, so a value that
 * cannot survive the bridge (an `undefined`, a function, a `Map`) fails here
 * rather than on a phone.
 */

import { renderWithProviders } from '@repo/test-utils';
import {
  IntentContext,
  Preset,
  Surface,
  defaultKnobs,
  registerPreset,
  useResolvedKnobs,
} from '@repo/theme';
import type {
  PresetDefinition,
  Knobs,
  ResolvedKnobs,
  SurfaceDensity,
  SurfaceSizeIntent,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { knobEnvelopeSchemaVersion, parseKnobEnvelope, serializeKnobEnvelope, stableStringify } from './envelope';
import type { KnobEnvelope } from './envelope';
import { KnobEnvelopeProvider } from './KnobEnvelopeProvider';
import { useKnobEnvelope } from './useKnobEnvelope';

// ── The named preset, whose `intents` map is what `presetName` exists to carry ──

/**
 * Deliberately unlike `defaultIntents`. `defaultIntents.error` carries
 * `textAccent: "high"` and component overrides for Button/Input only, so a
 * GraphNode under it resolves with its base knobs; this one moves knobs a
 * GraphNode actually reads. If `presetName` failed to cross, the rehydrated
 * tree would silently fall back to `defaultIntents` and paint the wrong node.
 */
const graphFuzzPreset: PresetDefinition = {
  theme: '' as PresetDefinition['theme'],
  knobs: { ...defaultKnobs, borderRadius: 'small', elevation: 'none' },
  intents: {
    error: {
      textAccent: 'low',
      GraphNode: { borderRadius: 'full', elevation: 'large', borderWidth: 'large' },
    },
  },
  tints: [],
};

beforeAll(() => {
  registerPreset('graphFuzz', graphFuzzPreset);
});

// ── Seeded knob sweep ────────────────────────────────────────────────────────

/** mulberry32 — a named, reproducible PRNG, so a failure is re-runnable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seedFrom(label: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

const knobVocabulary = {
  fillStyle: ['filled', 'outlined'],
  borderRadius: ['none', 'small', 'medium', 'large', 'full'],
  cornerSmoothing: ['round', 'smooth'],
  borderWidth: ['none', 'small', 'medium', 'large'],
  elevation: ['none', 'small', 'medium', 'large'],
  space: ['small', 'medium', 'large'],
  size: ['small', 'medium', 'large'],
  density: ['comfortable', 'compact'],
  textAccent: ['low', 'medium', 'high'],
  headingFont: ['sans-serif', 'serif', 'mono', 'slab', 'rounded'],
  bodyFont: ['sans-serif', 'serif', 'mono', 'condensed'],
  fontWeight: ['regular', 'bold'],
  pageTitleScale: ['moderate', 'display'],
  animation: ['none', 'quick', 'bouncy', 'lazy', 'snappy'],
} as const;

const surfaceSizes: readonly (SurfaceSizeIntent | undefined)[] = [undefined, 'small', 'medium', 'large'];
const surfaceDensities: readonly (SurfaceDensity | undefined)[] = [undefined, 'compact', 'comfortable'];
const intents: readonly (string | null)[] = [null, 'accent', 'error', 'warning', 'success'];

interface Combo {
  readonly knobs: Partial<Knobs>;
  readonly surfaceSize: SurfaceSizeIntent | undefined;
  readonly surfaceDensity: SurfaceDensity | undefined;
  readonly intent: string | null;
}

function pick<T>(rand: () => number, values: readonly T[]): T {
  return values[Math.floor(rand() * values.length)];
}

function seededCombos(label: string, count: number): Combo[] {
  const rand = mulberry32(seedFrom(label));
  const combos: Combo[] = [];
  for (let index = 0; index < count; index += 1) {
    const knobs: Record<string, unknown> = {};
    for (const [key, values] of Object.entries(knobVocabulary)) {
      knobs[key] = pick(rand, values as readonly unknown[]);
    }
    combos.push({
      knobs: knobs as Partial<Knobs>,
      surfaceSize: pick(rand, surfaceSizes),
      surfaceDensity: pick(rand, surfaceDensities),
      intent: pick(rand, intents),
    });
  }
  return combos;
}

// ── The crossing ─────────────────────────────────────────────────────────────

interface Capture {
  envelope?: KnobEnvelope;
  resolved?: ResolvedKnobs;
}

function HostProbe({ capture, presetName, intent }: { capture: Capture; presetName?: string; intent?: string }) {
  capture.envelope = useKnobEnvelope({ presetName });
  capture.resolved = useResolvedKnobs({ component: 'GraphNode', intent });
  return null;
}

function DomProbe({ capture, intent }: { capture: Capture; intent?: string }) {
  capture.resolved = useResolvedKnobs({ component: 'GraphNode', intent });
  return null;
}

interface CrossOptions {
  readonly knobs?: Partial<Knobs>;
  readonly presetName?: string;
  /** Passed to `useKnobEnvelope`; omit to prove the fallback to `defaultIntents`. */
  readonly carryPresetName?: boolean;
  readonly surfaceSize?: SurfaceSizeIntent;
  readonly surfaceDensity?: SurfaceDensity;
  readonly contextIntent?: string | null;
  /** Explicit `useResolvedKnobs({ intent })` on both sides; omit to lean on context. */
  readonly resolveIntent?: string;
}

interface Crossing {
  readonly host: ResolvedKnobs;
  readonly rehydrated: ResolvedKnobs;
  readonly envelope: KnobEnvelope;
}

function cross(options: CrossOptions): Crossing {
  const hostCapture: Capture = {};
  const tree: ReactNode = (
    <Preset
      preset={options.presetName}
      overrides={options.knobs}>
      <Surface
        size={options.surfaceSize}
        density={options.surfaceDensity}>
        <IntentContext.Provider value={options.contextIntent ?? null}>
          <HostProbe
            capture={hostCapture}
            presetName={options.carryPresetName === false ? undefined : options.presetName}
            intent={options.resolveIntent}
          />
        </IntentContext.Provider>
      </Surface>
    </Preset>
  );
  const hostRender = renderWithProviders(tree);
  const host = hostCapture.resolved;
  const { envelope } = hostCapture;
  if (!host || !envelope) {
    throw new Error('host tree never rendered the probe');
  }
  hostRender.unmount();

  // The real bridge: text in, text out.
  const crossed = parseKnobEnvelope(serializeKnobEnvelope(envelope));

  const domCapture: Capture = {};
  const domRender = renderWithProviders(
    <KnobEnvelopeProvider envelope={crossed}>
      <DomProbe
        capture={domCapture}
        intent={options.resolveIntent}
      />
    </KnobEnvelopeProvider>,
  );
  const rehydrated = domCapture.resolved;
  if (!rehydrated) {
    throw new Error('rehydrated tree never rendered the probe');
  }
  domRender.unmount();

  return { host, rehydrated, envelope: crossed };
}

// ── Specs ────────────────────────────────────────────────────────────────────

describe('the knob envelope crosses the stack (MPO-191 AC-3)', () => {
  it("resolves identically for the design's own host tree", () => {
    const { host, rehydrated } = cross({
      knobs: { borderRadius: 'large', elevation: 'medium', space: 'large', animation: 'bouncy' },
      surfaceSize: 'small',
      surfaceDensity: 'compact',
      contextIntent: 'error',
      resolveIntent: 'error',
    });
    expect(rehydrated).toEqual(host);
  });

  const combos = seededCombos('MPO-191-envelope', 24);

  it.each(combos.map((combo, index) => [index, combo] as const))(
    'resolves identically for seeded combo %i',
    (_index, combo) => {
      const { host, rehydrated } = cross({
        knobs: combo.knobs,
        surfaceSize: combo.surfaceSize,
        surfaceDensity: combo.surfaceDensity,
        contextIntent: combo.intent,
        resolveIntent: combo.intent ?? undefined,
      });
      expect(rehydrated).toEqual(host);
    },
  );

  it('resolves identically when the intent comes only from context', () => {
    const { host, rehydrated } = cross({
      knobs: { borderRadius: 'full', textAccent: 'low' },
      surfaceSize: 'medium',
      contextIntent: 'warning',
    });
    expect(rehydrated).toEqual(host);
  });

  it("carries a NAMED preset's own intents across, which is what presetName is for", () => {
    const { host, rehydrated, envelope } = cross({
      presetName: 'graphFuzz',
      surfaceSize: 'large',
      contextIntent: 'error',
      resolveIntent: 'error',
    });
    expect(envelope.presetName).toBe('graphFuzz');
    expect(rehydrated).toEqual(host);

    // And the override is live rather than inert: "warning" has no entry in
    // graphFuzz's intents map, so if the GraphNode override were doing nothing
    // these two would be identical and the test above would prove nothing.
    const control = cross({
      presetName: 'graphFuzz',
      surfaceSize: 'large',
      contextIntent: 'warning',
      resolveIntent: 'warning',
    });
    expect(host.knobProps.borderRadius).not.toEqual(control.host.knobProps.borderRadius);
    expect(control.rehydrated).toEqual(control.host);
  });

  it('LOSES that intent override when presetName does not cross', () => {
    const { host, rehydrated } = cross({
      presetName: 'graphFuzz',
      carryPresetName: false,
      surfaceSize: 'large',
      contextIntent: 'error',
      resolveIntent: 'error',
    });
    // Falsification: without the name the rehydrated tree falls back to
    // `defaultIntents`, which has no GraphNode override, so the two diverge.
    expect(rehydrated).not.toEqual(host);
  });
});

describe('the envelope itself', () => {
  it('keeps `unset` surface axes instead of coercing them', () => {
    const capture: Capture = {};
    const render = renderWithProviders(
      <Preset overrides={{ size: 'large' }}>
        <HostProbe capture={capture} />
      </Preset>,
    );
    expect(capture.envelope?.surface).toEqual({ size: 'unset', density: 'unset' });
    render.unmount();
  });

  it('completes optional knobs so JSON cannot drop them', () => {
    const capture: Capture = {};
    const render = renderWithProviders(
      <Preset overrides={{ borderRadius: 'small' }}>
        <HostProbe capture={capture} />
      </Preset>,
    );
    const knobs = capture.envelope?.knobs!;
    expect(knobs.cornerSmoothing).toBeDefined();
    expect(knobs.pageTitleScale).toBeDefined();
    const roundTripped = JSON.parse(JSON.stringify(knobs)) as Knobs;
    expect(Object.keys(roundTripped).sort()).toEqual(Object.keys(knobs).sort());
    render.unmount();
  });

  it('bumps `revision` only when an input changes', () => {
    const capture: Capture = {};
    const render = renderWithProviders(
      <Preset overrides={{ borderRadius: 'small' }}>
        <HostProbe capture={capture} />
      </Preset>,
    );
    const first = capture.envelope!;
    render.rerender(
      <Preset overrides={{ borderRadius: 'small' }}>
        <HostProbe capture={capture} />
      </Preset>,
    );
    expect(capture.envelope?.revision).toBe(first.revision);
    expect(capture.envelope).toBe(first);
    render.rerender(
      <Preset overrides={{ borderRadius: 'large' }}>
        <HostProbe capture={capture} />
      </Preset>,
    );
    expect(capture.envelope?.revision).toBe(first.revision + 1);
    render.unmount();
  });

  it('refuses an envelope from a different schema version', () => {
    expect(() => parseKnobEnvelope(JSON.stringify({ schemaVersion: knobEnvelopeSchemaVersion + 1 }))).toThrow(
      /schemaVersion/,
    );
  });

  it('stringifies stably regardless of key insertion order', () => {
    expect(stableStringify({ a: 1, b: { d: 2, c: 3 } })).toBe(stableStringify({ b: { c: 3, d: 2 }, a: 1 }));
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});
