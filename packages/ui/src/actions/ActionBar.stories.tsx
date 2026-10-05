import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Card } from '../surfaces';

import { ActionBar, type ActionBarProps } from './ActionBar';

/**
 * Presses land in the story itself rather than the Actions panel: the panel's
 * `action()` pulls the Storybook preview runtime into the module graph, which
 * the package's own vitest run cannot load, and the colocated spec mounts
 * these stories for real.
 */
function useLastPressed() {
  const [last, setLast] = useState<string | null>(null);
  return {
    last,
    press: (label: string) => () => {
      setLast(label);
    },
    readout: (
      <Paragraph size="$2" color="$color11">
        {last === null ? 'No action pressed yet.' : `Last pressed: ${last}`}
      </Paragraph>
    ),
  };
}

const meta: Meta<typeof ActionBar> = {
  title: 'Components/ActionBar',
  component: ActionBar,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The action row. Slots (`primary`, `secondary`, `cancel`) keep the primary singular by construction and order the row cancel → secondary → primary, so the trailing default lands under the thumb. `align` picks the justification: `end` for dialogs and toolbars, `start` for page-level forms. DG-ACT-05 strips `disabled` off the cancel slot and DEV-warns; DG-ACT-01 DEV-warns on a second primary, including one composed into free children; DG-OVL-04 DEV-warns past two actions inside a dialog region unless `allowManyActions` ejects.',
      },
    },
  },
  argTypes: {
    align: { control: 'radio', options: ['start', 'end', 'between'] },
    allowManyActions: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof ActionBar>;

function Basic(args: Partial<ActionBarProps>) {
  const { press, readout } = useLastPressed();
  return (
    <Card maxWidth={480}>
      <YStack gap="$3">
        {readout}
        <ActionBar
          {...args}
          cancel={
            <Button chromeless onPress={press('Cancel')}>
              Cancel
            </Button>
          }
          primary={
            <Button accent onPress={press('Save changes')}>
              Save changes
            </Button>
          }
        />
      </YStack>
    </Card>
  );
}

function FullRow() {
  const { press, readout } = useLastPressed();
  return (
    <Card maxWidth={520}>
      <YStack gap="$3">
        {readout}
        <ActionBar
          cancel={
            <Button chromeless onPress={press('Cancel')}>
              Cancel
            </Button>
          }
          secondary={[
            <Button key="draft" onPress={press('Save draft')}>
              Save draft
            </Button>,
            <Button key="preview" onPress={press('Preview')}>
              Preview
            </Button>,
          ]}
          primary={
            <Button accent onPress={press('Publish')}>
              Publish
            </Button>
          }
        />
      </YStack>
    </Card>
  );
}

export const Default: Story = {
  name: 'Main',
  args: { align: 'end' },
  render: (args) => <Basic {...args} />,
};

export const WithSecondary: Story = {
  name: 'Cancel + secondary + primary',
  render: () => <FullRow />,
};

export const Alignments: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={520}>
      {(['start', 'end', 'between'] as const).map((align) => (
        <Card key={align}>
          <YStack gap="$2">
            <Paragraph size="$2">{`align="${align}"`}</Paragraph>
            <ActionBar
              align={align}
              cancel={<Button chromeless>Cancel</Button>}
              primary={<Button accent>Confirm</Button>}
            />
          </YStack>
        </Card>
      ))}
    </YStack>
  ),
};

export const CancelNeverDisabled: Story = {
  name: 'Cancel is never disabled',
  parameters: {
    docs: {
      description: {
        story:
          'DG-ACT-05: the cancel slot is handed `disabled`, the prop is stripped, and DEV logs `[actions] cancel-disabled`. A dismissal a user cannot reach is a trap, so the escape hatch stays live even while the primary is blocked. Open the console to see the warn.',
      },
    },
  },
  render: () => {
    return (
      <Card maxWidth={480}>
        <ActionBar
          cancel={
            <Button chromeless disabled>
              Cancel
            </Button>
          }
          primary={
            <Button accent disabled>
              Save changes
            </Button>
          }
        />
      </Card>
    );
  },
};
