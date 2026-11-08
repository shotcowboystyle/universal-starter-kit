/**
 * DOM side of the knob envelope: rebuild the real stack from the inputs.
 *
 * It uses the theme package's OWN components — `<Preset>`, `<Surface>`,
 * `IntentContext.Provider` — and never raw `PresetContext.Provider`, so a later
 * change to Preset's merge order or Surface's LC-68 clamp cannot desync the two
 * sides. Design: docs/design/node-graph-editor.md 6.1.
 */

import { IntentContext, Preset, Surface } from '@repo/theme';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { TamaguiProvider, Theme } from 'tamagui';
import type { TamaguiInternalConfig } from 'tamagui';

import { knobsForEnvelope } from './envelope';
import type { KnobEnvelope } from './envelope';

export interface KnobEnvelopeProviderProps {
  readonly envelope: KnobEnvelope;
  /**
   * Only the DOM/WebView host passes a config: it is a fresh React root with no
   * provider above it. On web the graph renders inside the app's existing
   * `TamaguiProvider`, and mounting a second one there would give the subtree a
   * different token table from the page around it.
   */
  readonly config?: TamaguiInternalConfig;
  readonly children?: ReactNode;
}

/**
 * The theme name this side can actually resolve.
 *
 * `envelope.themeName` is the HOST's, and across the bridge the two realms are
 * different Tamagui builds with different theme tables: the app's config knows
 * `light_blue`, the DOM bundle's knows whatever `@repo/theme`
 * created. Tamagui does not degrade on a name it cannot find — it THROWS
 * `Missing theme.` — so an unportable name took the whole canvas down.
 *
 * Measured on the iPhone 16e simulator at task 2.7: `render: Missing theme.`,
 * caught by the entry's error boundary. Design 6.1 assumed the name crossed;
 * it does not, and the envelope already carries `scheme` for exactly the part
 * that must survive.
 *
 * On WEB there is no `config`, because the graph renders inside the app's own
 * provider and that provider owns the table — so the name is passed through
 * untouched and nothing changes for the platform that was already working.
 *
 * @returns the name to mount, or undefined to inherit.
 */
export const resolveEnvelopeThemeName = (
  envelope: Pick<KnobEnvelope, 'scheme' | 'themeName'>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- only the theme table's KEYS are inspected; its value type is Tamagui's and irrelevant here
  themes?: Readonly<Record<string, unknown>>,
): string | undefined => {
  const wanted = envelope.themeName;
  if (!themes) {
    return wanted || undefined;
  }
  if (wanted && Object.hasOwn(themes, wanted)) {
    return wanted;
  }
  if (Object.hasOwn(themes, envelope.scheme)) {
    return envelope.scheme;
  }
  return undefined;
};

export const KnobEnvelopeProvider = ({ envelope, config, children }: KnobEnvelopeProviderProps) => {
  const knobs = useMemo(() => knobsForEnvelope(envelope), [envelope]);
  const themeName = useMemo(() => resolveEnvelopeThemeName(envelope, config?.themes), [config, envelope]);

  // `cascade={false}` starts from `defaultKnobs` and merges `overrides`
  // (Preset.tsx:57-76), which is exactly "replace the whole knob set with the
  // host's". A named preset still resolves through `getPreset`, which is what
  // carries its `intents` map across.
  let tree: ReactNode = (
    <Preset
      preset={envelope.presetName}
      cascade={false}
      overrides={knobs}>
      <Surface
        size={envelope.surface.size === 'unset' ? undefined : envelope.surface.size}
        density={envelope.surface.density === 'unset' ? undefined : envelope.surface.density}>
        <IntentContext.Provider value={envelope.intent}>{children}</IntentContext.Provider>
      </Surface>
    </Preset>
  );

  // An empty name is not a theme: `<Theme name="">` would ask Tamagui to
  // resolve a theme that does not exist and silently inherit the parent.
  if (themeName !== undefined && themeName !== '') {
    tree = <Theme name={themeName}>{tree}</Theme>;
  }

  if (config) {
    tree = (
      <TamaguiProvider
        config={config}
        defaultTheme={themeName}>
        {tree}
      </TamaguiProvider>
    );
  }

  return tree;
};
