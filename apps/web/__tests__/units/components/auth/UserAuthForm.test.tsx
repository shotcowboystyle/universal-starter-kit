import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, vi } from 'vitest';

import UserAuthForm from '@/components/auth/UserAuthForm';
import { defaultEmail } from '@/constants/demoData';
import { useAuthForm } from '@/hooks/useAuth';

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const copy: Record<string, string> = {
      emailLabel: 'Email',
      emailPlaceholder: 'm@example.com',
      continueButton: 'Continue',
      invalidEmail: 'Invalid email address',
    };
    return copy[key] ?? key;
  }),
}));

const mockHandleSubmit = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuthForm: vi.fn(() => ({
    handleSubmit: mockHandleSubmit,
    isLoading: false,
    error: null,
    isNavigating: false,
  })),
}));

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the email field and submit button', () => {
    renderWithProviders(<UserAuthForm />);

    expect(screen.getByTestId('email-input')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Continue');
  });

  it('submits the prefilled demo email', async () => {
    renderWithProviders(<UserAuthForm />);

    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(mockHandleSubmit).toHaveBeenCalledWith(defaultEmail);
    });
  });

  it('does not submit an invalid email', async () => {
    renderWithProviders(<UserAuthForm />);

    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
    expect(mockHandleSubmit).not.toHaveBeenCalled();
  });

  it('maps the backend error to a localized message', () => {
    vi.mocked(useAuthForm).mockReturnValueOnce({
      handleSubmit: mockHandleSubmit,
      isLoading: false,
      error: 'The login email is incorrect',
      isNavigating: false,
    });

    renderWithProviders(<UserAuthForm />);

    expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid email address');
  });

  it('shows other backend errors verbatim', () => {
    vi.mocked(useAuthForm).mockReturnValueOnce({
      handleSubmit: mockHandleSubmit,
      isLoading: false,
      error: 'Login failed',
      isNavigating: false,
    });

    renderWithProviders(<UserAuthForm />);

    expect(screen.getByTestId('error-message')).toHaveTextContent('Login failed');
  });

  it('disables the field and button while loading or navigating', () => {
    vi.mocked(useAuthForm).mockReturnValueOnce({
      handleSubmit: mockHandleSubmit,
      isLoading: true,
      error: null,
      isNavigating: true,
    });

    renderWithProviders(<UserAuthForm />);

    expect(screen.getByTestId('email-input')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveAttribute('aria-disabled', 'true');
  });
});
