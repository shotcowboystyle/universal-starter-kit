import type { ThemeName } from '@tamagui/web';
import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import type { useDidFinishSSR } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Intent } from './Intent';
import { defaultKnobs } from './knobs';
import { PresetContext } from './preset-context';
import type { PresetContextValue } from './preset-context';
import type { Preset as PresetType } from './preset.types';
import type { ResolvedKnobs } from './recipes';
import { useResolvedKnobs, useIntentContext } from './use-resolved-knobs';

// Mock Tamagui's <Theme> so we can inspect the chosen theme name
// oxlint-disable-next-line vitest/prefer-import-in-mock -- hand-written partial stand-in for Tamagui; it cannot satisfy the module's real types
vi.mock('tamagui', async (importOriginal) => {
  const original = await importOriginal<{ useDidFinishSSR: typeof useDidFinishSSR }>();
  return {
    useDidFinishSSR: original.useDidFinishSSR,
    // These tests inspect intent names with a fixed light scheme.
    useThemeName: () => 'light',
    Theme: ({ name, children }: { name: string; children: ReactNode }) =>
      createElement('div', { 'data-tamagui-theme': name }, children),
    createStyledContext: (defaults: { size: string; density: string }) => ({
      Provider: ({ children, size, density }: { children?: ReactNode; size?: string; density?: string }) =>
        createElement(
          'div',
          {
            'data-surface-size': size ?? defaults.size,
            'data-surface-density': density ?? defaults.density,
          },
          children,
        ),
      useStyledContext: () => defaults,
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePreset = (intents: PresetType['intents'] = {}): PresetType => ({
  theme: 'light' as ThemeName,
  knobs: defaultKnobs,
  intents,
  tints: [],
});

const wrapWithPreset = (preset: PresetType, children: ReactNode): ReactNode => {
  const ctx: PresetContextValue = { preset };
  return createElement(PresetContext.Provider, { value: ctx }, children);
};

const renderToHtml = (node: ReactNode): string => renderToString(node as ReactElement);

/** Return an array of all `data-tamagui-theme` values in rendered HTML. */
const collectThemes = (html: string): string[] =>
  Array.from(html.matchAll(/data-tamagui-theme="(?<name>[^"]+)"/gu), (m) => m.groups?.name ?? '');

/** A write-once-per-render slot a probe component fills so the test can read it afterwards. */
const createSlot = function createSlot<T>() {
  let stored: T | undefined;
  return {
    write: (next: T) => {
      stored = next;
    },
    read: (): T | undefined => stored,
  };
};

/** Create a probe component that captures resolved knobs from useResolvedKnobs. */
const createRecipesCapture = (options?: Parameters<typeof useResolvedKnobs>[0]) => {
  const captured = createSlot<ResolvedKnobs>();
  const Probe = () => {
    captured.write(useResolvedKnobs(options));
    return null;
  };
  return {
    Probe,
    get result(): ResolvedKnobs {
      const value = captured.read();
      if (value === undefined) {
        throw new Error('Probe was not rendered');
      }
      return value;
    },
  };
};

/** Create a probe that captures the intent context value. */
const createIntentCapture = () => {
  const captured = createSlot<string | null>();
  const Probe = () => {
    captured.write(useIntentContext());
    return createElement('span', null, 'probe');
  };
  return {
    Probe,
    get result(): string | null {
      const value = captured.read();
      if (value === undefined) {
        throw new Error('Probe was not rendered');
      }
      return value;
    },
  };
};

// ---------------------------------------------------------------------------
// Intent context tests
// ---------------------------------------------------------------------------

describe(Intent, () => {
  it('wraps children in <Theme name={name}> by default', () => {
    const html = renderToHtml(
      wrapWithPreset(makePreset(), createElement(Intent, { name: 'error' }, createElement('span', null, 'hello'))),
    );
    const themes = collectThemes(html);
    expect(themes).toContain('error');
    expect(html).toContain('hello');
  });

  it('uses explicit theme prop over intent name for Tamagui <Theme>', () => {
    const html = renderToHtml(
      wrapWithPreset(
        makePreset(),
        createElement(Intent, { name: 'error', theme: 'red' as ThemeName }, createElement('span', null, 'hello')),
      ),
    );
    const themes = collectThemes(html);
    expect(themes).toContain('red');
    expect(themes).not.toContain('error');
  });

  it('provides intent name via IntentContext (useIntentContext)', () => {
    const capture = createIntentCapture();

    renderToHtml(wrapWithPreset(makePreset(), createElement(Intent, { name: 'error' }, createElement(capture.Probe))));
    expect(capture.result).toBe('error');
  });

  it('nesting: innermost <Intent> wins for context', () => {
    const capture = createIntentCapture();

    renderToHtml(
      wrapWithPreset(
        makePreset(),
        createElement(
          Intent,
          { name: 'error' },
          createElement(Intent, { name: 'success' }, createElement(capture.Probe)),
        ),
      ),
    );
    expect(capture.result).toBe('success');
  });

  it('nesting: innermost <Intent> produces both Tamagui themes in DOM order', () => {
    const html = renderToHtml(
      wrapWithPreset(
        makePreset(),
        createElement(
          Intent,
          { name: 'error' },
          createElement(Intent, { name: 'success' }, createElement('span', null, 'inner')),
        ),
      ),
    );
    const themes = collectThemes(html);
    expect(themes).toStrictEqual(['error', 'success']);
  });
});

// ---------------------------------------------------------------------------
// useResolvedKnobs + Intent integration
// ---------------------------------------------------------------------------

describe('useResolvedKnobs with Intent', () => {
  it('resolves default intent overrides from context', () => {
    const capture = createRecipesCapture();

    renderToHtml(wrapWithPreset(makePreset(), createElement(Intent, { name: 'error' }, createElement(capture.Probe))));

    // "error" defaultIntent has textAccent: "high" → passed through
    expect(capture.result.knobProps.textAccent).toBe('high');
  });

  it('resolves intent via explicit option overriding context', () => {
    const capture = createRecipesCapture({ intent: 'warning' });

    renderToHtml(wrapWithPreset(makePreset(), createElement(Intent, { name: 'error' }, createElement(capture.Probe))));

    // "warning" has textAccent: "high" → passed through
    expect(capture.result.knobProps.textAccent).toBe('high');
  });

  it('resolves component-specific intent overrides (Button + error)', () => {
    const capture = createRecipesCapture({ component: 'Button' });

    renderToHtml(wrapWithPreset(makePreset(), createElement(Intent, { name: 'error' }, createElement(capture.Probe))));

    // "error" → Button: { elevation: "small" }, and small paints no control shadow
    expect(capture.result.knobProps.elevation).toBeUndefined();
  });

  it('resolves component-specific intent overrides via explicit option', () => {
    const capture = createRecipesCapture({ intent: 'error', component: 'Button' });

    renderToHtml(wrapWithPreset(makePreset(), createElement(capture.Probe)));

    // "error" → Button: { elevation: "small" }, and small paints no control shadow
    expect(capture.result.knobProps.elevation).toBeUndefined();
  });

  it('preset intent overrides take precedence over defaultIntents', () => {
    const presetWithIntents = makePreset({
      error: {
        textAccent: 'low',
        Button: { elevation: 'large' },
      },
    });

    const capture = createRecipesCapture({ intent: 'error', component: 'Button' });

    renderToHtml(wrapWithPreset(presetWithIntents, createElement(capture.Probe)));

    // Preset says textAccent: "low" → passed through
    expect(capture.result.knobProps.textAccent).toBe('low');

    // Preset says Button.elevation: "large" → resolved to "$4"
    expect(capture.result.knobProps.elevation).toBe('$4');
  });

  it('falls back to defaultIntents when preset has no intent overrides', () => {
    const capture = createRecipesCapture({ intent: 'accent', component: 'Button' });

    renderToHtml(wrapWithPreset(makePreset(), createElement(capture.Probe)));

    // Component override: Button.fillStyle = "filled" overrides the intent-level "outlined"
    expect(capture.result.knobProps.outlined).toBe(false);
  });

  it('accent intent without component uses outlined fill from defaultIntents', () => {
    const capture = createRecipesCapture({ intent: 'accent' });

    renderToHtml(wrapWithPreset(makePreset(), createElement(capture.Probe)));

    // accent defaultIntent: fillStyle: "outlined"
    expect(capture.result.knobProps.outlined).toBe(true);
  });

  it('nesting intents: innermost wins for recipe resolution', () => {
    const capture = createRecipesCapture({ component: 'Button' });

    renderToHtml(
      wrapWithPreset(
        makePreset(),
        createElement(
          Intent,
          { name: 'error' },
          createElement(Intent, { name: 'success' }, createElement(capture.Probe)),
        ),
      ),
    );

    // innermost is "success" → Button: { elevation: "none" } → undefined
    expect(capture.result.knobProps.elevation).toBeUndefined();
  });

  it('no intent context and no option → base knobs only', () => {
    const capture = createRecipesCapture();

    renderToHtml(wrapWithPreset(makePreset(), createElement(capture.Probe)));

    // Default knobs: elevation "small" paints no control shadow
    expect(capture.result.knobProps.elevation).toBeUndefined();
    expect(capture.result.knobProps.textAccent).toBe('high');
  });
});
