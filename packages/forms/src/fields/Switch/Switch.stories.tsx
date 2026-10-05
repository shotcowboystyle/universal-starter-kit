import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Label, Paragraph, Switch as TamaguiSwitch, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Switch } from './index';

const meta: Meta<typeof Switch> = {
  title: 'Forms/Switch',
  component: Switch,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    checked: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          notifications: true,
          marketing: false,
          analytics: true,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form}>
          <YStack gap="$4">
            <Switch label="Push Notifications" name="notifications" helperText="Receive notifications about updates" />
            <Switch label="Marketing Emails" name="marketing" helperText="Receive promotional emails" />
            <Switch label="Analytics Tracking" name="analytics" helperText="Help improve our service" />
            <Button action="submit">Save Preferences</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Dark mode',
    helperText: 'Toggle dark mode',
    disabled: false,
    required: false,
    size: '$3',
  },
  render: (args) => <Switch {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Enable notifications',
    helperText: 'Receive push notifications',
    defaultValue: false,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: 'Field with Error',
    error: 'This field is required',
    required: true,
  },
};

export const Pointy: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Switch label="Pointy (hard angles)" pointy defaultValue={true} />
      <Switch label="Regular (default)" pointy={false} defaultValue={true} />
    </YStack>
  ),
};

export const States: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Switch label="Off" defaultValue={false} />
      <Switch label="On" defaultValue={true} />
      <Switch label="Disabled off" disabled defaultValue={false} />
      <Switch label="Disabled on" disabled defaultValue={true} />
      <Switch label="Read only" readOnly defaultValue={true} />
    </YStack>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Switch
        label="Do not disturb"
        helperText="Icons sit in the off/on pockets"
        defaultValue={false}
        leftIcon=<XIcon />
        rightIcon=<CheckIcon />
      />
      <Switch label="Do not disturb" defaultValue={true} leftIcon=<XIcon /> rightIcon=<CheckIcon /> />
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Switch label="Small" size="$2" />
      <Switch label="Medium (default)" size="$3" />
      <Switch label="Large" size="$4" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [checked, setChecked] = useState(false);
      return (
        <YStack gap="$4" maxWidth={400}>
          <Paragraph size="$2" color="$placeholderColor">
            Click to toggle, or press and drag the thumb on/off.
          </Paragraph>
          <Switch
            label="Enable notifications"
            checked={checked}
            onCheckedChange={(val) => {
              setChecked(!!val);
              action('onCheckedChange')(val);
            }}
          />
          <Paragraph size="$2">Current value: {checked ? 'ON' : 'OFF'}</Paragraph>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const Comparison: StoryObj = {
  parameters: { foreignContrastSpecimen: true },
  render: () => {
    const ComparisonExample = () => {
      const [customChecked, setCustomChecked] = useState(false);
      const [tamaguiChecked, setTamaguiChecked] = useState(false);
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={250}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom Switch
            </Paragraph>
            <Switch
              label="Enable notifications"
              defaultValue={customChecked}
              onCheckedChange={(val) => {
                setCustomChecked(!!val);
                action('custom.onCheckedChange')(val);
              }}
            />
          </YStack>

          <YStack gap="$3" width={250}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui Switch
            </Paragraph>
            <XStack gap="$2" alignItems="center">
              <TamaguiSwitch
                id="tamagui-sw"
                checked={tamaguiChecked}
                onCheckedChange={(val) => {
                  setTamaguiChecked(val);
                  action('tamagui.onCheckedChange')(val);
                }}>
                <TamaguiSwitch.Thumb />
              </TamaguiSwitch>
              <Label htmlFor="tamagui-sw">Enable notifications</Label>
            </XStack>
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors track + label anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Enable notifications', skeleton: true },
};
