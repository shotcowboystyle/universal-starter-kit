/**
 * Doc building-block specs — the MDX-facing blocks docs compose directly:
 * `MDXAside` (cutoff + "Show more" expansion) and `MDXNote` (Alert-based
 * note box). Video anatomy lives in Video/Video.test.tsx (MPO-177).
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { MDXAside, MDXNote } from './Aside';

describe(MDXAside, () => {
  it('renders string content as a plain aside without a cutoff', () => {
    const { container } = renderWithProviders(<MDXAside>just a note</MDXAside>);
    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.textContent).toContain('just a note');
    expect(screen.queryByText('Show more')).toBeNull();
  });

  it('cuts off unmeasured element content and expands on Show more', () => {
    renderWithProviders(
      <MDXAside>
        <Text>long embedded content</Text>
      </MDXAside>,
    );
    // Content is still rendered inside the clipped container...
    expect(screen.getByText('long embedded content')).toBeTruthy();
    // ...with the expansion affordance visible.
    const showMore = screen.getByText('Show more');
    expect(showMore).toBeTruthy();
    fireEvent.click(showMore);
    expect(screen.queryByText('Show more')).toBeNull();
    expect(screen.getByText('long embedded content')).toBeTruthy();
  });
});

describe(MDXNote, () => {
  it('renders note content inside an aside', () => {
    const { container } = renderWithProviders(<MDXNote>remember this</MDXNote>);
    expect(container.querySelector('aside')).toBeTruthy();
    expect(container.textContent).toContain('remember this');
  });
});
