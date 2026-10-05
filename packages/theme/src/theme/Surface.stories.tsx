import { SizableText, XStack, YStack } from 'tamagui';

import { Surface } from './Surface';
import { useResolvedKnobs } from './useResolvedKnobs';

export default {
  title: 'Theme/Surface',
  component: Surface,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Surface paints nothing. It declares size/density intent for a subtree and nested Surfaces clamp step-down only (LC-68). The probe below is a Tamagui stack that spreads what useResolvedKnobs resolved inside the wrapper, so the measured part is the stack, never the wrapper.',
      },
    },
  },
};

/** Spreads the resolved recipe on a stack so the wrapper's effect is measurable. */
function Probe({ label }: { label: string }) {
  const { knobProps } = useResolvedKnobs();
  const attrs = {
    'data-size': String(knobProps.size),
    'data-space': String(knobProps.space),
    'data-size-token': String(knobProps.sizeToken),
    'data-gap': String(knobProps.gap.gap),
  } as Record<string, unknown>;
  return (
    <YStack
      {...knobProps.surface}
      {...knobProps.borderRadius}
      {...knobProps.gap}
      padding={knobProps.gap.gap}
      testID={`surface-probe-${label}`}
      {...attrs}>
      <SizableText fontSize={knobProps.sizeToken as never} testID={`surface-text-${label}`}>
        {label}: token {String(knobProps.sizeToken)}, gap {String(knobProps.gap.gap)}
      </SizableText>
    </YStack>
  );
}

export const main = {
  name: 'Main',
  render: () => (
    <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
      <Probe label="outside" />
      <Surface size="small">
        <Probe label="small" />
      </Surface>
      <Surface size="large">
        <Probe label="large" />
      </Surface>
    </XStack>
  ),
};

/** A large request inside a small Surface resolves small; small inside large stays small. */
export const nestedClamp = {
  name: 'Nested clamp',
  render: () => (
    <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
      <Surface size="small">
        <Surface size="large">
          <Probe label="large-in-small" />
        </Surface>
      </Surface>
      <Surface size="large">
        <Surface size="small">
          <Probe label="small-in-large" />
        </Surface>
      </Surface>
    </XStack>
  ),
};

/** Density steps the gap, not the control height. */
export const density = {
  name: 'Density',
  render: () => (
    <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
      <Surface density="comfortable">
        <Probe label="comfortable" />
      </Surface>
      <Surface density="compact">
        <Probe label="compact" />
      </Surface>
    </XStack>
  ),
};
