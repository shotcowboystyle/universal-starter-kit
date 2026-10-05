import { type ReactNode, useMemo } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import { PresetContext, usePresetContext } from './PresetContext';
import { defaultPreset } from './presets';
import { Tint, useTintDepth } from './Tint';

export default {
  title: 'Theme/Tint',
  component: Tint,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Tint selects tints[(depth - 1) % tints.length] from the preset and wraps children in that Tamagui sub-theme. The swatch is a Tamagui stack painting $color5 / $color11, so the hue you see is the sub-theme, not the wrapper.',
      },
    },
  },
};

/** Keeps the surrounding knobs, pins the tint family to defaultPreset's four names. */
function WithDefaultTints({ children }: { children: ReactNode }) {
  const parent = usePresetContext();
  const value = useMemo(
    () => ({
      preset: { ...(parent?.preset ?? defaultPreset), tints: defaultPreset.tints },
      overrides: parent?.overrides,
    }),
    [parent],
  );
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

function Swatch({ label }: { label?: string }) {
  const depth = useTintDepth();
  return (
    <YStack
      backgroundColor="$color5"
      borderColor="$color8"
      borderWidth={1}
      borderRadius="$3"
      padding="$3"
      gap="$2"
      testID={`tint-swatch-${label ?? depth}`}>
      <SizableText color="$color11">
        {label ?? 'depth'} {depth}
      </SizableText>
    </YStack>
  );
}

/** Five nested Tints: orange, blue, purple, pink, then orange again (modulo). */
export const main = {
  name: 'Main',
  render: () => (
    <WithDefaultTints>
      <Tint>
        <Swatch />
        <Tint>
          <Swatch />
          <Tint>
            <Swatch />
            <Tint>
              <Swatch />
              <Tint>
                <Swatch />
              </Tint>
            </Tint>
          </Tint>
        </Tint>
      </Tint>
    </WithDefaultTints>
  ),
};

/** `alt` offsets the depth; `disable` keeps the depth but drops the Theme wrapper. */
export const altAndDisable = {
  name: 'Alt and disable',
  render: () => (
    <WithDefaultTints>
      <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
        <Tint>
          <Swatch label="plain" />
        </Tint>
        <Tint alt={1}>
          <Swatch label="alt-1" />
        </Tint>
        <Tint alt={2}>
          <Swatch label="alt-2" />
        </Tint>
        <Tint disable>
          <Swatch label="disabled" />
        </Tint>
      </XStack>
    </WithDefaultTints>
  ),
};
