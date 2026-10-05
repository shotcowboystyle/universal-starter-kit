import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, Text, XStack, YStack } from 'tamagui';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { AdaptivePopup } from './index';

const meta: Meta<typeof AdaptivePopup> = {
  title: 'Forms/AdaptivePopup',
  component: AdaptivePopup,
  parameters: {
    docs: {
      description: {
        component:
          'A responsive popup that renders as a bottom Sheet at OVERLAY_BREAKPOINT and below, a centered Dialog on desktop, or an edge-anchored Drawer when face="drawer" above that breakpoint.',
      },
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'fullscreen'],
    },
    face: {
      control: 'select',
      options: ['dialog', 'drawer'],
    },
    title: { control: 'text' },
    description: { control: 'text' },
    showCloseButton: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof AdaptivePopup>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          title="Edit Profile"
          description="Make changes to your profile here."
          trigger={<Button>Open Popup</Button>}
          footer={
            <XStack gap="$2" justifyContent="flex-end">
              <Button
                chromeless
                onPress={() => {
                  setOpen(false);
                }}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  setOpen(false);
                }}>
                Save
              </Button>
            </XStack>
          }>
          <YStack gap="$3">
            <Input label="Name" placeholder="Enter your name" />
            <Input label="Email" placeholder="Enter your email" />
          </YStack>
        </AdaptivePopup>
      );
    };
    return <Example />;
  },
};

export const Drawer: Story = {
  name: 'Drawer',
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          face="drawer"
          title="Edit record"
          description="Keep the page in view while you edit."
          trigger={<Button>Open Drawer</Button>}
          footer={
            <XStack gap="$2" justifyContent="flex-end">
              <Button
                chromeless
                onPress={() => {
                  setOpen(false);
                }}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  setOpen(false);
                }}>
                Save
              </Button>
            </XStack>
          }>
          <YStack gap="$3">
            <Input label="Name" placeholder="Enter your name" />
            <Input label="Email" placeholder="Enter your email" />
            <Input label="Title" placeholder="Job title" />
            <Input label="Team" placeholder="Team" />
            <Input label="Location" placeholder="Location" />
            <Input label="Notes" placeholder="Notes" />
          </YStack>
        </AdaptivePopup>
      );
    };
    return <Example />;
  },
};

export const Sizes: Story = {
  render: () => {
    const SizeExample = ({ size }: { size: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen' }) => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          title={`Size: ${size}`}
          size={size}
          trigger={<Button>{size}</Button>}>
          <Paragraph>
            This popup uses size=&quot;{size}&quot;. On desktop this controls the max-width. On mobile it always renders
            as a sheet.
          </Paragraph>
        </AdaptivePopup>
      );
    };

    return (
      <XStack gap="$2" flexWrap="wrap">
        <SizeExample size="sm" />
        <SizeExample size="md" />
        <SizeExample size="lg" />
        <SizeExample size="xl" />
        <SizeExample size="fullscreen" />
      </XStack>
    );
  },
};

export const Fullscreen: Story = {
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          title="Fullscreen View"
          size="fullscreen"
          trigger={<Button>Open Fullscreen</Button>}>
          <YStack flex={1} backgroundColor="$color3" borderRadius="$2" padding="$4" gap="$2">
            <Text>This content fills the available space.</Text>
            <Text color="$color9">Great for maps, image viewers, or any content that benefits from more space.</Text>
          </YStack>
        </AdaptivePopup>
      );
    };
    return <Example />;
  },
};

export const WithoutTrigger: Story = {
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <YStack gap="$3">
          <Text>Control the popup externally without using the trigger prop:</Text>
          <Button
            onPress={() => {
              setOpen(true);
            }}>
            Open via external state
          </Button>
          <AdaptivePopup
            open={open}
            onOpenChange={setOpen}
            title="Externally Controlled"
            description="This popup was opened via external state management.">
            <Paragraph>
              Useful when you need to open the popup from multiple places or in response to async events.
            </Paragraph>
          </AdaptivePopup>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const NoCloseButton: Story = {
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          title="Confirmation"
          showCloseButton={false}
          trigger={<Button>Delete Item</Button>}
          footer={
            <XStack gap="$2" justifyContent="flex-end">
              <Button
                chromeless
                onPress={() => {
                  setOpen(false);
                }}>
                Cancel
              </Button>
              <Button
                backgroundColor="$red9"
                onPress={() => {
                  action('delete')();
                  setOpen(false);
                }}>
                Delete
              </Button>
            </XStack>
          }>
          <Paragraph>Are you sure you want to delete this item? This action cannot be undone.</Paragraph>
        </AdaptivePopup>
      );
    };
    return <Example />;
  },
};

export const Disabled: Story = {
  render: () => {
    const Example = () => {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          title="Disabled"
          disabled
          trigger={<Button>Disabled Trigger</Button>}>
          <Paragraph>You should not see this.</Paragraph>
        </AdaptivePopup>
      );
    };
    return <Example />;
  },
};
