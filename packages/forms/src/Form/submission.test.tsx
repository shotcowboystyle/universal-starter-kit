// @vitest-environment jsdom
import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { Form, useFormContext } from './index';

const refusal = 'The record changed. Refresh and retry.';

describe('shared form submission outcome', () => {
  it.each(['html', 'action', 'save', 'shortcut'] as const)(
    '%s submission exposes failure, retains edits and can retry without changing its success policy',
    async (route) => {
      const submit = vi.fn().mockRejectedValueOnce(new Error(refusal)).mockResolvedValue(undefined);
      const saved = vi.fn();
      let isDirty = () => false;
      function DirtyProbe() {
        const form = useFormContext();
        isDirty = () => form.state.isDirty;
        return null;
      }
      const view = renderWithProviders(
        <Form
          formOptions={{ defaultValues: { name: 'Original' } }}
          onSubmit={submit}
          saveBar={{ forceVisible: true, onSaved: saved }}>
          <DirtyProbe />
          <Input name="name" label="Name" />
          <button type="submit">Submit HTML</button>
          <Button action="submit">Submit action</Button>
        </Form>,
      );
      fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Edited' } });
      const activate = () => {
        if (route === 'shortcut') {
          fireEvent.keyDown(document, { key: 's', ctrlKey: true });
        } else {
          fireEvent.click(
            view.getByRole('button', {
              name: route === 'html' ? 'Submit HTML' : route === 'action' ? 'Submit action' : 'Save',
            }),
          );
        }
      };
      await act(async () => {
        activate();
      });
      await waitFor(() => {
        expect(view.getByText(/Couldn't save/).textContent).toContain(refusal);
      });
      expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Edited');
      expect(submit).toHaveBeenCalledTimes(1);
      expect(saved).not.toHaveBeenCalled();
      await act(async () => {
        activate();
      });
      await waitFor(() => {
        expect(submit).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(view.queryByText(/Couldn't save/)).toBeNull();
      });
      expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Edited');
      expect(saved).toHaveBeenCalledTimes(route === 'save' || route === 'shortcut' ? 1 : 0);
      expect(isDirty()).toBe(route === 'html' || route === 'action');
    },
  );

  it('allows only one transport call when HTML, action and Save activate together', async () => {
    let finish!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const saved = vi.fn();
    const view = renderWithProviders(
      <Form onSubmit={submit} saveBar={{ forceVisible: true, onSaved: saved }}>
        <button type="submit">Submit HTML</button>
        <Button action="submit">Submit action</Button>
      </Form>,
    );
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Submit HTML' }));
      fireEvent.click(view.getByRole('button', { name: 'Submit action' }));
      fireEvent.click(view.getByRole('button', { name: 'Save' }));
      fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    });
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      finish();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });

  it('routes explicit form targets and standalone actions to the matching form only', async () => {
    const firstSubmit = vi.fn();
    const secondSubmit = vi.fn().mockRejectedValue(new Error(refusal));
    function Harness() {
      const first = useForm({
        defaultValues: { name: 'First' } as Record<string, unknown>,
        onSubmit: firstSubmit,
      });
      const second = useForm({
        defaultValues: { name: 'Second' } as Record<string, unknown>,
        onSubmit: secondSubmit,
      });
      return (
        <>
          <Form form={first} saveBar={{ forceVisible: true }} testID="first">
            <Button action="submit" form={second}>
              Target second
            </Button>
          </Form>
          <Form form={second} saveBar={{ forceVisible: true }} testID="second">
            <Input name="name" label="Second name" />
          </Form>
          <Button action="submit" form={second}>
            Standalone submit
          </Button>
        </>
      );
    }
    const view = renderWithProviders(<Harness />);
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Target second' })));
    await waitFor(() => {
      expect(within(view.getByTestId('second')).getByText(/Couldn't save/)).toBeTruthy();
    });
    expect(within(view.getByTestId('first')).queryByText(/Couldn't save/)).toBeNull();
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Standalone submit' })));
    await waitFor(() => {
      expect(secondSubmit).toHaveBeenCalledTimes(2);
    });
    expect(firstSubmit).not.toHaveBeenCalled();
  });

  it('does not mark a form-level validation refusal saved', async () => {
    const submit = vi.fn();
    const saved = vi.fn();
    const view = renderWithProviders(
      <Form
        formOptions={{
          defaultValues: { name: 'Original' },
          validators: { onSubmit: () => 'Review the form' },
        }}
        onSubmit={submit}
        saveBar={{ forceVisible: true, onSaved: saved }}>
        <Input name="name" label="Name" />
      </Form>,
    );
    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Edited' } });
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Save' })));
    expect(submit).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Edited');
  });
});
