import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { SizableText, YStack } from 'tamagui';

import { Button } from '../Button';
import { Checkbox } from '../fields/Checkbox';
import { Input } from '../fields/Input';
import { RadioGroup } from '../fields/RadioGroup';
import { Switch } from '../fields/Switch';
import { Form } from '../Form';

import { ContextualSaveBar } from './index';

const fields = (
  <YStack gap="$4" width="100%" maxWidth={640} padding="$4" minHeight={360}>
    <Input name="name" label="Service name" />
    <Checkbox name="agree" label="Notify on deploy" />
    <RadioGroup
      name="env"
      label="Environment"
      options={[
        { label: 'Prod', value: 'prod' },
        { label: 'Stage', value: 'stage' },
      ]}
    />
    <Switch name="live" label="Live" />
  </YStack>
);

const meta: Meta<typeof ContextualSaveBar> = {
  title: 'Forms/ContextualSaveBar',
  component: ContextualSaveBar,
  parameters: {
    layout: 'fullscreen',
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Declarative dirty-state Save/Discard bar (DG-ACT-06). Text, checkbox, and radio stage; Switch auto-commits and never raises the bar. Discard is never disabled (LC-30). Frame is CONTAINER-CAP on the top pair only; bottom pair stays 0 (bottom-docked sheet).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ContextualSaveBar>;

export const Main: Story = {
  name: 'Main',
  render: () => (
    <Form
      saveBar={{
        forceVisible: true,
        onSaved: action('onSaved'),
        onAutoCommit: action('onAutoCommit'),
      }}
      formOptions={{
        defaultValues: {
          name: 'svc',
          agree: false,
          env: 'prod',
          live: false,
        },
      }}
      onSubmit={async (values) => {
        action('onSubmit')(values);
      }}>
      {fields}
    </Form>
  ),
};

export const Dirty: Story = {
  name: 'Dirty',
  render: () => (
    <Form
      saveBar={{ onSaved: action('onSaved'), onAutoCommit: action('onAutoCommit') }}
      formOptions={{
        defaultValues: {
          name: 'svc',
          agree: false,
          env: 'prod',
          live: false,
        },
      }}
      onSubmit={async (values) => {
        action('onSubmit')(values);
      }}>
      {fields}
    </Form>
  ),
};

export const NarrowRefusal: Story = {
  name: 'Narrow refusal',
  render: () => (
    <YStack width={309} maxWidth="100%">
      <Form
        saveBar={{ forceVisible: true }}
        formOptions={{ defaultValues: { name: 'service-example' } }}
        onSubmit={async () => {
          throw new Error(
            'service_identifier_already_exists_012345678901234567890123456789. Choose a different identifier and retry.',
          );
        }}>
        <Input name="name" label="Service name" />
      </Form>
    </YStack>
  ),
};

function SubmissionPathsFixture() {
  const [calls, setCalls] = useState(0);
  return (
    <YStack gap="$3" width={360} maxWidth="100%" padding="$4">
      <SizableText data-testid="submit-calls">onSubmit calls: {calls}</SizableText>
      <Form
        saveBar={{ forceVisible: true, onSaved: action('onSaved') }}
        formOptions={{ defaultValues: { name: 'service-example' } }}
        onSubmit={async (values) => {
          setCalls((count) => count + 1);
          action('onSubmit')(values);
          throw new Error('The record changed. Refresh and retry.');
        }}>
        <Input name="name" label="Service name" />
        <Button action="submit">Submit</Button>
      </Form>
    </YStack>
  );
}

export const SubmissionPaths: Story = {
  name: 'Submission paths',
  parameters: {
    docs: {
      description: {
        story:
          'Every path into one refusing onSubmit: Enter in the field (HTML submit), Submit (Button action=submit), Save, and Cmd/Ctrl-S. The counter shows how many times onSubmit ran, so each activation must add exactly one and every path must show the same failure.',
      },
    },
  },
  render: () => <SubmissionPathsFixture />,
};
