import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

describe('simple page navigation', () => {
  it('keeps page context without a numbered window and navigates once', () => {
    const change = vi.fn();
    renderWithProviders(<Pagination variant="simple" total={100} page={50} onPageChange={change} />);
    expect(screen.getByText(/50.*100/)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Go to next page'));
    expect(change).toHaveBeenCalledExactlyOnceWith(51);
  });
  it('disables backward navigation on the first page and forward on the last', () => {
    const { rerender } = renderWithProviders(<Pagination variant="simple" total={3} page={1} />);
    expect(screen.getByLabelText('Go to previous page')).toHaveAttribute('aria-disabled', 'true');
    rerender(<Pagination variant="simple" total={3} page={3} />);
    expect(screen.getByLabelText('Go to next page')).toHaveAttribute('aria-disabled', 'true');
  });
});
