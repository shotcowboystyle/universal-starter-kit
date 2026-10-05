/**
 * LinkCell contract specs — the field/ChildTable cell link wrapper: content
 * wraps in a Link only when linkResolver returns an href, resolver misses
 * render plain content, and a throwing resolver degrades to plain content
 * instead of crashing the cell.
 */

import { renderWithProviders as render } from '@repo/test-utils';
import { Text } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { LinkCell } from './LinkCell';

describe('LinkCell', () => {
  it('wraps children in a link when the resolver returns an href', () => {
    const { container, getByText } = render(
      <LinkCell value="CUST-001" linkResolver={(value) => `/customers/${value}` as never}>
        <Text>Acme Corp</Text>
      </LinkCell>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor!.getAttribute('href')).toBe('/customers/CUST-001');
    expect(getByText('Acme Corp')).toBeTruthy();
  });

  it('renders plain children when the resolver returns null', () => {
    const { container, getByText } = render(
      <LinkCell value="x" linkResolver={() => null}>
        <Text>No link</Text>
      </LinkCell>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(getByText('No link')).toBeTruthy();
  });

  it('passes the cell value to the resolver', () => {
    const resolver = vi.fn(() => null);
    render(
      <LinkCell value={42} linkResolver={resolver}>
        <Text>cell</Text>
      </LinkCell>,
    );
    expect(resolver).toHaveBeenCalledWith(42);
  });

  it('degrades to plain content when the resolver throws', () => {
    const { container, getByText } = render(
      <LinkCell
        value="x"
        linkResolver={() => {
          throw new Error('bad resolver');
        }}>
        <Text>Still visible</Text>
      </LinkCell>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(getByText('Still visible')).toBeTruthy();
  });
});
