import { SizableText, XStack, YStack } from 'tamagui';

import { Intent, type IntentProps } from './Intent';
import { useIntentContext, useResolvedKnobs } from './useResolvedKnobs';

export default {
  title: 'Theme/Intent',
  component: Intent,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Intent activates the named Tamagui sub-theme (layer 1) and publishes the intent name through IntentContext so useResolvedKnobs merges the preset's intent overrides (layer 2). The probe is a Tamagui stack painting $background / $color and spreading the resolved surface.",
      },
    },
  },
};

const intents: IntentProps['name'][] = ['accent', 'error', 'warning', 'success'];

function Probe({ label }: { label: string }) {
  const intent = useIntentContext();
  const { knobProps } = useResolvedKnobs();
  const attrs = {
    'data-intent': intent ?? 'none',
    'data-outlined': String(Boolean(knobProps.outlined)),
    'data-fill-style': knobProps.outlined ? 'outlined' : 'filled',
  } as Record<string, unknown>;
  return (
    <YStack
      {...knobProps.surface}
      {...knobProps.borderRadius}
      backgroundColor={knobProps.outlined ? 'transparent' : '$background'}
      borderColor="$borderColor"
      padding="$3"
      minWidth={140}
      testID={`intent-probe-${label}`}
      {...attrs}>
      <SizableText color="$color" testID={`intent-text-${label}`}>
        {label}
      </SizableText>
      <SizableText color="$color11" fontSize="$2">
        context: {intent ?? 'none'}
      </SizableText>
    </YStack>
  );
}

/** The four intents beside an un-wrapped baseline. */
export const main = {
  name: 'Main',
  render: () => (
    <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
      <Probe label="none" />
      {intents.map((name) => (
        <Intent key={name} name={name}>
          <Probe label={name} />
        </Intent>
      ))}
    </XStack>
  ),
};

/** Nesting replaces, never merges: the innermost intent wins. */
export const nested = {
  name: 'Nested',
  render: () => (
    <Intent name="error">
      <XStack gap="$4" flexWrap="wrap" alignItems="flex-start">
        <Probe label="outer-error" />
        <Intent name="success">
          <Probe label="inner-success" />
        </Intent>
      </XStack>
    </Intent>
  ),
};

/** An explicit `theme` keeps the intent context but paints another Tamagui theme. */
export const explicitTheme = {
  name: 'Explicit theme',
  render: () => (
    <Intent name="accent" theme="blue">
      <Probe label="accent-as-blue" />
    </Intent>
  ),
};
