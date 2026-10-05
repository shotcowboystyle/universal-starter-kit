import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, Progress as TamaguiProgress, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Progress } from './index';

const meta: Meta<typeof Progress> = {
  title: 'Forms/Progress',
  component: Progress,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    readOnly: { control: 'boolean', description: 'Read-only semantics (display-only)' },
    skeleton: { control: 'boolean', description: 'Render a skeleton placeholder' },
    compact: { control: 'boolean', description: 'Use compact sizing' },
    showValue: {
      control: 'boolean',
      description: 'Show the percent beside the track (defaults on when labeled)',
    },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    value: { control: { type: 'number', min: 0, max: 100 }, description: 'Progress value' },
    max: { control: 'number', description: 'Maximum value' },
    intent: {
      control: 'select',
      options: ['accent', 'error', 'warning', 'success'],
      description: 'Semantic indicator fill resolved via the theme ramps',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          completion: 70,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <Progress label="Profile completion" name="completion" helperText="Read from form state" />
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Upload Progress',
    helperText: 'Uploading file...',
    value: 65,
  },
  render: (args) => <Progress {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Upload progress',
    helperText: 'Current upload status',
    value: 67,
    max: 100,
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Read-only Progress',
    value: 50,
    max: 100,
    readOnly: true,
    helperText: 'Display-only — Progress has no disabled mutation contract',
  },
};

export const WithError: Story = {
  args: {
    label: 'Required Progress',
    error: 'Progress must reach 100%',
    required: true,
    value: 30,
    max: 100,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Progress label="Small" size="$2" value={40} max={100} />
      <Progress label="Medium (default)" size="$3" value={60} max={100} />
      <Progress label="Large" size="$4" value={80} max={100} />
      <Progress label="Compact density" compact value={55} max={100} />
    </YStack>
  ),
};

/**
 * Semantic indicator fills: `accent` rides the base theme's
 * `$accentBackground`; `error`/`warning`/`success` ride their hue
 * sub-theme's `$color9`. Default keeps the gray form ramp.
 */
export const Intents: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Progress label="Default (form ramp)" value={65} max={100} />
      <Progress label="Accent" intent="accent" value={65} max={100} />
      <Progress label="Error" intent="error" value={65} max={100} />
      <Progress label="Warning" intent="warning" value={65} max={100} />
      <Progress label="Success" intent="success" value={65} max={100} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState(25);

      return (
        <YStack gap="$4">
          <Progress label="Task progress" value={value} max={100} helperText="Use the buttons to update" />
          <XStack gap="$2">
            <Button
              onPress={() => {
                const next = Math.max(0, value - 10);
                setValue(next);
                action('onProgressChange')(next);
              }}>
              -10
            </Button>
            <Button
              onPress={() => {
                const next = Math.min(100, value + 10);
                setValue(next);
                action('onProgressChange')(next);
              }}>
              +10
            </Button>
          </XStack>
        </YStack>
      );
    };

    return <InteractiveExample />;
  },
};

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui Progress beside the house Progress strictly so the difference
 * stays visible. Raw primitives here are by design and labeled — knob/contrast
 * probes skip this story via `parameters.foreignContrastSpecimen`.
 */
export const Comparison: Story = {
  name: 'Foreign contrast specimen (raw tamagui)',
  parameters: {
    // Machine-readable exemption for knob/contrast probes and the story-honesty linter arm.
    foreignContrastSpecimen: true,
    docs: {
      description: {
        story:
          'FOREIGN CONTRAST SPECIMEN (LC-56 STORY-HONESTY). The right column is the raw ' +
          'tamagui Progress, rendered for contrast only: it ignores house knobs and ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => (
    <XStack gap="$6" alignItems="flex-start" padding="$4">
      <YStack gap="$3" width={300}>
        <Paragraph size="$2" color="$placeholderColor">
          Custom Progress
        </Paragraph>
        <Progress value={67} max={100} />
      </YStack>

      <YStack gap="$3" width={300}>
        <Paragraph size="$2" color="$placeholderColor">
          Tamagui Progress
        </Paragraph>
        <TamaguiProgress value={67} max={100}>
          <TamaguiProgress.Indicator />
        </TamaguiProgress>
      </YStack>
    </XStack>
  ),
};

/** Loading placeholder — the skeleton mirrors the bar anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Upload progress', skeleton: true },
};
