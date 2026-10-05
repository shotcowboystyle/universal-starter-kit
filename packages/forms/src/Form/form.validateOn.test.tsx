import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { Form, useEffectiveValidateOn } from './index';

describe('Form validateOn remapping', () => {
  it('stays on submit before the first attempt', () => {
    let effective: string | undefined;
    function Probe() {
      effective = useEffectiveValidateOn();
      return null;
    }
    renderWithProviders(
      <Form validateOn="submit" onSubmit={vi.fn()}>
        <Probe />
      </Form>,
    );
    expect(effective).toBe('submit');
  });

  it('upgrades to blur-then-change after a failed submit', async () => {
    let effective = 'submit';
    function Probe() {
      effective = useEffectiveValidateOn();
      return null;
    }
    const result = renderWithProviders(
      <Form formOptions={{ defaultValues: { name: '' } }} onSubmit={vi.fn()} validateOn="submit">
        <Probe />
        <Input id="name" name="name" label="Name" required />
        <Button action="submit" testID="submit-button">
          Submit
        </Button>
      </Form>,
    );

    expect(effective).toBe('submit');

    const button = result.container.querySelector('[data-testid="submit-button"]');
    await act(async () => {
      if (button) {
        fireEvent.click(button);
      }
    });

    await waitFor(() => {
      expect(result.container.querySelector('[data-testid="error-summary"]')).toBeTruthy();
      expect(effective).toBe('blur-then-change');
    });
  });

  it('honors explicit validateOn=blur without waiting for submit', () => {
    let effective: string | undefined;
    function Probe() {
      effective = useEffectiveValidateOn();
      return null;
    }
    renderWithProviders(
      <Form validateOn="blur" onSubmit={vi.fn()}>
        <Probe />
      </Form>,
    );
    expect(effective).toBe('blur');
  });
});
