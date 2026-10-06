// @vitest-environment jsdom
/**
 * Every way into a form's submission shares one guarded execution and
 * one outcome. The routes are a native submit button, implicit Enter in the
 * only field, Button action=submit, the save bar's Save, and Ctrl-S / Cmd-S.
 */
import { renderWithProviders } from '@repo/test-utils';
import type { AnyFormApi } from '@tanstack/react-form';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import type { ContextualSaveBarProps } from '../ContextualSaveBar';
import { SubmissionPaths } from '../ContextualSaveBar/ContextualSaveBar.stories';
import { Input } from '../fields/Input';

import { Form, useFormContext } from './index';

const routes = ['html', 'enter', 'action', 'save', 'ctrl-s', 'cmd-s'] as const;
type Route = (typeof routes)[number];
const saveBarRoutes = new Set<Route>(['save', 'ctrl-s', 'cmd-s']);

type Values = Record<string, string>;
type SavedHandler = NonNullable<ContextualSaveBarProps['onSaved']>;

const probe = new Map<'form', AnyFormApi>();

const formState = () => ({
  isDirty: probe.get('form')?.state.isDirty ?? false,
  submissionAttempts: probe.get('form')?.state.submissionAttempts ?? 0,
});

const StateProbe = () => {
  const form = useFormContext();
  useEffect(() => {
    probe.set('form', form);
  }, [form]);
  return null;
};

const PathForm = ({
  route,
  onSubmit,
  onSaved,
  defaultName = 'Original',
  required = false,
}: {
  route: Route;
  onSubmit: (values: Values) => void | Promise<void>;
  onSaved?: SavedHandler;
  defaultName?: string;
  required?: boolean;
}) => (
  <Form
    formOptions={{ defaultValues: { name: defaultName } }}
    onSubmit={onSubmit}
    saveBar={{ forceVisible: true, onSaved }}>
    <StateProbe />
    <Input
      name="name"
      label="Name"
      required={required}
    />
    {route === 'html' ? <button type="submit">Submit HTML</button> : null}
    <Button action="submit">Submit action</Button>
  </Form>
);

type View = ReturnType<typeof renderWithProviders>;

const nameInput = (view: View) => view.getByLabelText(/^Name/u) as HTMLInputElement;

const activate = async (route: Route, view: View) => {
  switch (route) {
    case 'html': {
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit HTML' })));
      break;
    }
    case 'enter': {
      const user = userEvent.setup();
      await user.type(nameInput(view), '{Enter}');
      break;
    }
    case 'action': {
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit action' })));
      break;
    }
    case 'save': {
      await act(async () => fireEvent.click(view.getByRole('button', { name: 'Save' })));
      break;
    }
    case 'ctrl-s': {
      await act(async () => fireEvent.keyDown(document, { key: 's', ctrlKey: true }));
      break;
    }
    case 'cmd-s': {
      await act(async () => fireEvent.keyDown(document, { key: 's', metaKey: true }));
      break;
    }
    default: {
      break;
    }
  }
};

describe('every submission path shares one outcome', () => {
  afterEach(cleanup);

  it.each(routes)('%s: a retry clears the failure while it runs, and a failed retry shows its own', async (route) => {
    const retry = Promise.withResolvers<never>();
    const submit = vi
      .fn<(values: Values) => Promise<void>>()
      .mockRejectedValueOnce(new Error('First refusal.'))
      .mockImplementationOnce(async () => await retry.promise);
    const saved = vi.fn<SavedHandler>();
    const view = renderWithProviders(
      <PathForm
        route={route}
        onSubmit={submit}
        onSaved={saved}
      />,
    );
    fireEvent.change(nameInput(view), { target: { value: 'Edited' } });

    await activate(route, view);
    await waitFor(() => {
      expect(view.getByText(/Couldn't save/u).textContent).toContain('First refusal.');
    });
    expect(submit).toHaveBeenCalledOnce();

    await activate(route, view);
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(view.queryByText(/First refusal/u)).toBeNull();
    });

    await act(async () => {
      retry.reject(new Error('Second refusal.'));
    });
    await waitFor(() => {
      expect(view.getByText(/Couldn't save/u).textContent).toContain('Second refusal.');
    });
    expect(view.queryByText(/First refusal/u)).toBeNull();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(nameInput(view).value).toBe('Edited');
    expect(saved).not.toHaveBeenCalled();
  });

  it.each(routes)(
    '%s: a validation refusal keeps the field error, the summary and the attempt count',
    async (route) => {
      const submit = vi.fn<(values: Values) => void>();
      const saved = vi.fn<SavedHandler>();
      const view = renderWithProviders(
        <PathForm
          route={route}
          onSubmit={submit}
          onSaved={saved}
          defaultName=""
          required
        />,
      );

      await activate(route, view);
      await waitFor(() => {
        expect(view.container.querySelector('[data-testid="error-summary"]')?.textContent).toMatch(/Name is required/u);
      });
      expect(nameInput(view).getAttribute('aria-invalid')).toBe('true');
      expect(formState().submissionAttempts).toBe(1);
      expect(submit).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
      expect(view.queryByText(/Couldn't save/u)).toBeNull();
    },
  );

  it.each(routes)("%s: a success calls the handler once and keeps its path's success policy", async (route) => {
    const submit = vi.fn<(values: Values) => Promise<void>>().mockResolvedValue();
    const saved = vi.fn<SavedHandler>();
    const view = renderWithProviders(
      <PathForm
        route={route}
        onSubmit={submit}
        onSaved={saved}
      />,
    );
    fireEvent.change(nameInput(view), { target: { value: 'Edited' } });

    await activate(route, view);
    await waitFor(() => {
      expect(submit).toHaveBeenCalledOnce();
    });
    const viaSaveBar = saveBarRoutes.has(route);
    await waitFor(() => {
      expect(saved).toHaveBeenCalledTimes(viaSaveBar ? 1 : 0);
    });
    expect(formState().isDirty).toBe(!viaSaveBar);
    expect(nameInput(view).value).toBe('Edited');
    expect(view.queryByText(/Couldn't save/u)).toBeNull();
    expect(submit).toHaveBeenCalledOnce();
  });
});

const mountStory = () => {
  const story = SubmissionPaths as { render?: () => ReactElement };
  if (!story.render) {
    throw new Error('SubmissionPaths has no render');
  }
  return renderWithProviders(story.render());
};

const calls = (view: View) => view.getByTestId('submit-calls').textContent;

describe('the SubmissionPaths story counts onSubmit calls', () => {
  afterEach(cleanup);

  it('adds exactly one call per activation on every path and shows the same refusal', async () => {
    const view = mountStory();
    expect(calls(view)).toBe('onSubmit calls: 0');
    const user = userEvent.setup();

    const paths: (() => Promise<void>)[] = [
      async () => {
        await user.type(view.getByLabelText('Service name'), '{Enter}');
      },
      async () => {
        await act(async () => fireEvent.click(view.getByRole('button', { name: 'Submit' })));
      },
      async () => {
        await act(async () => fireEvent.click(view.getByRole('button', { name: 'Save' })));
      },
      async () => {
        await act(async () => fireEvent.keyDown(document, { key: 's', ctrlKey: true }));
      },
      async () => {
        await act(async () => fireEvent.keyDown(document, { key: 's', metaKey: true }));
      },
    ];

    // Each activation builds on the state the previous one left behind, so they run strictly in order.
    const runInOrder = async (index: number): Promise<void> => {
      const run = paths.at(index);
      if (run === undefined) {
        return;
      }
      await run();
      const expected = index + 1;
      await waitFor(() => {
        expect(calls(view)).toBe(`onSubmit calls: ${expected}`);
      });
      await waitFor(() => {
        expect(view.getByText(/Couldn't save/u).textContent).toContain('The record changed. Refresh and retry.');
      });
      await runInOrder(index + 1);
    };
    await runInOrder(0);
    expect((view.getByLabelText('Service name') as HTMLInputElement).value).toBe('service-example');
  });
});
