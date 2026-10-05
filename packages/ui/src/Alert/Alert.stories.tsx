import { Button, Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { SizableText, XStack, YStack } from 'tamagui';

import { Alert, type AlertIntent } from './index';

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Inline Alert/Banner for form validation summaries and page-level messages. Intents ride the semantic ramp (info uses the accent hue) and any Button placed inside inherits the intent, rendering SOLID like intent Buttons everywhere else. role=alert for error/warning, role=status otherwise.',
      },
    },
  },
  argTypes: {
    intent: { control: 'select', options: ['info', 'success', 'warning', 'error'] },
    title: { control: 'text', description: 'Bold first line' },
    children: { control: 'text', description: 'Description content' },
    dismissible: { control: 'boolean', description: 'Show the dismiss (X) button' },
    compact: { control: 'boolean', description: 'Tighter padding/type for dense layouts' },
    actionLabel: { control: 'text', description: 'Convenience action button label' },
    visible: { control: 'boolean', description: 'Controlled visibility' },
  },
};
export default meta;

type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  name: 'Main',
  args: {
    intent: 'info',
    title: 'Scheduled maintenance',
    children: 'The system will be unavailable Saturday from 02:00 to 04:00 UTC.',
    dismissible: true,
  },
};

export const Intents: Story = {
  render: () => {
    const intents: AlertIntent[] = ['info', 'success', 'warning', 'error'];
    const copy: Record<AlertIntent, { title: string; body: string }> = {
      info: { title: 'Heads up', body: 'A new version of this document is available.' },
      success: { title: 'Saved', body: 'Your changes have been saved.' },
      warning: { title: 'Unsaved changes', body: 'You have unsaved changes on this form.' },
      error: { title: 'Save failed', body: 'The server rejected the document. Try again.' },
    };
    return (
      <YStack gap="$3" maxWidth={640}>
        {intents.map((intent) => (
          <Alert key={intent} intent={intent} title={copy[intent].title}>
            {copy[intent].body}
          </Alert>
        ))}
      </YStack>
    );
  },
};

export const WithAction: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={640}>
      <Alert intent="error" title="Connection lost" actionLabel="Retry" onAction={() => {}} dismissible>
        Changes are no longer syncing to the server.
      </Alert>
      <Alert
        intent="warning"
        title="Trial expiring"
        actionLabel="Upgrade"
        secondaryActionLabel="Remind me"
        onAction={() => {}}
        onSecondaryAction={() => {}}>
        Your trial ends in 3 days.
      </Alert>
      <Alert intent="success" title="Import finished" actionLabel="View log" onAction={() => {}}>
        1,204 records imported, 0 errors.
      </Alert>
    </YStack>
  ),
};

export const Compact: Story = {
  render: () => (
    <YStack gap="$2" maxWidth={640}>
      <Alert compact intent="info" title="Read-only">
        You are viewing an archived document.
      </Alert>
      <Alert compact intent="error" dismissible>
        Amount must be greater than zero.
      </Alert>
      <Alert compact intent="success" title="Copied" actionLabel="Undo" onAction={() => {}}>
        Copied to clipboard.
      </Alert>
    </YStack>
  ),
};

export const TitleOnlyAndDescriptionOnly: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={640}>
      <Alert intent="warning" title="This record is locked by another user." />
      <Alert intent="info">Descriptions can stand alone when a title would be redundant.</Alert>
      <Alert intent="error" icon={null} title="No icon">
        Pass icon={'{null}'} to drop the leading icon.
      </Alert>
    </YStack>
  ),
};

export const Dismissible: Story = {
  render: () => {
    const [visible, setVisible] = useState(true);
    return (
      <YStack gap="$3" maxWidth={640}>
        <Alert intent="info" title="Uncontrolled" dismissible>
          Dismiss hides this alert via internal state.
        </Alert>
        <Alert
          intent="warning"
          title="Controlled"
          dismissible
          visible={visible}
          onDismiss={() => {
            setVisible(false);
          }}>
          Parent owns visibility through visible/onDismiss.
        </Alert>
        {!visible && (
          <Button
            compact
            onPress={() => {
              setVisible(true);
            }}>
            Restore controlled alert
          </Button>
        )}
      </YStack>
    );
  },
};

/** Composability demo: a validation summary Alert sits directly above a real
 * form with zero per-use styling on either side. */
export const ValidationSummary: Story = {
  render: () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);

    const submit = () => {
      const next: string[] = [];
      if (!name.trim()) {
        next.push('Full name is required.');
      }
      if (!email.includes('@')) {
        next.push('Email must be a valid address.');
      }
      setErrors(next);
      setSaved(next.length === 0);
    };

    return (
      <YStack gap="$4" maxWidth={480}>
        {errors.length > 0 && (
          <Alert intent="error" title={`Fix ${errors.length} problem${errors.length > 1 ? 's' : ''} before saving`}>
            <YStack gap="$1">
              {errors.map((e) => (
                <SizableText key={e} color="$color12" fontSize="$3" lineHeight={20}>
                  • {e}
                </SizableText>
              ))}
            </YStack>
          </Alert>
        )}
        {saved && (
          <Alert
            intent="success"
            title="Contact saved"
            dismissible
            onDismiss={() => {
              setSaved(false);
            }}
          />
        )}
        <YStack gap="$3">
          <Input label="Full name" placeholder="Ada Lovelace" value={name} onChangeText={setName} />
          <Input label="Email" placeholder="ada@example.com" value={email} onChangeText={setEmail} />
          <XStack>
            <Button accent onPress={submit}>
              Save contact
            </Button>
          </XStack>
        </YStack>
      </YStack>
    );
  },
};
