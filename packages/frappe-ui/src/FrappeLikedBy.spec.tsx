// FrappeLikedBy contract: likes live in the `_liked_by` JSON field. These
// specs cover the pure parsing/toggle helpers and the fixture-backed
// component states (count + liked state, zero-likes, optimistic toggle with
// rollback when the write is rejected).
import { InMemoryFixtureProvider } from '@repo/frappe';
import type { FixtureData } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrappeLikedBy, parseLikedBy, toggleLikedBy } from './FrappeLikedBy';
import { FrappeProvider } from './FrappeProvider';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// parseLikedBy — wire-format tolerance
// ---------------------------------------------------------------------------

describe(parseLikedBy, () => {
  it('parses the JSON string wire format', () => {
    expect(parseLikedBy('["a@x.com", "b@x.com"]')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('passes through an already-parsed array', () => {
    expect(parseLikedBy(['a@x.com'])).toEqual(['a@x.com']);
  });

  it('returns [] for null, undefined, and empty strings', () => {
    expect(parseLikedBy(null)).toEqual([]);
    expect(parseLikedBy()).toEqual([]);
    expect(parseLikedBy('')).toEqual([]);
    expect(parseLikedBy('  ')).toEqual([]);
  });

  it('returns [] for malformed JSON and non-array JSON', () => {
    expect(parseLikedBy('not-json')).toEqual([]);
    expect(parseLikedBy('"a@x.com"')).toEqual([]);
    expect(parseLikedBy('{}')).toEqual([]);
  });

  it('filters non-string and empty entries', () => {
    expect(parseLikedBy('["a@x.com", 42, null, ""]')).toEqual(['a@x.com']);
  });
});

// ---------------------------------------------------------------------------
// toggleLikedBy — toggle math
// ---------------------------------------------------------------------------

describe(toggleLikedBy, () => {
  it('appends an absent user (add=true)', () => {
    expect(toggleLikedBy(['a@x.com'], 'b@x.com')).toEqual({
      next: ['a@x.com', 'b@x.com'],
      add: true,
    });
  });

  it('removes a present user (add=false)', () => {
    expect(toggleLikedBy(['a@x.com', 'b@x.com'], 'a@x.com')).toEqual({
      next: ['b@x.com'],
      add: false,
    });
  });

  it('does not mutate the input list', () => {
    const input = ['a@x.com'];
    toggleLikedBy(input, 'b@x.com');
    expect(input).toEqual(['a@x.com']);
  });
});

// ---------------------------------------------------------------------------
// Component render states (fixture-backed)
// ---------------------------------------------------------------------------

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Task: [
      {
        name: 'TASK-001',
        doctype: 'Task',
        _liked_by: JSON.stringify(['Administrator', 'jane@example.com']),
      },
      { name: 'TASK-EMPTY', doctype: 'Task', _liked_by: '[]' },
    ],
    User: [
      { name: 'Administrator', doctype: 'User', full_name: 'Administrator' },
      { name: 'jane@example.com', doctype: 'User', full_name: 'Jane Doe' },
    ],
  });

/** Fixture provider whose writes are rejected — exercises optimistic rollback. */
class RejectingFixtureProvider extends InMemoryFixtureProvider {
  constructor(data: FixtureData) {
    super(data);
  }
  async updateDoc(): Promise<never> {
    throw new Error('write rejected');
  }
}

describe(FrappeLikedBy, () => {
  it('renders the like count and pressed heart for a user who liked the doc', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeLikedBy
          doctype="Task"
          name="TASK-001"
          currentUser="Administrator"
        />
      </FrappeProvider>,
    );
    expect((await screen.findByTestId('frappe-liked-by-count')).textContent).toBe('2');
    expect(screen.getByLabelText('Unlike')).toBeTruthy();
  });

  it('renders an unpressed heart for a user who has not liked the doc', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeLikedBy
          doctype="Task"
          name="TASK-001"
          currentUser="someone-else@example.com"
        />
      </FrappeProvider>,
    );
    await screen.findByTestId('frappe-liked-by-count');
    expect(screen.getByLabelText('Like')).toBeTruthy();
  });

  it('shows no count for a doc with zero likes (heart only)', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeLikedBy
          doctype="Task"
          name="TASK-EMPTY"
          currentUser="Administrator"
        />
      </FrappeProvider>,
    );
    await expect(screen.findByLabelText('Like')).resolves.toBeTruthy();
    expect(screen.queryByTestId('frappe-liked-by-count')).toBeNull();
  });

  it('toggles a like optimistically and persists it to the store', async () => {
    const fixtures = makeFixtures();
    const onToggle = vi.fn();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={fixtures}>
        <FrappeLikedBy
          doctype="Task"
          name="TASK-001"
          currentUser="Administrator"
          onToggle={onToggle}
        />
      </FrappeProvider>,
    );
    fireEvent.click(await screen.findByLabelText('Unlike'));
    await waitFor(() => {
      expect(screen.getByTestId('frappe-liked-by-count').textContent).toBe('1');
    });
    await waitFor(() => {
      const stored = fixtures.getData().Task.find((t) => t.name === 'TASK-001');
      expect(parseLikedBy(stored?._liked_by)).toEqual(['jane@example.com']);
    });
    expect(onToggle).toHaveBeenCalledWith(false, ['jane@example.com']);
    expect(screen.getByLabelText('Like')).toBeTruthy();
  });

  it('reverts the optimistic flip and surfaces an error when the write is rejected', async () => {
    const fixtures = new RejectingFixtureProvider({
      Task: [
        {
          name: 'TASK-001',
          doctype: 'Task',
          _liked_by: JSON.stringify(['Administrator', 'jane@example.com']),
        },
      ],
      User: [],
    });
    const onToggle = vi.fn();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={fixtures}>
        <FrappeLikedBy
          doctype="Task"
          name="TASK-001"
          currentUser="Administrator"
          onToggle={onToggle}
        />
      </FrappeProvider>,
    );
    fireEvent.click(await screen.findByLabelText('Unlike'));
    // Honest revert: error chrome appears and the server truth is restored.
    await expect(screen.findByText('Failed to update like')).resolves.toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('frappe-liked-by-count').textContent).toBe('2');
    });
    expect(screen.getByLabelText('Unlike')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders without crashing when no FrappeProvider is present', () => {
    renderWithProviders(
      <FrappeLikedBy
        doctype="Task"
        name="TASK-001"
      />,
    );
    expect(screen.getByTestId('frappe-liked-by')).toBeTruthy();
  });
});
