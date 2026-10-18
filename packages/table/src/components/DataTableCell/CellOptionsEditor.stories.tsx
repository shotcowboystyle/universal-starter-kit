/**
 * CellOptionsEditor — the popover/sheet host for option groups too big for a
 * cell (UX-022 / LC-06 OVERSIZED-EDIT).
 *
 * A radio group rendered inline in a narrow column has options the user cannot
 * reach: the cell's overflow guard clips them. So the cell face becomes a
 * compact FieldDisplay trigger showing the current option label, and the full
 * list opens in a forms FloatingPanel — an anchored popover with collision
 * handling on desktop web, a bottom sheet on native and small viewports —
 * seeded at the cell's current value (Axiom 11).
 *
 * Two classes. COMMIT (`dismissOnPick`, the default) closes on a pick,
 * including re-picking the value already selected. COMPOSE (multi-select
 * toggles) stays open until Escape or an outside click, so several options can
 * be composed in one visit.
 */

import { RadioGroup, ToggleGroup } from '@repo/forms';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, View, YStack } from 'tamagui';

import { CellOptionsEditor } from './CellOptionsEditor';

const meta: Meta<typeof CellOptionsEditor> = {
  title: 'Table/CellOptionsEditor',
  component: CellOptionsEditor,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Compact cell face plus a FloatingPanel holding the full option list. ' +
          'COMMIT groups close on a pick; COMPOSE groups stay open.',
      },
    },
  },
};

export default meta;

const priorities = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

const labels = [
  { label: 'Bug', value: 'bug' },
  { label: 'Design', value: 'design' },
  { label: 'Infra', value: 'infra' },
];

/** A narrow frame, so the reason the panel exists is visible: the cell clips. */
const CellFrame = ({ children }: { children: React.ReactNode }) => (
  <View
    width={180}
    borderWidth={1}
    borderColor="$color6"
    borderRadius="$2"
    overflow="hidden">
    {children}
  </View>
);

const CommitCell = () => {
  const [value, setValue] = useState('high');
  return (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <Paragraph size="$2">COMMIT: picking is the exit. Panel closes on any pick.</Paragraph>
      <CellFrame>
        <CellOptionsEditor
          field="radiogroup"
          value={value}
          label="Priority">
          {(close) => (
            <RadioGroup
              value={value}
              onChange={(next: string) => {
                setValue(next);
                close();
              }}
              options={priorities}
              orientation="vertical"
            />
          )}
        </CellOptionsEditor>
      </CellFrame>
      <Paragraph
        size="$2"
        testID="committed-value">{`value: ${value}`}</Paragraph>
    </YStack>
  );
};

export const Default = {
  name: 'Main',
  render: () => <CommitCell />,
};

const ComposeCell = () => {
  const [value, setValue] = useState<string[]>(['bug']);
  return (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <Paragraph size="$2">COMPOSE: multi-select stays open so several options land in one visit.</Paragraph>
      <CellFrame>
        <CellOptionsEditor
          field="togglegroup"
          value={value}
          label="Labels"
          dismissOnPick={false}>
          {() => (
            <ToggleGroup
              value={value}
              onChange={(next: string | string[]) => {
                setValue(Array.isArray(next) ? next : [next]);
              }}
              options={labels}
              type="multiple"
              orientation="vertical"
            />
          )}
        </CellOptionsEditor>
      </CellFrame>
      <Paragraph
        size="$2"
        testID="committed-value">{`value: ${value.join(', ')}`}</Paragraph>
    </YStack>
  );
};

/** COMPOSE class: `dismissOnPick={false}` keeps the panel open across picks. */
export const Compose = {
  render: () => <ComposeCell />,
};

/**
 * Disabled: the face renders alone at reduced opacity, with no button role and
 * no panel — a disabled cell is not a keyboard stop.
 */
export const Disabled = {
  render: () => (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <CellFrame>
        <CellOptionsEditor
          field="radiogroup"
          value="medium"
          label="Priority"
          disabled>
          {() => (
            <RadioGroup
              value="medium"
              options={priorities}
              orientation="vertical"
            />
          )}
        </CellOptionsEditor>
      </CellFrame>
    </YStack>
  ),
};
