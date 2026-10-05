import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { H1 } from 'tamagui';
import { expect, vitest } from 'vitest';

import { ErrorBoundary } from './index';
import * as ErrorBoundaryModule from './index';

const ChildThatThrows = () => {
  throw new Error('Test Error');
};
const ChildThatRenders = () => {
  return <H1>Hello from child!</H1>;
};

function weightClasses(el: Element): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => c.startsWith('_fow-'))
    .sort();
}

describe('ErrorBoundary', () => {
  it('should render children when no error occurs', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ChildThatRenders />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello from child!')).toBeInTheDocument();
  });

  it('should show error message and retry button when an error occurs', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ChildThatThrows />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Oops, there is an error!')).toBeInTheDocument();
    expect(screen.getByText('Try again?')).toBeInTheDocument();
    expect(document.querySelector('[data-error-boundary]')).toBeTruthy();
    expect(document.querySelector('[data-empty-intent="error"]')).toBeTruthy();
  });

  it('Retry label TEXT NODE is weight 400, never 500/600', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ChildThatThrows />
      </ErrorBoundary>,
    );
    const node = screen.getByText('Try again?');
    expect(node.tagName).not.toBe('BUTTON');
    expect(node.className).toMatch(/_fow-400\b/);
    expect(node.className).not.toMatch(/_fow-500\b/);
    expect(node.className).not.toMatch(/_fow-600\b/);
    expect(weightClasses(node).some((c) => c.includes('400'))).toBe(true);
  });

  it('should reset error state and re-render children when retry button is clicked', async () => {
    renderWithProviders(
      <ErrorBoundary>
        <ChildThatThrows />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Oops, there is an error!')).toBeInTheDocument();
    expect(screen.getByText('Try again?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try again?'));
  });

  it('should log errors when componentDidCatch is triggered', () => {
    const spy = vitest.spyOn(console, 'info');
    renderWithProviders(
      <ErrorBoundary>
        <ChildThatThrows />
      </ErrorBoundary>,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        errorInfo: expect.any(Object),
      }),
    );
    spy.mockRestore();
  });

  it('exposes named ErrorBoundary export and no default', () => {
    expect(ErrorBoundaryModule.ErrorBoundary).toBe(ErrorBoundary);
    expect('default' in ErrorBoundaryModule).toBe(false);
  });
});
