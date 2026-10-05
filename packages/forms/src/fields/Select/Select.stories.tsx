import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import { useResolvedKnobs } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import React, { useState } from 'react';
import { Paragraph, Select as TamaguiSelect, Sheet, useMedia, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { useViewportGtSm } from '../../FloatingPanel';
import { Form } from '../../Form';

import { Select, type SelectOption } from './index';

// tamagui v2 types Select.Content as children + scope + FocusScopeProps only,
// but it still forwards unknown props onto the popper frame — which is where
// this story needs the z-index to land so the menu clears the Sheet overlay.
// `as never` used to stand here and made the spread itself a TS2698.
const raiseAbovePortal: Record<string, unknown> = { zIndex: 200000 };

const meta: Meta<typeof Select> = {
  title: 'Forms/Select',
  component: Select,
  parameters: {
    docs: {
      description: {
        component: 'A select component with form integration and responsive design.',
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
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    value: { control: 'text' },
    options: { control: 'object' },
    multiple: { control: 'boolean' },
    dismissible: { control: 'boolean' },
    selectedOrder: {
      control: 'select',
      options: ['selected-first', 'stable'],
      description: 'Multi-select list order. selected-first pins chosen rows to the top; stable keeps options order.',
    },
    native: {
      control: 'boolean',
      description: 'iOS only. Opt into the OS ActionSheet. Ignored on web, Android, and when multiple is set.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

// Select fixtures carry >5 options — shorter lists belong in a
// RadioGroup/ToggleGroup and trip the `select-too-few-options` guardrail.
const sampleOptions: SelectOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
  { value: 'option4', label: 'Option 4' },
  { value: 'option5', label: 'Option 5' },
  { value: 'option6', label: 'Option 6' },
];

const roleOptions: SelectOption[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'user', label: 'User' },
  { value: 'guest', label: 'Guest' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

const countryOptions: SelectOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'ca', label: 'Canada' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
];

export const Main: StoryObj<typeof Select> = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          role: '',
          country: 'us',
          priority: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} className="max-w-md">
          <YStack gap="$4">
            <Select label="User Role" name="role" options={roleOptions} placeholder="Select a role" required />

            <Select label="Country" name="country" options={countryOptions} placeholder="Select your country" />

            <Select
              label="Priority"
              name="priority"
              options={[
                { value: 'none', label: 'No Priority' },
                { value: 'trivial', label: 'Trivial' },
                { value: 'low', label: 'Low Priority' },
                { value: 'medium', label: 'Medium Priority' },
                { value: 'high', label: 'High Priority' },
                { value: 'urgent', label: 'Urgent' },
              ]}
              placeholder="Select priority level"
            />

            <Button action="submit">Submit Form</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Country',
    placeholder: 'Select a country',
    helperText: 'Choose your country',
    disabled: false,
    required: false,
    size: '$3',
    options: countryOptions,
  },
  render: (args) => <Select {...args} />,
};

export const Basic: Story = {
  args: {
    options: sampleOptions,
    placeholder: 'Select an option',
  },
  render: function Render(args) {
    const [value, setValue] = useState('');
    return (
      <Select
        {...args}
        value={value || undefined}
        onValueChange={(val) => {
          setValue(Array.isArray(val) ? (val[0] ?? '') : val);
          action('onValueChange')(val);
        }}
      />
    );
  },
};

export const Multiple: Story = {
  args: {
    label: 'Options',
    multiple: true,
    dismissible: true,
    options: sampleOptions,
    placeholder: 'Select options',
  },
  render: (args) => <Select {...args} />,
};

export const MultipleStable: Story = {
  args: {
    label: 'Options',
    multiple: true,
    selectedOrder: 'stable',
    dismissible: true,
    options: sampleOptions,
    placeholder: 'Select options',
  },
  render: (args) => <Select {...args} />,
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    disabled: true,
    options: sampleOptions,
    placeholder: 'Cannot interact',
  },
};

export const WithError: Story = {
  args: {
    label: 'Field with Error',
    error: 'This field is required',
    required: true,
    options: sampleOptions,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Select label="Small" size="$2" options={sampleOptions} placeholder="Small select" />
      <Select label="Medium (default)" size="$3" options={sampleOptions} placeholder="Medium select" />
      <Select label="Large" size="$4" options={sampleOptions} placeholder="Large select" />
    </YStack>
  ),
};

export const DynamicOptions: StoryObj<typeof Select> = {
  render: () => {
    const DynamicExample = () => {
      // Rest on a picked category so the dependent select is populated at
      // rest (an empty/2-option Select trips `select-too-few-options`).
      const [category, setCategory] = useState('fruits');

      const getOptions = (category: string): SelectOption[] => {
        switch (category) {
          case 'fruits':
            return [
              { value: 'apple', label: 'Apple' },
              { value: 'banana', label: 'Banana' },
              { value: 'orange', label: 'Orange' },
              { value: 'mango', label: 'Mango' },
              { value: 'grape', label: 'Grape' },
              { value: 'pear', label: 'Pear' },
            ];
          case 'vegetables':
            return [
              { value: 'carrot', label: 'Carrot' },
              { value: 'broccoli', label: 'Broccoli' },
              { value: 'spinach', label: 'Spinach' },
              { value: 'potato', label: 'Potato' },
              { value: 'onion', label: 'Onion' },
              { value: 'pepper', label: 'Pepper' },
            ];
          case 'grains':
            return [
              { value: 'rice', label: 'Rice' },
              { value: 'wheat', label: 'Wheat' },
              { value: 'oats', label: 'Oats' },
              { value: 'barley', label: 'Barley' },
              { value: 'quinoa', label: 'Quinoa' },
              { value: 'millet', label: 'Millet' },
            ];
          case 'dairy':
            return [
              { value: 'milk', label: 'Milk' },
              { value: 'yogurt', label: 'Yogurt' },
              { value: 'cheese', label: 'Cheese' },
              { value: 'butter', label: 'Butter' },
              { value: 'cream', label: 'Cream' },
              { value: 'kefir', label: 'Kefir' },
            ];
          case 'proteins':
            return [
              { value: 'chicken', label: 'Chicken' },
              { value: 'fish', label: 'Fish' },
              { value: 'beef', label: 'Beef' },
              { value: 'tofu', label: 'Tofu' },
              { value: 'lentils', label: 'Lentils' },
              { value: 'eggs', label: 'Eggs' },
            ];
          case 'beverages':
            return [
              { value: 'water', label: 'Water' },
              { value: 'coffee', label: 'Coffee' },
              { value: 'tea', label: 'Tea' },
              { value: 'juice', label: 'Juice' },
              { value: 'smoothie', label: 'Smoothie' },
              { value: 'kombucha', label: 'Kombucha' },
            ];
          default:
            return [];
        }
      };

      const categoryOptions = [
        { value: 'fruits', label: 'Fruits' },
        { value: 'vegetables', label: 'Vegetables' },
        { value: 'grains', label: 'Grains' },
        { value: 'dairy', label: 'Dairy' },
        { value: 'proteins', label: 'Proteins' },
        { value: 'beverages', label: 'Beverages' },
      ];

      return (
        <YStack gap="$4" padding="$4">
          <Select
            label="Category"
            name="category"
            options={categoryOptions}
            value={category}
            placeholder="Select a category"
            onValueChange={(val) => {
              setCategory(Array.isArray(val) ? (val[0] ?? '') : val);
            }}
          />

          <Select
            label="Item"
            name="item"
            options={getOptions(category)}
            placeholder={category ? 'Select an item' : 'Select a category first'}
            disabled={!category}
          />
        </YStack>
      );
    };

    return <DynamicExample />;
  },
};

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui Select beside the house Select strictly so the difference stays
 * visible. Raw primitives here are by design and labeled — knob/contrast probes
 * skip this story via `parameters.foreignContrastSpecimen`.
 */
export const Comparison: StoryObj<typeof Select> = {
  name: 'Foreign contrast specimen (raw tamagui)',
  parameters: {
    // Machine-readable exemption for knob/contrast probes and the story-honesty linter arm.
    foreignContrastSpecimen: true,
    docs: {
      description: {
        story:
          'FOREIGN CONTRAST SPECIMEN (LC-56 STORY-HONESTY). The right column is the raw ' +
          'tamagui Select, rendered for contrast only: it ignores house knobs and control ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => {
    const ComparisonExample = () => {
      const [customValue, setCustomValue] = useState<string>();
      const [tamaguiValue, setTamaguiValue] = useState<string>();
      const { knobProps } = useResolvedKnobs();
      const media = useMedia();
      const viewportGtSm = useViewportGtSm();
      // Same 860 pivot as AdaptivePopup / FloatingPanel / SHC StackOverlaySurface:
      // Dialog/Content on wide, Sheet below OVERLAY_BREAKPOINT. Never Adapt.
      const isDesktop = typeof window !== 'undefined' ? viewportGtSm : media.sm;
      const selectItems = (
        <TamaguiSelect.Group>
          {sampleOptions.map((option, i) => (
            <TamaguiSelect.Item key={option.value} value={option.value} index={i}>
              <TamaguiSelect.ItemText>{option.label}</TamaguiSelect.ItemText>
            </TamaguiSelect.Item>
          ))}
        </TamaguiSelect.Group>
      );
      return (
        <XStack gap="$4" alignItems="flex-start" padding="$4">
          <YStack gap="$2" width={320}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom Select
            </Paragraph>
            <Select
              options={sampleOptions}
              placeholder="Select an option"
              groupLabel="Options"
              value={customValue}
              onValueChange={(val) => {
                setCustomValue(Array.isArray(val) ? val[0] : val);
                action('custom.onValueChange')(val);
              }}
            />
          </YStack>

          <YStack gap="$2" width={320}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui Select
            </Paragraph>
            <TamaguiSelect
              value={tamaguiValue}
              onValueChange={(val) => {
                setTamaguiValue(val);
                action('tamagui.onValueChange')(val);
              }}>
              <TamaguiSelect.Trigger iconAfter={CaretDownIcon}>
                <TamaguiSelect.Value placeholder="Select an option" />
              </TamaguiSelect.Trigger>
              {!isDesktop ? (
                <Sheet modal dismissOnSnapToBottom transition={knobProps.transition}>
                  <Sheet.Frame>
                    <Sheet.ScrollView>{selectItems}</Sheet.ScrollView>
                  </Sheet.Frame>
                  <Sheet.Overlay
                    transition={knobProps.transition}
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                  />
                </Sheet>
              ) : (
                <TamaguiSelect.Content {...raiseAbovePortal}>
                  <TamaguiSelect.ScrollUpButton
                    alignItems="center"
                    justifyContent="center"
                    position="relative"
                    width="100%"
                    height="$3">
                    <YStack zIndex={10}>
                      <CaretUpIcon size={20} />
                    </YStack>
                  </TamaguiSelect.ScrollUpButton>
                  <TamaguiSelect.Viewport minWidth={200}>{selectItems}</TamaguiSelect.Viewport>
                  <TamaguiSelect.ScrollDownButton
                    alignItems="center"
                    justifyContent="center"
                    position="relative"
                    width="100%"
                    height="$3">
                    <YStack zIndex={10}>
                      <CaretDownIcon size={20} />
                    </YStack>
                  </TamaguiSelect.ScrollDownButton>
                </TamaguiSelect.Content>
              )}
            </TamaguiSelect>
          </YStack>
        </XStack>
      );
    };

    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the trigger anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Country', options: countryOptions, skeleton: true },
};

export const NativeIos: Story = {
  name: 'Native iOS ActionSheet',
  args: {
    label: 'Country',
    options: countryOptions,
    placeholder: 'Choose a country',
    helperText: 'native — iOS ActionSheet; catalog sheet everywhere else',
    native: true,
  },
};
