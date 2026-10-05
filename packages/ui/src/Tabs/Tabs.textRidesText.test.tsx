/**
 * TEXT-RIDES-TEXT (catalog arm): Tabs labels ride TabLabel (Text).
 * Array-of-string labels coalesce so `{label}{cond ? suffix : ""}` renders
 * the concatenated name instead of tripping the native "Text strings must
 * be rendered within a <Text> component" invariant.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Tabs } from './index';

describe('Tabs TEXT-RIDES-TEXT', () => {
  it('renders array-of-strings labels as one concatenated tab name', () => {
    const count: number = 3;
    renderWithProviders(
      <Tabs
        items={[
          {
            value: 'a',
            label: ['Section one', count !== 0 ? ` (${count})` : ''],
            content: <Text>Body</Text>,
          },
        ]}
      />,
    );
    const tab = screen.getByRole('tab', { name: 'Section one (3)' });
    expect(tab).toBeInTheDocument();
    const label = screen.getByText('Section one (3)');
    expect(label.tagName).not.toBe('DIV');
  });

  it('renders a singleton string label on Text, not a layout DIV', () => {
    renderWithProviders(<Tabs items={[{ value: 'a', label: 'Only', content: <Text>Body</Text> }]} />);
    const label = screen.getByText('Only');
    expect(label.tagName).not.toBe('DIV');
  });
});
