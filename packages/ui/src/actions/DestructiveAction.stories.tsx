import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { ActionBar } from './ActionBar';
import { DestructiveAction } from './DestructiveAction';

const meta: Meta<typeof DestructiveAction> = {
  title: 'Components/DestructiveAction',
  component: DestructiveAction,
  parameters: {
    docs: {
      description: {
        component:
          'W10 / DG-ACT + DG-DX — `<DestructiveAction severity>` picks one-click / confirm / typed-confirm. ' +
          'Defaults to danger tone + ConfirmDialog (`severity="medium"`). Pass `confirm` to eject. ' +
          '`formatActionLabel({ verb, noun })` and Button `verb`/`noun` encode DG-ACT-02. ' +
          '`ActionBar` DEV-warns on two primaries (DG-ACT-01). ' +
          'DG-ACT-06 (Primer): toggles/switches auto-commit; text/checkbox/radio need explicit save (see cell draft policy).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DestructiveAction>;

export const Severities: Story = {
  name: 'Severity tiers',
  render: () => (
    <YStack gap="$4" padding="$4" maxWidth={480}>
      <Paragraph size="$3">
        low = no confirm / no danger · medium = ConfirmDialog + danger · high = typed ConfirmDialog + danger
      </Paragraph>
      <ActionBar
        align="start"
        primary=<DestructiveAction severity="low" verb="Remove" noun="tag" onAction={() => action('low-remove')()} />
      />
      <ActionBar
        align="start"
        primary=<DestructiveAction
          verb="Delete"
          noun="pipeline"
          consequence="This cannot be undone."
          onAction={() => action('medium-delete')()}
        />
      />
      <ActionBar
        align="start"
        primary=<DestructiveAction
          severity="high"
          verb="Delete"
          noun="project"
          confirmationText="my-project"
          consequence="40 issues and 16 merge requests will be removed."
          onAction={() => action('high-delete')()}
        />
      />
    </YStack>
  ),
};

export const ActionBarOnePrimary: Story = {
  name: 'ActionBar + verb/noun',
  render: () => (
    <YStack gap="$4" padding="$4" maxWidth={520}>
      <Paragraph size="$3">One primary per region; labels from verb + noun.</Paragraph>
      <ActionBar
        id="form-actions"
        cancel=<Button actionRole="chrome" verb="Cancel" />
        secondary=<Button actionRole="secondary" verb="Save" noun="draft" outlined />
        primary=<Button accent verb="Publish" noun="post" />
      />
      <ActionBar
        id="row-actions"
        align="end"
        secondary=<Button actionRole="secondary" verb="Edit" />
        primary=<DestructiveAction verb="Delete" noun="row" onAction={() => action('delete-row')()} />
      />
    </YStack>
  ),
};

export const TwoPrimariesWarn: Story = {
  name: 'DEV warn — two primaries',
  parameters: {
    docs: {
      description: {
        story: 'Open the browser console — ActionBar emits `[actions] two-primaries` in DEV.',
      },
    },
  },
  render: () => (
    <ActionBar id="bad-region" padding="$4">
      <Button accent>Save</Button>
      <Button accent>Publish</Button>
    </ActionBar>
  ),
};
