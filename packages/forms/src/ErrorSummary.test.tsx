/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import {
  ErrorSummary,
  collectFormFieldErrors,
  formatFieldError,
  normalizeFieldError,
  warnBannedErrorWords,
} from './ErrorSummary';
import { Input } from './fields/Input';
import { Form } from './Form';
import { __resetDevWarnSeen } from './shared/devWarn';

vi.mock('@repo/router', () => ({
  useUrlState: vi.fn(() => [{}, vi.fn()]),
}));

describe('formatFieldError / normalizeFieldError', () => {
  it('formats string errors', () => {
    expect(formatFieldError('Enter a full name')).toBe('Enter a full name');
  });

  it('formats structured { problem, action }', () => {
    expect(
      formatFieldError({
        problem: 'Email is incomplete.',
        action: 'Include an @ and a domain.',
      }),
    ).toBe('Email is incomplete. Include an @ and a domain.');
  });

  it('normalizes objects and rejects empty', () => {
    expect(normalizeFieldError({ problem: 'Missing date' })).toEqual({
      problem: 'Missing date',
    });
    expect(normalizeFieldError('')).toBeUndefined();
    expect(normalizeFieldError(null)).toBeUndefined();
  });
});

describe('collectFormFieldErrors', () => {
  it('collects first error per field and skips empty', () => {
    const items = collectFormFieldErrors({
      email: { errors: ['Enter an email address'] },
      name: { errors: [] },
      phone: { errors: [{ problem: 'Phone is too short.', action: 'Use 10 digits.' }] },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'email', id: 'email' });
    expect(items[1].name).toBe('phone');
    expect(formatFieldError(items[1].error)).toContain('10 digits');
  });
});

describe('warnBannedErrorWords', () => {
  beforeEach(() => {
    __resetDevWarnSeen();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetDevWarnSeen();
  });

  it('warns in development for banned wording', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    warnBannedErrorWords('Invalid email, please try again', 'email');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('banned-error-word'));
    process.env.NODE_ENV = prev;
  });

  it('is silent for clean copy', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    warnBannedErrorWords('Enter an email address', 'email');
    expect(console.warn).not.toHaveBeenCalled();
    process.env.NODE_ENV = prev;
  });
});

describe('ErrorSummary', () => {
  it('renders role=alert with title and linked errors', () => {
    const result = renderWithProviders(
      <ErrorSummary
        errors={[
          { name: 'name', id: 'name', error: 'Enter a full name' },
          {
            name: 'email',
            id: 'email',
            error: { problem: 'Email is incomplete.', action: 'Include an @.' },
          },
        ]}
      />,
    );

    const summary = result.container.querySelector('[data-testid="error-summary"]');
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(summary?.textContent).toContain('There is a problem');
    expect(summary?.textContent).toContain('Enter a full name');
    expect(summary?.textContent).toContain('Email is incomplete.');

    const links = result.container.querySelectorAll("a[href='#name'], a[href='#email']");
    expect(links.length).toBe(2);
  });

  it('focuses the summary on appear', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    renderWithProviders(<ErrorSummary errors={[{ name: 'name', id: 'name', error: 'Enter a full name' }]} />);
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });
    focusSpy.mockRestore();
  });

  it('invokes onFocusField when a link is activated', () => {
    const onFocusField = vi.fn();
    const result = renderWithProviders(
      <form>
        <ErrorSummary
          errors={[{ name: 'name', id: 'name', error: 'Enter a full name' }]}
          onFocusField={onFocusField}
          disableAutoFocus
        />
        <input id="name" />
      </form>,
    );
    const link = result.container.querySelector("a[href='#name']");
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(onFocusField).toHaveBeenCalledWith(expect.objectContaining({ name: 'name', id: 'name' }));
  });
});

describe('Form + ErrorSummary integration', () => {
  it('shows ErrorSummary after failed submit and hides when showErrorSummary=false', async () => {
    const onSubmit = vi.fn();
    const result = renderWithProviders(
      <Form
        formOptions={{
          defaultValues: { username: '', email: '' },
        }}
        onSubmit={onSubmit}>
        <Input id="username" name="username" label="Username" required />
        <Input id="email" name="email" label="Email" required />
        <Button action="submit" testID="submit-button">
          Submit
        </Button>
      </Form>,
    );

    expect(result.container.querySelector('[data-testid="error-summary"]')).toBeNull();

    const button = result.container.querySelector('[data-testid="submit-button"]');
    await act(async () => {
      if (button) {
        fireEvent.click(button);
      }
    });

    await waitFor(() => {
      const summary = result.container.querySelector('[data-testid="error-summary"]');
      expect(summary).toBeTruthy();
      expect(summary?.getAttribute('role')).toBe('alert');
      expect(summary?.textContent).toMatch(/required/i);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not render ErrorSummary when showErrorSummary is false', async () => {
    const result = renderWithProviders(
      <Form showErrorSummary={false} formOptions={{ defaultValues: { username: '' } }} onSubmit={vi.fn()}>
        <Input id="username" name="username" label="Username" required />
        <Button action="submit" testID="submit-button">
          Submit
        </Button>
      </Form>,
    );

    const button = result.container.querySelector('[data-testid="submit-button"]');
    await act(async () => {
      if (button) {
        fireEvent.click(button);
      }
    });

    await waitFor(() => {
      // Inline field error still appears; summary does not.
      expect(result.container.textContent).toMatch(/required/i);
    });
    expect(result.container.querySelector('[data-testid="error-summary"]')).toBeNull();
  });
});
