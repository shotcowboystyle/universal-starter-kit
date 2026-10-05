import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import { CheckboxGroup } from './CheckboxGroup';

import { Checkboxes } from './index';

const meta: Meta = {
  title: 'Forms/Checkboxes',
  parameters: { status: { type: 'beta' } },
};

export default meta;
type Story = StoryObj;

function CompoundExample({ card = true }: { card?: boolean }) {
  const [values, setValues] = useState<Record<string, boolean>>({
    analytics: true,
    updates: false,
    marketing: false,
  });
  const entries: Array<[string, string, string]> = [
    ['analytics', 'Product analytics', 'Usage metrics that help us improve the product.'],
    ['updates', 'Release updates', 'A short note whenever a new version ships.'],
    ['marketing', 'Marketing emails', 'Occasional tips, offers, and product news.'],
  ];
  return (
    <YStack gap="$4" maxWidth={400}>
      <Checkboxes
        values={values}
        onValuesChange={(next) => {
          setValues(next);
          action('onValuesChange')(next);
        }}>
        <Checkboxes.Title>Notification Preferences</Checkboxes.Title>
        <Checkboxes.FocusGroup orientation="vertical">
          <Checkboxes.Group>
            {entries.map(([value, label, description]) => (
              <Checkboxes.Group.Item key={value}>
                <Checkboxes.FocusGroup.Item value={value}>
                  {card ? (
                    <Checkboxes.Card>
                      <Checkboxes.Checkbox>
                        <Checkboxes.Checkbox.Indicator />
                      </Checkboxes.Checkbox>
                      <Checkboxes.Card.Content>
                        <Checkboxes.Card.Label>{label}</Checkboxes.Card.Label>
                        <Checkboxes.Card.Description>{description}</Checkboxes.Card.Description>
                      </Checkboxes.Card.Content>
                    </Checkboxes.Card>
                  ) : (
                    <XStack gap="$2" alignItems="center">
                      <Checkboxes.Checkbox>
                        <Checkboxes.Checkbox.Indicator />
                      </Checkboxes.Checkbox>
                      <Paragraph>{label}</Paragraph>
                    </XStack>
                  )}
                </Checkboxes.FocusGroup.Item>
              </Checkboxes.Group.Item>
            ))}
          </Checkboxes.Group>
        </Checkboxes.FocusGroup>
      </Checkboxes>
      <Paragraph size="$2">
        Selected:{' '}
        {Object.entries(values)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ') || 'none'}
      </Paragraph>
    </YStack>
  );
}

export const CardMode: Story = {
  render: () => <CompoundExample card />,
};

export const PlainMode: Story = {
  render: () => <CompoundExample card={false} />,
};

/**
 * Side-by-side comparison of the compound `Checkboxes` API and the
 * options-driven `CheckboxGroup` API with equivalent data, for verifying
 * their knob/state behaviour stays aligned.
 */
export const ComparisonWithCheckboxGroup: Story = {
  render: () => {
    const Example = () => {
      const [compound, setCompound] = useState<Record<string, boolean>>({
        a: true,
        b: false,
        c: false,
      });
      return (
        <XStack gap="$8" alignItems="flex-start" flexWrap="wrap">
          <YStack gap="$3" width={280}>
            <Paragraph size="$2" color="$placeholderColor">
              Checkboxes (compound)
            </Paragraph>
            <Checkboxes
              values={compound}
              onValuesChange={(next) => {
                setCompound(next as typeof compound);
              }}>
              <Checkboxes.FocusGroup orientation="vertical">
                <Checkboxes.Group>
                  {(['a', 'b', 'c'] as const).map((value) => (
                    <Checkboxes.Group.Item key={value}>
                      <Checkboxes.FocusGroup.Item value={value}>
                        <XStack gap="$2" alignItems="center">
                          <Checkboxes.Checkbox>
                            <Checkboxes.Checkbox.Indicator />
                          </Checkboxes.Checkbox>
                          <Paragraph>Option {value.toUpperCase()}</Paragraph>
                        </XStack>
                      </Checkboxes.FocusGroup.Item>
                    </Checkboxes.Group.Item>
                  ))}
                </Checkboxes.Group>
              </Checkboxes.FocusGroup>
            </Checkboxes>
          </YStack>
          <YStack gap="$3" width={280}>
            <Paragraph size="$2" color="$placeholderColor">
              CheckboxGroup (options)
            </Paragraph>
            <CheckboxGroup
              label="Options"
              options={[
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
                { value: 'c', label: 'Option C' },
              ]}
              defaultValue={['a']}
            />
          </YStack>
        </XStack>
      );
    };
    return <Example />;
  },
};
