// Live-path toggle contract: on a real connection FrappeLikedBy must flip
// optimistically, POST the whitelisted `frappe.desk.like.toggle_like`
// method (the `_liked_by` field is not writable through the Document API),
// keep the flip on success, and revert it on failure. The frappe module is
// mocked so the POST is fully controllable.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeLikedBy } from './FrappeLikedBy';
import { FrappeProvider } from './FrappeProvider';

interface LiveDoc {
  name: string;
  doctype: string;
  _liked_by: string;
}

interface PostResponse {
  payload: { message: null };
}

const mockPost = vi.fn<(...args: unknown[]) => Promise<PostResponse>>();
const initialDocs: LiveDoc[] = [];
const liveState = { docs: initialDocs };

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the HttpClient and hook stubs are partial; the real module type rejects them in a typed factory
vi.mock('@repo/frappe', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    HttpClient: class MockHttpClient {
      // oxlint-disable-next-line eslint/class-methods-use-this -- HttpClient instance contract; auth is irrelevant to the stub
      updateAuth() {}
      // oxlint-disable-next-line eslint/class-methods-use-this -- HttpClient instance contract
      async get() {
        return { payload: { message: 'Administrator' } };
      }
      // oxlint-disable-next-line eslint/class-methods-use-this -- HttpClient instance contract; delegates to the shared mock
      async post(...args: unknown[]) {
        return await mockPost(...args);
      }
    },
    useFrappeCollection: () => ({ id: 'mock-collection' }),
    useLiveQuery: () => ({ data: liveState.docs, isLoading: false }),
    useFrappeConnection: () => ({ connected: false, everConnected: false }),
  };
});

const renderLive = () =>
  renderWithProviders(
    <FrappeProvider baseURL="https://bench.example.com">
      <FrappeLikedBy
        doctype="Task"
        name="TASK-001"
        currentUser="Administrator"
      />
    </FrappeProvider>,
  );

describe('FrappeLikedBy live toggle (toggle_like)', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- the named `use` export is unbound; i18next.use needs the instance as `this`
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    liveState.docs = [{ name: 'TASK-001', doctype: 'Task', _liked_by: JSON.stringify(['Administrator']) }];
  });

  afterEach(cleanup);

  it('flips optimistically while the POST is in flight and keeps the flip on success', async () => {
    let resolvePost!: (value: PostResponse) => void;
    mockPost.mockImplementation(
      async () =>
        // oxlint-disable-next-line promise/avoid-new -- a deferred POST the test resolves by hand mid-flight
        await new Promise<PostResponse>((resolve) => {
          resolvePost = resolve;
        }),
    );

    renderLive();
    fireEvent.click(await screen.findByLabelText('Unlike'));

    // Optimistic: unliked before the server answers (count 1 → hidden).
    await waitFor(() => {
      expect(screen.getByLabelText('Like')).toBeTruthy();
    });
    expect(screen.queryByTestId('frappe-liked-by-count')).toBeNull();

    // Whitelisted method contract: add="No" when removing the like.
    expect(mockPost).toHaveBeenCalledWith('/api/method/frappe.desk.like.toggle_like', {
      doctype: 'Task',
      name: 'TASK-001',
      add: 'No',
    });

    resolvePost({ payload: { message: null } });
    // The flip persists (no revert) and no error chrome shows.
    await waitFor(() => {
      expect(screen.getByLabelText('Like')).toBeTruthy();
    });
    expect(screen.queryByText('Failed to update like')).toBeNull();
  });

  it('POSTs add=Yes when the current user has not liked the doc', async () => {
    liveState.docs = [{ name: 'TASK-001', doctype: 'Task', _liked_by: '[]' }];
    mockPost.mockResolvedValue({ payload: { message: null } });

    renderLive();
    fireEvent.click(await screen.findByLabelText('Like'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/method/frappe.desk.like.toggle_like', {
        doctype: 'Task',
        name: 'TASK-001',
        add: 'Yes',
      });
    });
    // Optimistic add renders immediately: pressed heart + count 1.
    await waitFor(() => {
      expect(screen.getByLabelText('Unlike')).toBeTruthy();
    });
    expect(screen.getByTestId('frappe-liked-by-count').textContent).toBe('1');
  });

  it('reverts the optimistic flip and surfaces an error when the POST fails', async () => {
    mockPost.mockRejectedValue(new Error('Insufficient Permission'));

    renderLive();
    fireEvent.click(await screen.findByLabelText('Unlike'));

    // Honest revert: error chrome + the server truth restored.
    await expect(screen.findByText('Failed to update like')).resolves.toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText('Unlike')).toBeTruthy();
    });
    expect(screen.getByTestId('frappe-liked-by-count').textContent).toBe('1');
  });
});
