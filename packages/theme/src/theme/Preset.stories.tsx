import { SizableText, XStack, YStack } from 'tamagui';

import { Preset } from './Preset';
import { useResolvedKnobs } from './useResolvedKnobs';

export default {
  title: 'Theme/Preset',
  component: Preset,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Preset layers knob overrides on the nearest preset (cascade, the default) or replaces it (cascade={false}). The probe is a Tamagui stack spreading the resolved surface and radius, so what is measured is the stack.',
      },
    },
  },
};

function Probe({ label }: { label: string }) {
  const { knobProps } = useResolvedKnobs();
  const attrs = {
    'data-border-radius': String(knobProps.borderRadius.borderRadius),
    'data-border-width': String(knobProps.surface.borderWidth),
    'data-fill-style': knobProps.outlined ? 'outlined' : 'filled',
    'data-space': String(knobProps.space),
  } as Record<string, unknown>;
  return (
    <YStack
      {...knobProps.surface}
      {...knobProps.borderRadius}
      backgroundColor={knobProps.outlined ? 'transparent' : '$background'}
      borderColor="$borderColor"
      elevation={knobProps.elevation}
      padding="$3"
      minWidth={160}
      testID={`preset-probe-${label}`}
      {...attrs}>
      <SizableText>{label}</SizableText>
      <SizableText color="$color11" fontSize="$2">
        radius {String(knobProps.borderRadius.borderRadius)}, border {String(knobProps.surface.borderWidth)},{' '}
        {knobProps.outlined ? 'outlined' : 'filled'}
      </SizableText>
    </YStack>
  );
}

/** Overrides on top of whatever the page's preset resolved. */
export const main = {
  name: 'Main',
  render: () => (
    <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
      <Probe label="inherited" />
      <Preset overrides={{ borderRadius: 'full', borderWidth: 'large' }}>
        <Probe label="full-radius" />
      </Preset>
      <Preset overrides={{ fillStyle: 'outlined' }}>
        <Probe label="outlined" />
      </Preset>
    </XStack>
  ),
};

/** Cascade carries the parent's overrides forward; cascade={false} starts from defaults. */
export const cascade = {
  name: 'Cascade',
  render: () => (
    <Preset overrides={{ borderRadius: 'full' }}>
      <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
        <Probe label="parent-full" />
        <Preset overrides={{ borderWidth: 'large' }}>
          <Probe label="child-cascade" />
        </Preset>
        <Preset cascade={false}>
          <Probe label="child-reset" />
        </Preset>
      </XStack>
    </Preset>
  ),
};
