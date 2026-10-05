import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';

import { ProgressSteps } from './index';

const meta: Meta<typeof ProgressSteps> = {
  title: 'Components/ProgressSteps',
  component: ProgressSteps,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Multi-step wizard / progress indicator. Distinct from forms Progress (bar) and forms Stepper (quantity). Timeline covers chronological history.',
      },
    },
  },
  argTypes: {
    current: { control: { type: 'number', min: 0, max: 4 } },
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
    compact: { control: 'boolean' },
    allowJump: { control: 'boolean' },
    linear: { control: 'boolean' },
    labels: { control: 'select', options: ['visible', 'hidden'] },
  },
};
export default meta;

type Story = StoryObj<typeof ProgressSteps>;

const demoSteps = [
  { id: 'account', label: 'Account', description: 'Email & password' },
  { id: 'profile', label: 'Profile', description: 'Name & avatar' },
  { id: 'team', label: 'Team', description: 'Invite coworkers' },
  { id: 'done', label: 'Done', description: 'Review & finish' },
];

export const Default: Story = {
  name: 'Main',
  args: {
    steps: demoSteps,
    current: 1,
  },
};

export const Interactive: Story = {
  render: () => {
    // Rest mid-range: at step 0 the Back button is bare-disabled at rest
    // and demos nothing; step 0 stays one click away.
    // Linear (Material / Orbit): completed steps jump back; Next is the
    // only way forward.
    const [current, setCurrent] = useState(1);
    return (
      <YStack gap="$4" maxWidth={720}>
        <ProgressSteps steps={demoSteps} current={current} onStepChange={setCurrent} />
        <XStack gap="$2">
          <Button
            compact
            disabled={current === 0}
            onPress={() => {
              setCurrent((c) => Math.max(0, c - 1));
            }}>
            Back
          </Button>
          <Button
            compact
            accent
            disabled={current >= demoSteps.length - 1}
            onPress={() => {
              setCurrent((c) => Math.min(demoSteps.length - 1, c + 1));
            }}>
            Next
          </Button>
        </XStack>
      </YStack>
    );
  },
};

export const Vertical: Story = {
  args: {
    steps: demoSteps,
    current: 2,
    orientation: 'vertical',
  },
};

export const HiddenLabels: Story = {
  name: 'Labels hidden',
  args: {
    steps: demoSteps,
    current: 1,
    labels: 'hidden',
  },
};

export const Compact: Story = {
  args: {
    steps: demoSteps.map(({ id, label }) => ({ id, label })),
    current: 0,
    compact: true,
  },
};

export const Error: Story = {
  args: {
    steps: [
      { id: 'account', label: 'Account', description: 'Email & password' },
      {
        id: 'profile',
        label: 'Profile',
        description: 'Name is required',
        error: true,
      },
      { id: 'team', label: 'Team', description: 'Invite coworkers' },
      { id: 'done', label: 'Done', description: 'Review & finish' },
    ],
    current: 1,
  },
};

export const Optional: Story = {
  args: {
    steps: [
      { id: 'account', label: 'Account', description: 'Email & password' },
      { id: 'profile', label: 'Profile', optional: true },
      { id: 'team', label: 'Team', description: 'Invite coworkers' },
      { id: 'done', label: 'Done' },
    ],
    current: 1,
  },
};

export const NonLinear: Story = {
  render: () => {
    const [current, setCurrent] = useState(1);
    return (
      <YStack gap="$4" maxWidth={720}>
        <ProgressSteps steps={demoSteps} current={current} linear={false} onStepChange={setCurrent} />
      </YStack>
    );
  },
};
