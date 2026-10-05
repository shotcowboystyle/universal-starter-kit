// @vitest-environment jsdom
/**
 * Every way into a form's submission shares one guarded execution and
 * one outcome. The routes are a native submit button, implicit Enter in the
 * only field, Button action=submit, the save bar's Save, and Ctrl-S / Cmd-S.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import * as saveBarStories from '../ContextualSaveBar/ContextualSaveBar.stories';
import { Input } from '../fields/Input';

import { Form, useFormContext } from './index';

afterEach(cleanup);

const routes = ['html', 'enter', 'action', 'save', 'ctrl-s', 'cmd-s'] as const;
type Route = (typeof routes)[number];
const saveBarRoutes: readonly Route[] = ['save', 'ctrl-s', 'cmd-s'];

let formState = () => ({ isDirty: false, submissionAttempts: 0 });

function StateProbe() {
  const form = useFormContext();
  formState = () => ({
    isDirty: form.state.isDirty,
    submissionAttempts: form.state.submissionAttempts,
  });
  return null;
}

function PathForm({
  route,
  onSubmit,
  onSaved,
  defaultName = 'Original',
  required = false,
}: {
  route: Route;
  onSubmit: (values: Record<string, unknown>) => unknown;
  onSaved?: (values: Record<string, unknown>) => void;
  defaultName?: string;
  required?: boolean;
}) {
  return (
    <Form
      formOptions={{ defaultValues: { name: defaultName } }}
      onSubmit={onSubmit as never}
      saveBar={{ forceVisible: true, onSaved }}>
      <StateProbe />
      <Input name="name" label="Name" required={required} />
      {route === 'html' ? <button type="submit">Submit HTML</button> : null}
      <Button action="submit">Submit action</Button>
    </Form>
  );
}

type View = ReturnType<typeof renderWithProviders>;

const nameInput = (view: View) => view.getByLabelText(/^Name/) as HTMLInputElement;

async function activate(route: Route, view: View) {
  switch (route) {
    case 'html':
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit HTML' })));
      return;
    case 'enter': {
      const user = userEvent.setup();
      await user.type(nameInput(view), '{Enter}');
      return;
    }
    case 'action':
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit action' })));
      return;
    case 'save':
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Save' })));
      return;
    case 'ctrl-s':
      await act(async () => fireEvent.keyDown(document, { key: 's', ctrlKey: true }));
      return;
    case 'cmd-s':
      await act(async () => fireEvent.keyDown(document, { key: 's', metaKey: true }));
      return;
  }
}

describe('every submission path shares one outcome', () => {
  it.each(routes)('%s: a retry clears the failure while it runs, and a failed retry shows its own', async (route) => {
    let rejectRetry!: (error: Error) => void;
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('First refusal.'))
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectRetry = reject;
          }),
      );
    const saved = vi.fn();
    const view = renderWithProviders(<PathForm route={route} onSubmit={submit} onSaved={saved} />);
    fireEvent.change(nameInput(view), { target: { value: 'Edited' } });

    await activate(route, view);
    await waitFor(() => {
      expect(view.getByText(/Couldn't save/).textContent).toContain('First refusal.');
    });
    expect(submit).toHaveBeenCalledTimes(1);

    await activate(route, view);
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(view.queryByText(/First refusal/)).toBeNull();
    });

    await act(async () => {
      rejectRetry(new Error('Second refusal.'));
    });
    await waitFor(() => {
      expect(view.getByText(/Couldn't save/).textContent).toContain('Second refusal.');
    });
    expect(view.queryByText(/First refusal/)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(nameInput(view).value).toBe('Edited');
    expect(saved).not.toHaveBeenCalled();
  });

  it.each(routes)(
    '%s: a validation refusal keeps the field error, the summary and the attempt count',
    async (route) => {
      const submit = vi.fn();
      const saved = vi.fn();
      const view = renderWithProviders(
        <PathForm route={route} onSubmit={submit} onSaved={saved} defaultName="" required />,
      );

      await activate(route, view);
      await waitFor(() => {
        expect(view.container.querySelector('[data-testid="error-summary"]')?.textContent).toMatch(/Name is required/);
      });
      expect(nameInput(view).getAttribute('aria-invalid')).toBe('true');
      expect(formState().submissionAttempts).toBe(1);
      expect(submit).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
      expect(view.queryByText(/Couldn't save/)).toBeNull();
    },
  );

  it.each(routes)("%s: a success calls the handler once and keeps its path's success policy", async (route) => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const saved = vi.fn();
    const view = renderWithProviders(<PathForm route={route} onSubmit={submit} onSaved={saved} />);
    fireEvent.change(nameInput(view), { target: { value: 'Edited' } });

    await activate(route, view);
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    const viaSaveBar = saveBarRoutes.includes(route);
    await waitFor(() => {
      expect(saved).toHaveBeenCalledTimes(viaSaveBar ? 1 : 0);
    });
    expect(formState().isDirty).toBe(!viaSaveBar);
    expect(nameInput(view).value).toBe('Edited');
    expect(view.queryByText(/Couldn't save/)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('the SubmissionPaths story counts onSubmit calls', () => {
  function mountStory() {
    const story = saveBarStories.SubmissionPaths as { render?: () => ReactElement };
    if (!story.render) {
      throw new Error('SubmissionPaths has no render');
    }
    return renderWithProviders(story.render());
  }

  const calls = (view: View) => view.getByTestId('submit-calls').textContent;

  it('adds exactly one call per activation on every path and shows the same refusal', async () => {
    const view = mountStory();
    expect(calls(view)).toBe('onSubmit calls: 0');
    const user = userEvent.setup();

    const paths: Array<[string, () => Promise<unknown>]> = [
      ['enter', () => user.type(view.getByLabelText('Service name'), '{Enter}')],
      ['action', () => act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit' })))],
      ['save', () => act(async () => fireEvent.click(view.getByRole('button', { name: 'Save' })))],
      ['ctrl-s', () => act(async () => fireEvent.keyDown(document, { key: 's', ctrlKey: true }))],
      ['cmd-s', () => act(async () => fireEvent.keyDown(document, { key: 's', metaKey: true }))],
    ];

    let expected = 0;
    for (const [, run] of paths) {
      await run();
      expected += 1;
      await waitFor(() => {
        expect(calls(view)).toBe(`onSubmit calls: ${expected}`);
      });
      await waitFor(() => {
        expect(view.getByText(/Couldn't save/).textContent).toContain('The record changed. Refresh and retry.');
      });
    }
    expect((view.getByLabelText('Service name') as HTMLInputElement).value).toBe('service-example');
  });
});
