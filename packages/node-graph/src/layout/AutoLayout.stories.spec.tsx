import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi, test } from 'vitest';

import { Undo } from './AutoLayout.stories';

vi.mock(import('../native/DomOnlyStory'), () => ({ hasDomRealm: false }));
vi.mock(import('../NodeGraph'), () => ({
  NodeGraph: ({ interactionMode }: { interactionMode: string }) => (
    <div
      data-testid="canvas"
      data-mode={interactionMode}
    />
  ),
}));

afterEach(cleanup);

test('keeps useful native actions, omits the DOM-only stamp, and wires mode to the canvas', () => {
  const Story = Undo.render as ComponentType;
  renderWithProviders(<Story />);
  expect(screen.queryByRole('button', { name: 'Stamp positions' })).toBeNull();
  expect(screen.queryByText('no stamp yet')).toBeNull();
  for (const name of ['Tidy the graph', 'Undo', 'Redo']) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
  expect(screen.getByTestId('canvas').dataset.mode).toBe('pan');
  fireEvent.click(screen.getByRole('button', { name: 'Select mode' }));
  expect(screen.getByTestId('canvas').dataset.mode).toBe('select');
});
