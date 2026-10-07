// FrappeAssignment contract: assignments are ToDo docs pointing at the
// target document. These specs cover the pure assignee-list derivation
// (open / completed split, cancelled dropped), the optimistic-insert field
// contract (assign_to.add parity), and the honest render states (fixture
// list, empty, remove → status Cancelled).
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildAssignmentTodo, deriveAssignments, FrappeAssignment } from './FrappeAssignment';
import type { FrappeToDo } from './FrappeAssignment';
import { FrappeProvider } from './FrappeProvider';
import type { FrappeUserDoc } from './frappeUsers';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// deriveAssignments — assignee list derivation
// ---------------------------------------------------------------------------

const todo = (overrides: Partial<FrappeToDo>): FrappeToDo => ({
  name: `TODO-${Math.random().toString(36).slice(2, 8)}`,
  doctype: 'ToDo',
  reference_type: 'Task',
  reference_name: 'TASK-001',
  ...overrides,
});

describe(deriveAssignments, () => {
  it('splits open and completed assignments and drops cancelled ones', () => {
    const { open, completed } = deriveAssignments([
      todo({ name: 'A', allocated_to: 'a@x.com', status: 'Open' }),
      todo({ name: 'B', allocated_to: 'b@x.com', status: 'Closed' }),
      todo({ name: 'C', allocated_to: 'c@x.com', status: 'Cancelled' }),
    ]);
    expect(open.map((t) => t.name)).toEqual(['A']);
    expect(completed.map((t) => t.name)).toEqual(['B']);
  });

  it("treats a missing status as Open (Frappe's ToDo default)", () => {
    const { open } = deriveAssignments([todo({ name: 'A', allocated_to: 'a@x.com' })]);
    expect(open.map((t) => t.name)).toEqual(['A']);
  });

  it('orders each bucket by creation, oldest first', () => {
    const { open } = deriveAssignments([
      todo({ name: 'NEW', status: 'Open', creation: '2026-02-01 10:00:00' }),
      todo({ name: 'OLD', status: 'Open', creation: '2026-01-01 10:00:00' }),
    ]);
    expect(open.map((t) => t.name)).toEqual(['OLD', 'NEW']);
  });

  it('returns empty buckets for undefined input', () => {
    expect(deriveAssignments()).toEqual({ open: [], completed: [] });
  });
});

// ---------------------------------------------------------------------------
// buildAssignmentTodo — optimistic insert field contract (assign_to parity)
// ---------------------------------------------------------------------------

describe(buildAssignmentTodo, () => {
  it('writes the assign_to.add field contract', () => {
    const doc = buildAssignmentTodo({
      doctype: 'Task',
      name: 'TASK-001',
      user: 'jane@x.com',
      assignedBy: 'admin@x.com',
    });
    expect(doc).toMatchObject({
      doctype: 'ToDo',
      allocated_to: 'jane@x.com',
      reference_type: 'Task',
      reference_name: 'TASK-001',
      status: 'Open',
      priority: 'Medium',
      assigned_by: 'admin@x.com',
    });
    expect(doc.name).toMatch(/^new-todo-/);
    expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.description).toBe('Assignment for Task TASK-001');
  });

  it('omits assigned_by when no current user is known', () => {
    const doc = buildAssignmentTodo({ doctype: 'Task', name: 'T', user: 'jane@x.com' });
    expect('assigned_by' in doc).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAssignmentTodo — the default due date is the user's calendar day
// ---------------------------------------------------------------------------

// ToDo.date is a Frappe Date field: timezone-naive `YYYY-MM-DD`. Deriving the
// default from `toISOString()` names UTC's calendar day, which is a different
// day from the user's either side of the boundary.

function inZone<T>(timeZone: string, read: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return read();
  } finally {
    if (previous === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previous;
    }
  }
}

/**
 * Two frozen instants, each splitting the UTC day from one zone's local day.
 * The 21 hours between UTC−7 and UTC+14 are less than a day, so no single
 * instant can disagree with both extremes at once — it takes one per
 * hemisphere:
 *   05:00Z — Los Angeles is still on the previous day, so UTC-today writes
 *            *tomorrow*;
 *   11:00Z — Kiritimati is already on the next day, so UTC-today writes
 *            *yesterday*.
 */
const TODAY_MATRIX = [
  { instant: '2026-08-15T05:00:00Z', timeZone: 'UTC', localDay: '2026-08-15' },
  { instant: '2026-08-15T05:00:00Z', timeZone: 'America/Los_Angeles', localDay: '2026-08-14' },
  { instant: '2026-08-15T05:00:00Z', timeZone: 'America/New_York', localDay: '2026-08-15' },
  { instant: '2026-08-15T05:00:00Z', timeZone: 'Pacific/Kiritimati', localDay: '2026-08-15' },
  { instant: '2026-08-14T11:00:00Z', timeZone: 'UTC', localDay: '2026-08-14' },
  { instant: '2026-08-14T11:00:00Z', timeZone: 'America/Los_Angeles', localDay: '2026-08-14' },
  { instant: '2026-08-14T11:00:00Z', timeZone: 'America/New_York', localDay: '2026-08-14' },
  { instant: '2026-08-14T11:00:00Z', timeZone: 'Pacific/Kiritimati', localDay: '2026-08-15' },
] as const;

/** The formulation this fix replaced, kept as the negative control. */
const isoToday = () => new Date().toISOString().slice(0, 10);

describe('buildAssignmentTodo — the default due date', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the user's local calendar day in every timezone", () => {
    vi.useFakeTimers();
    for (const { instant, timeZone, localDay } of TODAY_MATRIX) {
      vi.setSystemTime(new Date(instant));
      const date = inZone(
        timeZone,
        () => buildAssignmentTodo({ doctype: 'Task', name: 'TASK-001', user: 'jane@x.com' }).date,
      );
      expect({ instant, timeZone, date }).toEqual({ instant, timeZone, date: localDay });
    }
  });

  it('negative control: the ISO formulation fails that expectation on both boundaries', () => {
    vi.useFakeTimers();
    const disagreements = TODAY_MATRIX.filter(({ instant, timeZone, localDay }) => {
      vi.setSystemTime(new Date(instant));
      return inZone(timeZone, isoToday) !== localDay;
    }).map(({ instant, timeZone, localDay }) => {
      vi.setSystemTime(new Date(instant));
      return { instant, timeZone, wrote: inZone(timeZone, isoToday), shouldBe: localDay };
    });
    // Naming every disagreeing row pins that the matrix above discriminates,
    // and that it is not merely restating `toISOString()` in six of its eight.
    expect(disagreements).toEqual([
      {
        instant: '2026-08-15T05:00:00Z',
        timeZone: 'America/Los_Angeles',
        wrote: '2026-08-15',
        shouldBe: '2026-08-14',
      },
      {
        instant: '2026-08-14T11:00:00Z',
        timeZone: 'Pacific/Kiritimati',
        wrote: '2026-08-14',
        shouldBe: '2026-08-15',
      },
    ]);
  });

  it('guard: the host honours process.env.TZ, so the matrix reads real zones', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T05:00:00Z'));
    // If TZ ever stopped being honoured in-process these collapse to one
    // value and the matrix would stop proving anything.
    expect(inZone('America/Los_Angeles', () => new Date().getDate())).toBe(14);
    expect(inZone('Pacific/Kiritimati', () => new Date().getDate())).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Component render states (fixture-backed)
// ---------------------------------------------------------------------------

const todoFixtures: FrappeToDo[] = [
  todo({
    name: 'TODO-001',
    allocated_to: 'jane@example.com',
    status: 'Open',
    creation: '2026-01-05 10:00:00',
  }),
  todo({
    name: 'TODO-002',
    allocated_to: 'maria@example.com',
    status: 'Closed',
    creation: '2026-01-04 09:00:00',
  }),
  todo({
    name: 'TODO-003',
    allocated_to: 'ghost@example.com',
    status: 'Cancelled',
    creation: '2026-01-03 08:00:00',
  }),
  todo({
    name: 'TODO-OTHER',
    allocated_to: 'other@example.com',
    reference_name: 'TASK-999',
    status: 'Open',
  }),
];

const userFixtures: FrappeUserDoc[] = [
  { name: 'jane@example.com', doctype: 'User', full_name: 'Jane Doe' },
  { name: 'maria@example.com', doctype: 'User', full_name: 'Maria Garcia' },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    ToDo: todoFixtures.map((t) => ({ ...t })),
    User: userFixtures.map((u) => ({ ...u })),
  });

describe(FrappeAssignment, () => {
  it('renders open assignees with resolved names and the completed section', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeAssignment
          doctype="Task"
          name="TASK-001"
        />
      </FrappeProvider>,
    );
    // Open assignee resolved through the User doctype
    await expect(screen.findByText('Jane Doe')).resolves.toBeTruthy();
    // Completed section renders the closed assignment
    await expect(screen.findByText('Maria Garcia')).resolves.toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    // Cancelled and other-document ToDos never render
    expect(screen.queryByText(/ghost@example.com/)).toBeNull();
    expect(screen.queryByText(/other@example.com/)).toBeNull();
  });

  it('shows the honest empty state when no assignments match', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeAssignment
          doctype="Task"
          name="TASK-NONE"
        />
      </FrappeProvider>,
    );
    await expect(screen.findByText('No one assigned')).resolves.toBeTruthy();
  });

  it('renders without crashing when no FrappeProvider is present', () => {
    renderWithProviders(
      <FrappeAssignment
        doctype="Task"
        name="TASK-001"
      />,
    );
    expect(screen.getByText('Assigned To')).toBeTruthy();
  });

  it('hides mutation affordances when disabled', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={makeFixtures()}>
        <FrappeAssignment
          doctype="Task"
          name="TASK-001"
          disabled
        />
      </FrappeProvider>,
    );
    await screen.findByText('Jane Doe');
    expect(screen.queryByLabelText('Add assignment')).toBeNull();
    expect(screen.queryByLabelText('Remove assignment')).toBeNull();
    expect(screen.queryByLabelText('Mark assignment complete')).toBeNull();
  });

  it('removes an assignment by cancelling its ToDo (assign_to.remove parity)', async () => {
    const fixtures = makeFixtures();
    const onRemove = vi.fn();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={fixtures}>
        <FrappeAssignment
          doctype="Task"
          name="TASK-001"
          onRemove={onRemove}
        />
      </FrappeProvider>,
    );
    await screen.findByText('Jane Doe');
    fireEvent.click(screen.getByLabelText('Remove assignment'));
    await waitFor(() => {
      const stored = fixtures.getData().ToDo.find((t) => t.name === 'TODO-001');
      expect(stored?.status).toBe('Cancelled');
    });
    expect(onRemove).toHaveBeenCalledOnce();
    // The row leaves the assignee list (cancelled is derived out)
    await waitFor(() => {
      expect(screen.queryByText('Jane Doe')).toBeNull();
    });
  });

  it('marks an assignment complete by closing its ToDo (assign_to.close parity)', async () => {
    const fixtures = makeFixtures();
    const onComplete = vi.fn();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={fixtures}>
        <FrappeAssignment
          doctype="Task"
          name="TASK-001"
          onComplete={onComplete}
        />
      </FrappeProvider>,
    );
    await screen.findByText('Jane Doe');
    fireEvent.click(screen.getByLabelText('Mark assignment complete'));
    await waitFor(() => {
      const stored = fixtures.getData().ToDo.find((t) => t.name === 'TODO-001');
      expect(stored?.status).toBe('Closed');
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
