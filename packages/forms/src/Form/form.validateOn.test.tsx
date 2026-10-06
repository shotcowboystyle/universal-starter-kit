import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { Form, useEffectiveValidateOn } from './index';

const Probe = () => <span data-testid="effective-validate-on">{useEffectiveValidateOn()}</span>;

describe('Form validateOn remapping', () => {
  it('stays on submit before the first attempt', () => {
    const view = renderWithProviders(
      <Form
        validateOn="submit"
        onSubmit={vi.fn<() => void>()}>
        <Probe />
      </Form>,
    );
    expect(view.getByTestId('effective-validate-on').textContent).toBe('submit');
  });

  it('upgrades to blur-then-change after a failed submit', async () => {
    const result = renderWithProviders(
      <Form
        formOptions={{ defaultValues: { name: '' } }}
        onSubmit={vi.fn<(values: { name: string }) => void>()}
        validateOn="submit">
        <Probe />
        <Input
          id="name"
          name="name"
          label="Name"
          required
        />
        <Button
          action="submit"
          testID="submit-button">
          Submit
        </Button>
      </Form>,
    );

    expect(result.getByTestId('effective-validate-on').textContent).toBe('submit');

    const button = result.container.querySelector('[data-testid="submit-button"]');
    await act(async () => {
      if (button) {
        fireEvent.click(button);
      }
    });

    await waitFor(() => {
      expect(result.container.querySelector('[data-testid="error-summary"]')).toBeTruthy();
      expect(result.getByTestId('effective-validate-on').textContent).toBe('blur-then-change');
    });
  });

  it('honors explicit validateOn=blur without waiting for submit', () => {
    const view = renderWithProviders(
      <Form
        validateOn="blur"
        onSubmit={vi.fn<() => void>()}>
        <Probe />
      </Form>,
    );
    expect(view.getByTestId('effective-validate-on').textContent).toBe('blur');
  });
});
