import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, SizableText, Text, ToggleGroup as TamaguiToggleGroup, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { ToggleGroup } from './index';

const meta: Meta<typeof ToggleGroup> = {
  title: 'Forms/ToggleGroup',
  component: ToggleGroup,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the toggle group',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the toggle group',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the toggle group is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the toggle group is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the toggle group',
    },
    type: {
      control: 'select',
      options: ['single', 'multiple'],
      description: 'Whether single or multiple items can be selected',
    },
    readOnly: {
      control: 'boolean',
      description: 'Whether the toggle group is read-only',
    },
    compact: {
      control: 'boolean',
      description: 'Density override (space only — LC-76)',
    },
    skeleton: {
      control: 'boolean',
      description: 'Render the LC-20 skeleton that mirrors the segment row',
    },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'Segment stack direction',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          alignment: 'center',
          features: ['comments'],
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <ToggleGroup
              label="Alignment"
              name="alignment"
              type="single"
              options={[
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
              ]}
            />
            <ToggleGroup
              label="Enabled features"
              name="features"
              type="multiple"
              options={[
                { label: 'Comments', value: 'comments' },
                { label: 'Mentions', value: 'mentions' },
                { label: 'Attachments', value: 'attachments' },
              ]}
            />
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
    label: 'Alignment',
    helperText: 'Choose alignment',
    type: 'single',
    defaultValue: 'left',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
  render: (args) => <ToggleGroup {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Text alignment',
    helperText: 'Choose one alignment',
    type: 'single',
    defaultValue: 'left',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
    onValueChange: action('onValueChange'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Toggle Group',
    disabled: true,
    disabledReason: 'Locked while the report is generating',
    type: 'single',
    defaultValue: 'left',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
};

/** A disabled item explains itself with a visible reason line. */
export const ItemDisabledReason: Story = {
  args: {
    label: 'Layout',
    type: 'single',
    defaultValue: 'left',
    options: [
      { label: 'Left', value: 'left' },
      {
        label: 'Center',
        value: 'center',
        disabled: true,
        disabledReason: 'Center layout needs the pro plan',
      },
      { label: 'Right', value: 'right' },
    ],
    onValueChange: action('onValueChange'),
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Read-only Toggle Group',
    readOnly: true,
    type: 'single',
    defaultValue: 'left',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
};

export const WithError: Story = {
  args: {
    label: 'Toggle Group with Error',
    error: 'This field is required',
    required: true,
    type: 'single',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
};

export const Vertical: Story = {
  args: {
    label: 'Density',
    helperText: 'Stacked segments keep square interior seams',
    type: 'single',
    orientation: 'vertical',
    defaultValue: 'comfortable',
    options: [
      { label: 'Compact', value: 'compact' },
      { label: 'Comfortable', value: 'comfortable' },
      { label: 'Spacious', value: 'spacious' },
    ],
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <ToggleGroup
        label="Small"
        size="$2"
        type="single"
        defaultValue="left"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
      />
      <ToggleGroup
        label="Medium (default)"
        size="$3"
        type="single"
        defaultValue="center"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
      />
      <ToggleGroup
        label="Large"
        size="$4"
        type="single"
        defaultValue="right"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
      />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('left');
      return (
        <YStack gap="$4" maxWidth={400}>
          <ToggleGroup
            label="Text alignment"
            type="single"
            value={value}
            onValueChange={(val) => {
              setValue(val as string);
            }}
            options={[
              { label: 'Left', value: 'left' },
              { label: 'Center', value: 'center' },
              { label: 'Right', value: 'right' },
            ]}
          />
          <Text>Selected: {value}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

const alignmentOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui ToggleGroup beside the house ToggleGroup strictly so the
 * difference stays visible. Raw primitives here are by design and labeled —
 * knob/contrast probes skip this story via `parameters.foreignContrastSpecimen`.
 */
export const Comparison: Story = {
  name: 'Foreign contrast specimen (raw tamagui)',
  parameters: {
    // Machine-readable exemption for knob/contrast probes and the story-honesty linter.
    foreignContrastSpecimen: true,
    docs: {
      description: {
        story:
          'FOREIGN CONTRAST SPECIMEN (LC-56 STORY-HONESTY). The right column is the raw ' +
          'tamagui ToggleGroup, rendered for contrast only: it ignores house knobs and ' +
          'control recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => {
    const ComparisonExample = () => {
      const [customVal, setCustomVal] = useState('left');
      const [tamaguiVal, setTamaguiVal] = useState('left');
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom ToggleGroup
            </Paragraph>
            <ToggleGroup
              type="single"
              value={customVal}
              options={alignmentOptions}
              onValueChange={(val) => {
                setCustomVal(val as string);
                action('custom.onValueChange')(val);
              }}
            />
          </YStack>

          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui ToggleGroup
            </Paragraph>
            <TamaguiToggleGroup
              type="single"
              value={tamaguiVal}
              onValueChange={(val) => {
                setTamaguiVal(val);
                action('tamagui.onValueChange')(val);
              }}>
              {alignmentOptions.map((opt) => (
                <TamaguiToggleGroup.Item key={opt.value} value={opt.value}>
                  <SizableText>{opt.label}</SizableText>
                </TamaguiToggleGroup.Item>
              ))}
            </TamaguiToggleGroup>
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the segment row anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Alignment', type: 'single', options: alignmentOptions, skeleton: true },
};

export const Compact: Story = {
  args: {
    label: 'Alignment',
    compact: true,
    type: 'single',
    defaultValue: 'center',
    options: alignmentOptions,
  },
};
