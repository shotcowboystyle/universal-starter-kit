import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, TextArea as TamaguiTextArea, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { TextArea } from './index';

const meta: Meta<typeof TextArea> = {
  title: 'Forms/TextArea',
  component: TextArea,
  parameters: {
    docs: {
      description: {
        component: 'A textarea component with form integration for multi-line text input.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    skeleton: { control: 'boolean' },
    compact: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    maxLength: { control: 'number' },
    autoResize: { control: 'boolean' },
    value: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof TextArea>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          title: '',
          description: '',
          notes: 'Some default notes...',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} className="max-w-md">
          <YStack gap="$4">
            <TextArea label="Title" name="title" textAreaProps={{ placeholder: 'Enter a title' }} required />

            <TextArea
              label="Description"
              name="description"
              textAreaProps={{
                placeholder: 'Enter a detailed description',
                numberOfLines: 4,
              }}
              helperText="Provide as much detail as possible"
            />

            <TextArea
              label="Additional Notes"
              name="notes"
              textAreaProps={{
                placeholder: 'Any additional notes...',
                numberOfLines: 3,
              }}
            />

            <Button action="submit">Save</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description...',
    helperText: 'Include any access instructions',
    maxLength: 500,
    disabled: false,
    required: false,
    size: '$3',
  },
  render: (args) => <TextArea {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Description',
    helperText: 'Enter a detailed description',
    name: 'description',
    textAreaProps: { placeholder: 'Type your description here...' },
    onChangeText: action('onChangeText'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    disabled: true,
    textAreaProps: { placeholder: 'Cannot interact' },
  },
};

export const WithError: Story = {
  args: {
    label: 'Field with Error',
    error: 'This field is required',
    required: true,
  },
};

export const ReadOnly: Story = {
  args: {
    label: 'Published notes',
    defaultValue: 'These notes are locked after publish.',
    readOnly: true,
    helperText: 'Read-only — still focusable',
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <TextArea label="Small" size="$2" textAreaProps={{ placeholder: 'Small textarea' }} />
      <TextArea label="Medium (default)" size="$3" textAreaProps={{ placeholder: 'Medium textarea' }} />
      <TextArea label="Large" size="$4" textAreaProps={{ placeholder: 'Large textarea' }} />
    </YStack>
  ),
};

export const WithMaxLength: Story = {
  args: {
    ...Basic.args,
    textAreaProps: { ...Basic.args?.textAreaProps, maxLength: 100 },
    helperText: 'Maximum 100 characters',
  },
};

export const AutoResize: Story = {
  render: () => {
    const AutoResizeExample = () => {
      const [val, setVal] = useState('');
      return (
        <YStack gap="$4" padding="$4" maxWidth={500}>
          <Paragraph size="$3" fontWeight="bold">
            Auto-resize TextArea
          </Paragraph>
          <Paragraph size="$2" color="$placeholderColor">
            This textarea grows as you type, up to the maxRows limit (6 rows). Try pasting or typing multiple lines.
          </Paragraph>
          <TextArea
            label="Auto-growing notes"
            autoResize
            minRows={2}
            maxRows={6}
            value={val}
            onChangeText={(text) => {
              setVal(text);
              action('onChangeText')(text);
            }}
            textAreaProps={{ placeholder: 'Start typing to see it grow...' }}
            showCount
          />
          <TextArea
            label="Default (no auto-resize)"
            value={val}
            onChangeText={setVal}
            textAreaProps={{ placeholder: 'Fixed height for comparison' }}
          />
        </YStack>
      );
    };
    return <AutoResizeExample />;
  },
};

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui TextArea beside the house TextArea strictly so the difference
 * stays visible. Raw primitives here are by design and labeled — knob/contrast
 * probes skip this story via `parameters.foreignContrastSpecimen`.
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
          'tamagui TextArea, rendered for contrast only: it ignores house knobs and field ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => {
    const ComparisonExample = () => {
      const [customVal, setCustomVal] = useState('');
      const [tamaguiVal, setTamaguiVal] = useState('');
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom TextArea
            </Paragraph>
            <TextArea
              textAreaProps={{ placeholder: 'Type here...' }}
              value={customVal}
              onChangeText={(text) => {
                setCustomVal(text);
                action('custom.onChangeText')(text);
              }}
            />
          </YStack>

          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui TextArea
            </Paragraph>
            <TamaguiTextArea
              placeholder="Type here..."
              value={tamaguiVal}
              onChangeText={(text) => {
                setTamaguiVal(text);
                action('tamagui.onChangeText')(text);
              }}
            />
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the textarea anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Description', skeleton: true },
};
