import { StarIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Rating } from './index';

const meta: Meta<typeof Rating> = {
  title: 'Forms/Rating',
  component: Rating,
  parameters: {
    docs: {
      description: {
        component: 'A star rating field component with form integration.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    value: {
      control: { type: 'number', min: 0, max: 5 },
      description: 'Rating value (0-1 fraction)',
    },
    maxStars: { control: 'number', description: 'Number of stars' },
  },
};

export default meta;
type Story = StoryObj<typeof Rating>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          quality: 0.6,
          service: 0.8,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <Rating label="Quality" name="quality" helperText="Rate the product quality" starIcon={StarIcon} />
            <Rating label="Service" name="service" helperText="Rate the customer service" starIcon={StarIcon} />
            <Button action="submit">Submit Review</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Rating',
    helperText: 'Rate your experience',
    // Rating `value` is a 0..1 fraction of maxStars (0.6 * 5 = 3 stars).
    // `3` rendered all five stars filled (round(3*5)=15 >= 5).
    value: 0.6,
    maxStars: 5,
  },
  render: (args) => <Rating {...args} starIcon={StarIcon} />,
};

/**
 * Bare contract (Axiom 13 ONE BODY): no `starIcon` — the package
 * default star renders and stars stay keyboard-operable (roving tab stop,
 * Enter/Space, arrows).
 */
export const Bare: Story = {
  render: () => {
    const BareExample = () => {
      const [value, setValue] = useState(0.6);
      return (
        <Rating
          label="Rating"
          helperText="No starIcon prop — package default star"
          value={value}
          onChange={(v) => {
            setValue(v);
            action('onChange')(v);
          }}
        />
      );
    };
    return <BareExample />;
  },
};

export const Basic: Story = {
  args: {
    label: 'Rating',
    helperText: 'Rate your experience',
    value: 0.6,
    starIcon: StarIcon,
    onChange: action('onChange'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Rating',
    helperText: 'This rating is disabled',
    value: 0.6,
    disabled: true,
    starIcon: StarIcon,
    onChange: action('onChange'),
  },
};

export const WithError: Story = {
  args: {
    label: 'Rating',
    helperText: 'Rate your experience',
    value: 0,
    required: true,
    error: 'A rating is required',
    starIcon: StarIcon,
    onChange: action('onChange'),
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={300}>
      <Text fontWeight="bold">Size $2</Text>
      <Rating label="Small" value={0.6} size="$2" starIcon={StarIcon} onChange={action('onChange')} />
      <Text fontWeight="bold">Size $3</Text>
      <Rating label="Medium" value={0.6} size="$3" starIcon={StarIcon} onChange={action('onChange')} />
      <Text fontWeight="bold">Size $4</Text>
      <Rating label="Large" value={0.6} size="$4" starIcon={StarIcon} onChange={action('onChange')} />
    </YStack>
  ),
};

export const Pointy: Story = {
  render: () => {
    const PointyExample = () => {
      const [value, setValue] = useState(0.6);
      return (
        <YStack gap="$4" maxWidth={300}>
          <Rating
            label="Pointy (explicit prop)"
            helperText="Sharp-pointed stars via the pointy prop"
            value={value}
            onChange={setValue}
            starIcon={StarIcon}
            pointy
          />
          <Rating
            label="Regular"
            helperText="Default star icon"
            value={value}
            onChange={setValue}
            starIcon={StarIcon}
            pointy={false}
          />
        </YStack>
      );
    };
    return <PointyExample />;
  },
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState(0.4);
      return (
        <YStack gap="$4" maxWidth={300}>
          <Rating
            label="How would you rate this?"
            helperText="Click a star, or hover to preview"
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            starIcon={StarIcon}
          />
          <Rating label="Read only" value={0.8} readOnly starIcon={StarIcon} />
          <Rating label="Disabled" value={0.8} disabled starIcon={StarIcon} />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the star row anatomy. */
export const SkeletonState: Story = {
  render: () => <Rating label="Rating" skeleton starIcon={StarIcon} />,
};
