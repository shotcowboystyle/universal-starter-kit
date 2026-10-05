import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, Slider as TamaguiSlider, Text, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Slider } from './index';

const meta: Meta<typeof Slider> = {
  title: 'Forms/Slider',
  component: Slider,
  parameters: {
    docs: {
      description: {
        component: 'A slider field component with form integration for selecting values within a range.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the slider',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the slider',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the slider is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the slider is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the slider',
    },
    min: {
      control: 'number',
      description: 'Minimum slider value',
    },
    max: {
      control: 'number',
      description: 'Maximum slider value',
    },
    step: {
      control: 'number',
      description: 'Step increment for slider',
    },
    value: {
      control: 'object',
      description: 'Current slider value(s) as array',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          brightness: [80],
          contrast: [50],
          saturation: [70],
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <Slider label="Brightness" name="brightness" min={0} max={100} helperText="Adjust image brightness" />

            <Slider label="Contrast" name="contrast" min={0} max={100} helperText="Adjust image contrast" />

            <Slider label="Saturation" name="saturation" min={0} max={100} helperText="Adjust color saturation" />

            <Button action="submit">Apply Settings</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Volume',
    helperText: 'Adjust the volume',
    min: 0,
    max: 100,
    step: 1,
  },
  render: (args) => <Slider {...args} defaultValue={[50]} />,
};

export const Basic: Story = {
  args: {
    label: 'Volume Level',
    helperText: 'Adjust the volume from 0 to 100',
    name: 'volume',
    value: [50],
    min: 0,
    max: 100,
    onValueChange: action('onValueChange'),
  },
};

export const RangeSlider: Story = {
  args: {
    label: 'Price Range',
    helperText: 'Select minimum and maximum price',
    name: 'priceRange',
    value: [25, 75],
    min: 0,
    max: 100,
    onValueChange: action('onValueChange'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Slider',
    disabled: true,
    value: [40],
    min: 0,
    max: 100,
  },
};

export const WithError: Story = {
  args: {
    label: 'Slider with Error',
    error: 'This field is required',
    required: true,
    value: [0],
    min: 0,
    max: 100,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Slider label="Small" size="$2" value={[30]} min={0} max={100} />
      <Slider label="Medium (default)" size="$3" value={[50]} min={0} max={100} />
      <Slider label="Large" size="$4" value={[70]} min={0} max={100} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState([50]);
      return (
        <YStack gap="$4" maxWidth={400}>
          <Slider label="Adjust Value" value={value} min={0} max={100} onValueChange={setValue} />
          <Text>Current value: {value[0]}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui Slider beside the house Slider strictly so the difference stays
 * visible. Raw primitives here are by design and labeled — knob/contrast probes
 * skip this story via `parameters.foreignContrastSpecimen`.
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
          'tamagui Slider, rendered for contrast only: it ignores house knobs and control ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => {
    const ComparisonExample = () => {
      const [customVal, setCustomVal] = useState([50]);
      const [tamaguiVal, setTamaguiVal] = useState([50]);
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom Slider
            </Paragraph>
            <Slider
              value={customVal}
              min={0}
              max={100}
              onValueChange={(val) => {
                setCustomVal(val);
                action('custom.onValueChange')(val);
              }}
            />
          </YStack>

          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui Slider
            </Paragraph>
            <TamaguiSlider
              value={tamaguiVal}
              min={0}
              max={100}
              onValueChange={(val) => {
                setTamaguiVal(val);
                action('tamagui.onValueChange')(val);
              }}>
              <TamaguiSlider.Track>
                <TamaguiSlider.TrackActive />
              </TamaguiSlider.Track>
              <TamaguiSlider.Thumb index={0} circular elevate />
            </TamaguiSlider>
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the track anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Volume', skeleton: true },
};
