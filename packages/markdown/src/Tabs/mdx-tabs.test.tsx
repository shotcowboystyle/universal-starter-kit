/**
 * MDXTabs spec (MPO-177). Stories live in Markdown/Media; this file is the
 * colocated lock that the LC-16 wrapper still paints a real tablist.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { Text } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { MDXTab, MDXTabs } from './index';

const renderTabs = (defaultValue?: string) =>
  renderWithProviders(
    <MDXTabs
      items={['npm', 'pnpm']}
      defaultValue={defaultValue}>
      {[
        <MDXTab key="npm">
          <Text>npm panel</Text>
        </MDXTab>,
        <MDXTab key="pnpm">
          <Text>pnpm panel</Text>
        </MDXTab>,
      ]}
    </MDXTabs>,
  );

describe('MDXTabs (canonical Tabs)', () => {
  it('renders a real tablist with aria-selected tabs', () => {
    renderTabs();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('npm panel')).toBeInTheDocument();
  });

  it('switches panels on click', () => {
    renderTabs();
    fireEvent.click(screen.getByText('pnpm'));
    expect(screen.getByText('pnpm panel')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('respects defaultValue addressed by label', () => {
    renderTabs('pnpm');
    expect(screen.getByText('pnpm panel')).toBeInTheDocument();
  });

  it('handles duplicate labels via index-suffixed values', () => {
    renderWithProviders(
      <MDXTabs items={['same', 'same']}>
        {[
          <MDXTab key="a">
            <Text>first panel</Text>
          </MDXTab>,
          <MDXTab key="b">
            <Text>second panel</Text>
          </MDXTab>,
        ]}
      </MDXTabs>,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    fireEvent.click(tabs[1]);
    expect(screen.getByText('second panel')).toBeInTheDocument();
  });

  it('renders nothing dangerous for empty items', () => {
    const { container } = renderWithProviders(<MDXTabs items={[]}>{[]}</MDXTabs>);
    expect(container).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
