import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { authorOptions } from './authorOptions';

import { Combobox, type ComboboxOption } from './index';

const meta: Meta<typeof Combobox> = {
  title: 'Forms/Combobox',
  component: Combobox,
  parameters: {
    docs: {
      description: {
        component:
          'A searchable select component with form integration. Use when options are many and users benefit from filtering by typing.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the combobox',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text when no value is selected',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the combobox',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the combobox is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the combobox is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the combobox',
    },
    searchPlaceholder: {
      control: 'text',
      description: 'Placeholder text in the search input',
    },
    options: {
      control: 'object',
      description: 'Array of selectable options',
    },
    multiple: {
      control: 'boolean',
      description: 'Allow selecting multiple options',
    },
    dismissible: {
      control: 'boolean',
      description: 'Show dismiss button on selected badges (multiple mode)',
    },
    creatable: {
      control: 'boolean',
      description: 'Allow creating a new option from the search text',
    },
    selectedOrder: {
      control: 'select',
      options: ['selected-first', 'stable'],
      description: 'Multi-select list order. selected-first pins chosen rows to the top; stable keeps options order.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Combobox>;

export const Main: StoryObj<typeof Combobox> = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          author: '',
          favoriteAuthor: 'hemingway',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={300}>
            <Combobox
              label="Author"
              name="author"
              options={authorOptions}
              placeholder="Select an author..."
              searchPlaceholder="Type to search..."
              required
            />

            <Combobox
              label="Favorite author"
              name="favoriteAuthor"
              options={authorOptions}
              placeholder="Select an author..."
              searchPlaceholder="Type to search..."
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
    label: 'Author',
    placeholder: 'Select an author',
    helperText: 'Choose an author from the list',
    options: authorOptions,
  },
  render: (args) => <Combobox {...args} />,
};

export const Multiple: Story = {
  args: {
    label: 'Authors',
    placeholder: 'Select authors',
    multiple: true,
    dismissible: true,
    options: authorOptions,
  },
  render: (args) => <Combobox {...args} />,
};

export const MultipleStable: Story = {
  args: {
    label: 'Authors',
    placeholder: 'Select authors',
    multiple: true,
    selectedOrder: 'stable',
    dismissible: true,
    options: authorOptions,
  },
  render: (args) => <Combobox {...args} />,
};

export const Creatable: Story = {
  args: {
    label: 'Tags',
    placeholder: 'Select or create a tag',
    creatable: true,
    options: authorOptions,
  },
  render: (args) => <Combobox {...args} onCreate={(value) => ({ value, label: value })} />,
};

export const Basic: Story = {
  args: {
    options: authorOptions,
    placeholder: 'Select an author...',
    searchPlaceholder: 'Type to search...',
  },
  render: function Render(args) {
    const [value, setValue] = useState<string | undefined>();
    return (
      <YStack gap="$4" maxWidth={300}>
        <Combobox
          {...args}
          value={value}
          onValueChange={(val) => {
            setValue(Array.isArray(val) ? val[0] : val);
            action('onValueChange')(val);
          }}
        />
        {value && <Text color="$colorHover">Selected: {value}</Text>}
      </YStack>
    );
  },
};

export const WithLabel: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | undefined>();
    return (
      <YStack gap="$4" maxWidth={300}>
        <Combobox
          label="Author"
          helperText="Select an author from the list"
          options={authorOptions}
          value={value}
          onValueChange={(v) => {
            setValue(Array.isArray(v) ? v[0] : v);
          }}
          placeholder="Select an author..."
          searchPlaceholder="Type to search..."
        />
      </YStack>
    );
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Combobox',
    disabled: true,
    options: authorOptions,
    placeholder: 'Select an author...',
  },
};

export const WithError: Story = {
  args: {
    label: 'Combobox with Error',
    error: 'This field is required',
    required: true,
    options: authorOptions,
    placeholder: 'Select an author...',
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Combobox label="Small" size="$2" options={authorOptions} placeholder="Select..." />
      <Combobox label="Medium (default)" size="$3" options={authorOptions} placeholder="Select..." />
      <Combobox label="Large" size="$4" options={authorOptions} placeholder="Select..." />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState<string | undefined>();
      return (
        <YStack gap="$4" maxWidth={400}>
          <Combobox
            label="Pick an author"
            options={authorOptions}
            value={value}
            onValueChange={(v) => {
              setValue(Array.isArray(v) ? v[0] : v);
            }}
            placeholder="Select an author..."
          />
          <Text>Selected: {value || 'None'}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const CustomTrigger: StoryObj<typeof Combobox> = {
  render: () => {
    const CustomTriggerExample = () => {
      const [value, setValue] = useState<string | undefined>();
      return (
        <YStack gap="$4" maxWidth={300}>
          <Text fontWeight="bold" color="$colorHover">
            Author picker with custom trigger:
          </Text>
          <XStack gap="$2" alignItems="center">
            <Combobox
              options={authorOptions}
              value={value}
              onValueChange={(v) => {
                setValue(Array.isArray(v) ? v[0] : v);
              }}
              searchPlaceholder="Type to search..."
              popoverWidth={260}
              trigger={(selected) => (
                <XStack
                  gap="$2"
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor="$backgroundHover"
                  borderRadius="$3"
                  hoverStyle={{ backgroundColor: '$backgroundPress' }}
                  pressStyle={{ backgroundColor: '$backgroundFocus' }}
                  cursor="pointer">
                  <Text fontSize="$5">📚</Text>
                  <Text color="$colorHover">
                    {(Array.isArray(selected) ? selected[0]?.label : selected?.label) || 'Pick an author'}
                  </Text>
                </XStack>
              )}
            />
          </XStack>
          {value && <Text color="$colorHover">Selected: {value}</Text>}
        </YStack>
      );
    };
    return <CustomTriggerExample />;
  },
};

export const ManyOptions: StoryObj<typeof Combobox> = {
  render: function Render() {
    const [value, setValue] = useState<string | undefined>();
    const options: ComboboxOption[] = Array.from({ length: 100 }, (_, i) => ({
      value: `item-${i + 1}`,
      label: `Item ${i + 1}`,
      keywords: `option number ${i + 1}`,
    }));
    return (
      <YStack gap="$4" maxWidth={300}>
        <Combobox
          label="Pick an item"
          options={options}
          value={value}
          onValueChange={(v) => {
            setValue(Array.isArray(v) ? v[0] : v);
          }}
          placeholder="Select from 100 items..."
          searchPlaceholder="Type to filter..."
          emptyMessage="No matching items."
        />
      </YStack>
    );
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Author', options: authorOptions, skeleton: true },
};
