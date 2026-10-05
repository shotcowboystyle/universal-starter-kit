import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useEffect, useRef, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { SheetModal } from '../SheetModal';

import { resetToasts } from './store';

import { Toast, ToastViewport, showToast, useToast, type ToastIntent, type ToastShowOptions } from './index';

const intents: ToastIntent[] = ['accent', 'success', 'warning', 'error'];

/** Clear the module-level toast store between stories. */
function StoryReset() {
  useEffect(() => resetToasts, []);
  return null;
}

const meta: Meta<ToastShowOptions> = {
  title: 'Components/Toast',
  component: Toast as never,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Imperative feedback toasts: mount `<ToastViewport />` once at the app shell (a second mounted viewport no-ops), then fire from anywhere with `useToast().show({ title, description, intent, duration, sticky, action })`. Expiry policy: accent/success auto-dismiss at 5s, warning at 8s, error persists to a 12s ceiling and always carries the dismiss (X) affordance; `sticky: true` opts out of expiry (dismiss stays forced). Stacks bottom-right on web (top on native), pauses on hover, swipe/Escape/close-button dismissal, F8 focuses the viewport. Toasts layer BELOW modal overlays (sheets/dialogs) and only the card itself is interactive — clicks beside a toast pass through.',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    intent: { control: 'select', options: intents },
    duration: { control: 'number' },
    sticky: { control: 'boolean' },
    dismissible: { control: 'boolean' },
  },
  args: {
    title: 'Document saved',
    description: 'Your changes were written to the server.',
    intent: 'accent',
    duration: 5000,
    sticky: false,
    dismissible: true,
  },
};
export default meta;

type Story = StoryObj<ToastShowOptions>;

export const Default: Story = {
  name: 'Main',
  render: (args) => {
    const toast = useToast();
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <Button
          accent
          onPress={() => {
            action('show')(args);
            toast.show({ ...args });
          }}>
          Show toast
        </Button>
        <ToastViewport />
      </YStack>
    );
  },
};

export const Intents: Story = {
  render: () => {
    const toast = useToast();
    const copy: Record<ToastIntent, { title: string; description: string }> = {
      accent: { title: 'Heads up', description: 'A new version is available.' },
      success: { title: 'Saved', description: 'Customer record updated.' },
      warning: { title: 'Storage almost full', description: 'You are at 90% of your quota.' },
      error: { title: 'Save failed', description: 'The server rejected the request.' },
    };
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <XStack gap="$2" flexWrap="wrap">
          {intents.map((intent) => (
            <Button key={intent} onPress={() => toast.show({ intent, ...copy[intent] })}>
              {intent}
            </Button>
          ))}
        </XStack>
        <ToastViewport />
      </YStack>
    );
  },
};

export const WithAction: Story = {
  render: () => {
    const toast = useToast();
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <Button
          onPress={() =>
            toast.show({
              title: 'Message archived',
              description: 'The conversation was moved to the archive.',
              intent: 'success',
              action: {
                label: 'Undo',
                altText: 'Undo archiving the message',
                onPress: () => action('undo')(),
              },
            })
          }>
          Archive message
        </Button>
        <ToastViewport />
      </YStack>
    );
  },
};

export const Stacking: Story = {
  render: () => {
    const toast = useToast();
    const counter = useRef(0);
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <XStack gap="$2">
          <Button
            onPress={() => {
              counter.current += 1;
              const n = counter.current;
              toast.show({
                title: `Toast #${n}`,
                description: 'Each show() stacks a new toast.',
                intent: intents[n % intents.length],
              });
            }}>
            Add toast
          </Button>
          <Button
            onPress={() => {
              toast.dismissAll();
            }}>
            Dismiss all
          </Button>
        </XStack>
        <ToastViewport />
      </YStack>
    );
  },
};

/**
 * Expiry policy specimen: the plain failure toast expires at the 12s error
 * ceiling; the `sticky` one never expires and keeps its forced dismiss (X).
 */
export const ErrorExpiry: Story = {
  render: () => {
    const toast = useToast();
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <XStack gap="$2" flexWrap="wrap">
          <Button
            error
            onPress={() =>
              toast.show({
                title: 'Save failed',
                description: 'Expires on its own at the 12s ceiling.',
                intent: 'error',
              })
            }>
            Failure (auto-expires)
          </Button>
          <Button
            error
            onPress={() =>
              toast.show({
                title: 'Connection lost',
                description: 'Retrying in the background. Sticky: stays until dismissed.',
                intent: 'error',
                sticky: true,
              })
            }>
            Sticky failure
          </Button>
        </XStack>
        <ToastViewport />
      </YStack>
    );
  },
};

/**
 * Layering specimen: a sticky error + stacked success over an open modal
 * sheet. The sheet paints and hit-tests ABOVE the toasts (toast layer rides
 * `zIndex.loading`; the sheet portals to the root host at the sheet tier),
 * and only the toast card itself is ever interactive — sheet controls and
 * scrim taps beside a toast keep working.
 */
export const StickyErrorOverSheet: Story = {
  render: () => {
    const toast = useToast();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [presses, setPresses] = useState(0);
    return (
      <YStack gap="$4" alignItems="flex-start">
        <StoryReset />
        <XStack gap="$2" flexWrap="wrap">
          <Button
            error
            onPress={() => {
              toast.show({
                title: 'Connection lost',
                description: 'Sticky failure stays visible under the sheet.',
                intent: 'error',
                sticky: true,
              });
              toast.show({
                title: 'Draft saved',
                description: 'Stacked success toast.',
                intent: 'success',
              });
            }}>
            Show stacked toasts
          </Button>
          <Button
            accent
            onPress={() => {
              setSheetOpen(true);
            }}
            data-testid="open-sheet">
            Open sheet
          </Button>
        </XStack>
        <SheetModal open={sheetOpen} onOpenChange={setSheetOpen} snapPoint={70}>
          <YStack gap="$3" padding="$4" alignItems="flex-start">
            <Text fontWeight="600">Modal sheet above the toasts</Text>
            <Button
              onPress={() => {
                setPresses((n) => n + 1);
              }}
              data-testid="sheet-counter">
              Sheet button pressed {presses} times
            </Button>
          </YStack>
        </SheetModal>
        <ToastViewport />
      </YStack>
    );
  },
};

/** Viewport board: toasts are mounted, not behind a click — shooter finds [data-testid=toast]. */
export const ViewportPopulated: Story = {
  render: () => {
    useEffect(() => {
      resetToasts();
      showToast({
        title: 'Document saved',
        description: 'Your changes were written to the server.',
        intent: 'accent',
        sticky: true,
        action: { label: 'Undo', onPress: () => action('undo')() },
      });
      showToast({
        title: 'Customer record updated',
        intent: 'success',
        sticky: true,
      });
      showToast({
        title: 'Storage almost full',
        description: 'You are at 90% of your quota.',
        intent: 'warning',
        sticky: true,
      });
      showToast({
        title: 'Save failed',
        description: 'The server rejected the request.',
        intent: 'error',
        sticky: true,
        action: { label: 'Retry', onPress: () => action('retry')() },
      });
    }, []);
    return (
      <YStack minHeight={280}>
        <StoryReset />
        <ToastViewport />
      </YStack>
    );
  },
};

/** Static presentational surfaces (no viewport machinery) for visual QA. */
export const AllIntentsStatic: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={400}>
      <Text fontWeight="600">Standalone controlled toasts</Text>
      <Toast
        title="Heads up"
        description="A new version is available."
        intent="accent"
        action={{ label: 'Undo', onPress: () => action('undo')('accent') }}
        onDismiss={() => action('dismiss')('accent')}
      />
      <Toast
        title="Saved"
        description="Customer record updated."
        intent="success"
        onDismiss={() => action('dismiss')('success')}
      />
      <Toast
        title="Storage almost full"
        description="You are at 90% of your quota."
        intent="warning"
        onDismiss={() => action('dismiss')('warning')}
      />
      <Toast
        title="Save failed"
        description="The server rejected the request."
        intent="error"
        action={{ label: 'Retry', onPress: () => action('retry')() }}
        onDismiss={() => action('dismiss')('error')}
      />
      <Toast title="Title only, not dismissible" intent="accent" />
      <Toast
        compact
        title="Draft discarded"
        description="Nested overlay scale — density steps type and spacing; size stays independent."
        intent="warning"
        action={{ label: 'Undo', onPress: () => action('undo')() }}
        onDismiss={() => action('dismiss')('compact')}
      />
    </YStack>
  ),
};
