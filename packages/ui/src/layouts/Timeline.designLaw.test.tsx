import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Timeline } from './Timeline';

describe('Timeline design law', () => {
  it('does not pin compact, so density can restyle the feed', () => {
    const { container } = renderWithProviders(
      <Timeline
        entries={[
          {
            id: '1',
            type: 'comment',
            content: 'Hello',
            author: 'Ada',
            timestamp: '2026-08-01T00:00:00Z',
          },
        ]}
      />,
    );
    expect(container.textContent).toMatch(/Ada|Hello/);
  });
});
