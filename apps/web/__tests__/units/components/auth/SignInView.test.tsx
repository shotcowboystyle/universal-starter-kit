import { renderWithProviders } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import SignInView from '@/components/auth/SignInView';

// Mock next-intl's useTranslations
vi.mock(import('next-intl'), async () => {
  const { createUseTranslations } = await import('../../../helpers/key-translator');
  const signInLabels = new Map([
    ['title', 'Sign In'],
    ['description', 'Welcome Back'],
    ['formHint', 'Enter your email to sign in'],
  ]);
  const labelFor = (key: string): string => signInLabels.get(key) ?? key;
  return { useTranslations: createUseTranslations(labelFor) };
});

// Mock the UserAuthForm component
vi.mock(import('@/components/auth/UserAuthForm'), () => ({
  default: vi.fn<() => React.JSX.Element>(() => <div data-testid="user-auth-form">Mock UserAuthForm</div>),
}));

describe(SignInView, () => {
  it('should render the sign-in view with title and form', () => {
    renderWithProviders(<SignInView />);

    // Check if the title is rendered
    expect(screen.getByText('Sign In')).toBeInTheDocument();

    // Check if the UserAuthForm is rendered
    expect(screen.getByTestId('user-auth-form')).toBeInTheDocument();
  });
});
