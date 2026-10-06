import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PageContainer from '@/components/layout/PageContainer';

describe('PageContainer', () => {
  it('renders children inside a scroll area by default', () => {
    renderWithProviders(
      <PageContainer>
        <div data-testid="child-content">Child Content</div>
      </PageContainer>,
    );
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-area')).toContainElement(screen.getByTestId('child-content'));
    expect(screen.getByTestId('content-area')).toBeInTheDocument();
  });

  it('renders without a scroll area when scrollable=false', () => {
    renderWithProviders(
      <PageContainer scrollable={false}>
        <div data-testid="child-content">Test</div>
      </PageContainer>,
    );
    expect(screen.queryByTestId('scroll-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('content-area')).toContainElement(screen.getByTestId('child-content'));
  });
});
