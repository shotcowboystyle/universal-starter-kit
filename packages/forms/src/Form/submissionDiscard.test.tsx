import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { Form } from './index';

const refusal = 'The record changed. Refresh and retry.';

it('keeps a refusal while editing, then clears it on discard or reset', async () => {
  const view = renderWithProviders(
    <Form
      formOptions={{ defaultValues: { name: 'Original' } }}
      onSubmit={async () => {
        throw new Error(refusal);
      }}
      saveBar={{ forceVisible: true }}>
      <Input name="name" label="Name" />
      <Button action="submit">Submit action</Button>
      <Button action="reset">Reset form</Button>
    </Form>,
  );
  fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Edited' } });
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit action' })));
  await waitFor(() => {
    expect(view.getByText(/Couldn't save/)).toBeTruthy();
  });
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Discard' })));
  const keep = await view.findByRole('button', { name: 'Keep editing' });
  await act(async () => fireEvent.click(keep));
  expect(view.getByText(/Couldn't save/)).toBeTruthy();
  expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Edited');
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Discard' })));
  const confirm = await view.findByRole('button', { name: 'Discard changes' });
  await act(async () => fireEvent.click(confirm));
  await waitFor(() => {
    expect(view.queryByText(/Couldn't save/)).toBeNull();
  });
  expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Original');
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit action' })));
  await waitFor(() => {
    expect(view.getByText(/Couldn't save/)).toBeTruthy();
  });
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'Reset form' })));
  await waitFor(() => {
    expect(view.queryByText(/Couldn't save/)).toBeNull();
  });
});
