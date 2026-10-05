import { EnvelopeIcon, EyeIcon, MagnifyingGlassIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Input as InputParts } from './index';

const meta: Meta<typeof InputParts> = {
  title: 'Forms/InputParts',
  component: InputParts,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The unstyled anatomy the Input field is assembled from, for consumers who need a shape the field does not offer. `InputParts.Box` is the bordered frame that owns the focus ring; `Area` is the text-entry itself and never rings; `Icon`, `Button` and `Section` are the slots either side of it; `Label`, `Info` and `Meta` are the chrome above and below. Reach for the `Input` FIELD first — this is the escape hatch.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof InputParts>;

/**
 * The whole anatomy at once: Label above, Box holding a leading Icon and the
 * Area, Meta reserving the caption line underneath.
 */
export const Anatomy: Story = {
  render: () => (
    <InputParts width={320}>
      <InputParts.Label htmlFor="anatomy-email">Email</InputParts.Label>
      <InputParts.Box>
        <InputParts.Icon adornment="leading">
          <EnvelopeIcon />
        </InputParts.Icon>
        <InputParts.Area id="anatomy-email" placeholder="you@example.com" onChangeText={action('onChangeText')} />
      </InputParts.Box>
      <InputParts.Meta helperText="We only use this to send receipts." />
    </InputParts>
  ),
};

/**
 * RING-ON-BOX: the Box carries the focus ring so adornments sit inside
 * it; the Area's own outline is killed. Tab into the field and the whole frame
 * rings once, not the text run.
 */
export const FocusRingOnTheBox: Story = {
  render: () => (
    <YStack gap="$4" width={320}>
      <Paragraph size="$2">Tab in — the border box rings, the input does not.</Paragraph>
      <InputParts>
        <InputParts.Box>
          <InputParts.Icon adornment="leading">
            <MagnifyingGlassIcon />
          </InputParts.Icon>
          <InputParts.Area placeholder="Search" onChangeText={action('onChangeText')} />
        </InputParts.Box>
      </InputParts>
    </YStack>
  ),
};

/** Leading and trailing slots. The trailing end-cap is square by size recipe. */
export const Adornments: Story = {
  render: () => (
    <YStack gap="$4" width={320}>
      <InputParts>
        <InputParts.Box>
          <InputParts.Icon adornment="leading">
            <MagnifyingGlassIcon />
          </InputParts.Icon>
          <InputParts.Area placeholder="Leading icon" />
        </InputParts.Box>
      </InputParts>
      <InputParts>
        <InputParts.Box>
          <InputParts.Area placeholder="Trailing icon" />
          <InputParts.Icon adornment="trailing">
            <EnvelopeIcon />
          </InputParts.Icon>
        </InputParts.Box>
      </InputParts>
      <InputParts>
        <InputParts.Box>
          <InputParts.Icon adornment="leading">
            <MagnifyingGlassIcon />
          </InputParts.Icon>
          <InputParts.Area placeholder="Both ends" />
          <InputParts.Icon adornment="trailing">
            <EnvelopeIcon />
          </InputParts.Icon>
        </InputParts.Box>
      </InputParts>
    </YStack>
  ),
};

/**
 * `InputParts.Button` is the pressable end-cap — a reveal toggle, a clear, a
 * copy. It squares off to the control height so the frame stays rectangular.
 */
export const TrailingButton: Story = {
  render: () => {
    const Example = () => {
      const [secure, setSecure] = useState(true);
      return (
        <InputParts width={320}>
          <InputParts.Label htmlFor="parts-password">Password</InputParts.Label>
          <InputParts.Box paddingInlineEnd={0}>
            <InputParts.Area
              id="parts-password"
              placeholder="••••••••"
              secureTextEntry={secure}
              onChangeText={action('onChangeText')}
            />
            <InputParts.Button
              glyphRing
              type="button"
              aria-label={secure ? 'Show password' : 'Hide password'} // gitleaks:allow -- UI label, not a credential
              onPress={() => {
                setSecure((prev) => !prev);
                action('togglePasswordVisibility')(!secure);
              }}>
              <InputParts.Icon aria-hidden>
                <EyeIcon />
              </InputParts.Icon>
            </InputParts.Button>
          </InputParts.Box>
          <InputParts.Meta helperText={secure ? 'Hidden' : 'Visible'} />
        </InputParts>
      );
    };
    return <Example />;
  },
};

/**
 * STABLE GROUND: `Meta` owns ONE caption slot. The error
 * replaces the helper in place, so surfacing it shifts nothing below.
 */
export const MetaReservesOneLine: Story = {
  render: () => (
    <YStack gap="$5" width={320}>
      <InputParts>
        <InputParts.Label>Helper</InputParts.Label>
        <InputParts.Box>
          <InputParts.Area placeholder="Valid" />
        </InputParts.Box>
        <InputParts.Meta helperText="Two to thirty characters." />
      </InputParts>
      <InputParts>
        <InputParts.Label>Error replaces it</InputParts.Label>
        <InputParts.Box>
          <InputParts.Area placeholder="Invalid" aria-invalid />
          <InputParts.Icon adornment="trailing" color="$red10">
            <WarningCircleIcon aria-hidden />
          </InputParts.Icon>
        </InputParts.Box>
        <InputParts.Meta helperText="Two to thirty characters." displayError="Enter at least two characters." />
      </InputParts>
    </YStack>
  ),
};

/** `Info` is the caption primitive `Meta` picks; use it directly for prose. */
export const Info: Story = {
  render: () => (
    <InputParts width={320}>
      <InputParts.Label>Display name</InputParts.Label>
      <InputParts.Box>
        <InputParts.Area placeholder="Ada Lovelace" />
      </InputParts.Box>
      <InputParts.Info>Shown next to everything you publish.</InputParts.Info>
    </InputParts>
  ),
};

/** `TextArea` is the multi-line Area: same focus wiring, no ring of its own. */
export const MultiLine: Story = {
  render: () => (
    <InputParts width={360}>
      <InputParts.Label htmlFor="parts-notes">Notes</InputParts.Label>
      <InputParts.Box alignItems="flex-start" height="auto" paddingVertical="$2">
        <InputParts.TextArea
          id="parts-notes"
          rows={4}
          placeholder="Anything the team should know"
          onChangeText={action('onChangeText')}
        />
      </InputParts.Box>
      <InputParts.Meta helperText="Markdown is not parsed here." />
    </InputParts>
  ),
};

/** Disabled chrome lives on the Box, not on the Area. */
export const DisabledBox: Story = {
  render: () => (
    <YStack gap="$4" width={320}>
      <InputParts>
        <InputParts.Box>
          <InputParts.Area placeholder="Enabled" />
        </InputParts.Box>
      </InputParts>
      <InputParts>
        <InputParts.Box disabled>
          <InputParts.Icon adornment="leading">
            <EnvelopeIcon />
          </InputParts.Icon>
          <InputParts.Area placeholder="Disabled" disabled />
        </InputParts.Box>
      </InputParts>
    </YStack>
  ),
};
