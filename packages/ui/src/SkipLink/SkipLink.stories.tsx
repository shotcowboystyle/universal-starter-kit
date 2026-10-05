import { Button, Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { SizableText, XStack, YStack, View } from 'tamagui';

import { SkipLink } from './index';

const meta: Meta<typeof SkipLink> = {
  title: 'Components/SkipLink',
  component: SkipLink,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Keyboard-only 'Skip to content' link: visually hidden until it receives focus (first Tab on the page), then revealed fixed top-start on a themed elevated surface with the LC-71 ring on the <a>. Activating it (Enter) moves focus to the target (GOV.UK VoiceOver pattern). Intended consumer: DeskShell, rendered as the first child so Tab #1 lets keyboard users jump past the sidebar/toolbar straight to the form.",
      },
    },
  },
  argTypes: {
    targetId: { control: 'text', description: 'id of the element to jump to' },
    children: { control: 'text', description: 'Link label' },
  },
};
export default meta;

type Story = StoryObj<typeof SkipLink>;

/** Press Tab once — the link appears top-left. Press Enter — focus jumps
 * past the fake toolbar/sidebar into the main content region. */
export const Default: Story = {
  name: 'Main',
  args: { targetId: 'story-main-content', children: 'Skip to content' },
  render: (args) => (
    <YStack gap="$4" maxWidth={720}>
      <SkipLink {...args} />
      <SizableText color="$color11" fontSize="$3">
        Click the canvas, then press Tab: the skip link appears top-left. Enter jumps focus past the chrome below into
        the main region.
      </SizableText>
      <XStack gap="$2" alignItems="center" flexWrap="wrap">
        <Button compact>File</Button>
        <Button compact>Edit</Button>
        <Button compact>View</Button>
        <Button compact>Workspace</Button>
        <Button compact>Help</Button>
      </XStack>
      <XStack gap="$4">
        <YStack gap="$2" width={160}>
          <Button compact outlined>
            Inbox
          </Button>
          <Button compact outlined>
            Projects
          </Button>
          <Button compact outlined>
            Reports
          </Button>
        </YStack>
        <View flexGrow={1} id="story-main-content" role="main" aria-label="Main content">
          <YStack gap="$3">
            <SizableText fontWeight="600" fontSize="$5">
              New Contact
            </SizableText>
            <Input label="Full name" placeholder="Ada Lovelace" />
            <Input label="Email" placeholder="ada@example.com" />
            <XStack>
              <Button accent>Save</Button>
            </XStack>
          </YStack>
        </View>
      </XStack>
    </YStack>
  ),
};

export const CustomLabel: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={720}>
      <SkipLink targetId="story-form-region">Skip to form</SkipLink>
      <SizableText color="$color11" fontSize="$3">
        The label is any text; Tab once to reveal it.
      </SizableText>
      <View id="story-form-region">
        <YStack gap="$3">
          <Input label="Search" placeholder="Type to filter…" />
        </YStack>
      </View>
    </YStack>
  ),
};
