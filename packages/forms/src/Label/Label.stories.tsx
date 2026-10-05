import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Input as InputParts } from '../InputParts';

import { Label } from './index';

/**
 * The house Input chrome without the field's own label: the Label under test
 * is the one above it. The `Input` field brings its own label, so it cannot
 * stand here.
 */
function Control({ disabled, ...area }: { id: string; placeholder?: string; disabled?: boolean }) {
  return (
    <InputParts>
      <InputParts.Box disabled={disabled}>
        <InputParts.Area disabled={disabled} {...area} />
      </InputParts.Box>
    </InputParts>
  );
}

const meta: Meta<typeof Label> = {
  title: 'Forms/Label',
  component: Label,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    children: { control: 'text' },
    size: { control: 'select', options: ['$1', '$2', '$3', '$4', '$6', '$8'] },
    htmlFor: { control: 'text' },
    required: { control: 'boolean' },
    hidden: { control: 'boolean' },
    asPageHeading: { control: 'boolean' },
    error: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    children: 'Email address',
  },
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Basic: Story = {
  render: (args) => <Label {...args} />,
};

export const WithControl: Story = {
  render: () => (
    <YStack gap="$1.5" maxWidth={320}>
      <Label htmlFor="label-story-input" required>
        Email address
      </Label>
      <Control id="label-story-input" placeholder="you@example.com" />
    </YStack>
  ),
};

export const RequiredAndOptional: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={320}>
      <YStack gap="$1.5">
        <Label htmlFor="label-required" required>
          Email address
        </Label>
        <Control id="label-required" />
      </YStack>
      <YStack gap="$1.5">
        <Label htmlFor="label-optional" required={false} requiredMarking="optional">
          Nickname
        </Label>
        <Control id="label-optional" />
      </YStack>
    </YStack>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <YStack gap="$1.5" maxWidth={320}>
      <Label htmlFor="label-error" required error>
        Email address
      </Label>
      <Control id="label-error" />
    </YStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <YStack gap="$1.5" maxWidth={320}>
      <Label htmlFor="label-disabled" disabled>
        Email address
      </Label>
      <Control id="label-disabled" disabled />
    </YStack>
  ),
};

export const AsPageHeading: Story = {
  render: () => (
    <YStack gap="$2" maxWidth={400}>
      <Label htmlFor="label-heading" asPageHeading>
        Event name
      </Label>
      <Control id="label-heading" />
    </YStack>
  ),
};

export const Hidden: Story = {
  render: () => (
    <YStack gap="$1.5" maxWidth={320}>
      <Label htmlFor="label-hidden" hidden>
        Search
      </Label>
      <Control id="label-hidden" placeholder="Search" />
    </YStack>
  ),
};

export const EdgeCases: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={360}>
      <YStack gap="$1.5">
        <Label htmlFor="label-empty" />
        <Control id="label-empty" placeholder="empty label above" />
      </YStack>
      <YStack gap="$1.5">
        <Label htmlFor="label-long">
          This is an extremely long label that keeps going and going to check wrapping behaviour of label text over
          multiple lines without breaking the layout of the associated control
        </Label>
        <Control id="label-long" placeholder="long label above" />
      </YStack>
      <YStack gap="$1.5">
        <Label htmlFor="label-rtl">تسمية باللغة العربية</Label>
        <Control id="label-rtl" placeholder="rtl label above" />
      </YStack>
    </YStack>
  ),
};
