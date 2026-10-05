import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import { useResolvedKnobs } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, type ReactNode } from 'react';
import { Paragraph, SizableText, XStack, YStack } from 'tamagui';

import { resetToasts } from '../Toast/store';

import { notify, NotifyHost, NotifyRegion, resetFeedback, type NotifyEvent } from './index';

/** Demo region frame rides the knobs (story honesty): a pinned $3
 * radius held a 7px arc at borderRadius:none. */
function DemoRegion({ children }: { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...knobProps.gap}
      {...knobProps.panelPadding}
      borderWidth={1}
      borderColor="$borderColor"
      {...knobProps.containerRadius}>
      {children}
    </YStack>
  );
}

function StoryReset() {
  useEffect(() => {
    resetToasts();
    resetFeedback();
    return () => {
      resetToasts();
      resetFeedback();
    };
  }, []);
  return null;
}

const meta: Meta = {
  title: 'Components/Notify',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Semantic `notify({ severity, scope, blocking, action, title, body })` router (DG-FB-01..04). Success/info page → toast; error/warning page → sticky banner; field/section → inline Alert; error|warning + blocking → ConfirmDialog (alertdialog; error is destructive). Errors never auto-dismiss; action toasts stay ≥10s.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const cases: Array<{ label: string; event: NotifyEvent }> = [
  {
    label: 'success → toast',
    event: { severity: 'success', scope: 'page', body: 'Customer record updated.' },
  },
  {
    label: 'info page → toast',
    event: {
      severity: 'info',
      scope: 'page',
      title: 'Heads up',
      body: 'A new version is available.',
    },
  },
  {
    label: 'success + action (≥10s)',
    event: {
      severity: 'success',
      scope: 'page',
      body: 'Message archived.',
      action: { label: 'Undo', onPress: () => action('undo')() },
    },
  },
  {
    label: 'error page → banner',
    event: {
      severity: 'error',
      scope: 'page',
      title: 'Save failed',
      body: 'The server rejected the request.',
      action: { label: 'Retry', onPress: () => action('retry')() },
    },
  },
  {
    label: 'error + blocking → dialog',
    event: {
      severity: 'error',
      scope: 'page',
      blocking: true,
      title: 'Payment failed',
      body: 'Your card was declined. Update payment method to continue.',
      action: { label: 'Update payment', onPress: () => action('update-payment')() },
    },
  },
  {
    label: 'warning + blocking → dialog',
    event: {
      severity: 'warning',
      scope: 'page',
      blocking: true,
      title: 'Unsaved changes',
      body: 'Leave this page? Your edits will be lost.',
      action: { label: 'Leave anyway', onPress: () => action('leave')() },
    },
  },
  {
    label: 'info section → alert',
    event: {
      severity: 'info',
      scope: 'section',
      title: 'Address check',
      body: 'Confirm the shipping address before submitting.',
    },
  },
  {
    label: 'error field → alert',
    event: {
      severity: 'error',
      scope: 'field',
      title: 'Invalid email',
      body: 'Enter a valid email address.',
    },
  },
];

/** Fire every routing branch from buttons; host renders toast/banner/dialog/regions. */
export const RoutingTable: Story = {
  name: 'Routing table',
  render: () => (
    <NotifyHost>
      <StoryReset />
      <YStack gap="$4" padding="$4" maxWidth={720}>
        <SizableText fontWeight="700" fontSize="$5">
          notify() routing
        </SizableText>
        <Paragraph size="$3" color="$color11">
          Success and page info go to toast. Page errors/warnings become sticky banners. Field and section scopes render
          inline alerts in the regions below. Blocking error/warning opens a ConfirmDialog (alertdialog; Escape/Cancel
          dismisses; error confirm is destructive).
        </Paragraph>
        <XStack gap="$2" flexWrap="wrap">
          {cases.map(({ label, event: ev }) => (
            <Button
              key={label}
              onPress={() => {
                action('notify')(ev);
                notify(ev);
              }}>
              {label}
            </Button>
          ))}
        </XStack>
        <DemoRegion>
          <SizableText fontWeight="600">Section region</SizableText>
          <NotifyRegion scope="section" />
          <Paragraph size="$2" color="$color10">
            Section-scoped notify() alerts land here.
          </Paragraph>
        </DemoRegion>
        <DemoRegion>
          <SizableText fontWeight="600">Field region</SizableText>
          <NotifyRegion scope="field" compact />
          <Paragraph size="$2" color="$color10">
            Field-scoped notify() alerts land here.
          </Paragraph>
        </DemoRegion>
      </YStack>
    </NotifyHost>
  ),
};
