// The comment repro kill, as a deferred-network spec: a comment submitted
// through the Timeline composer must PAINT before the server ack resolves
// (the whole point of the live client's in-memory store), then reconcile to
// the server-assigned name without duplicating when the ack lands.
import { InMemoryFixtureProvider } from '@repo/frappe';
import type { FrappeDocData } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FrappeProvider } from '../FrappeProvider';

import { Timeline } from './timeline';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

afterEach(cleanup);

/**
 * Fixture provider whose creates hang until `release()` — the "server" is
 * slow. Assigns a server-style name (drops the client's `local:` identity)
 * so the temp→real remap path is exercised too.
 */
class DeferredCreateFixtureProvider extends InMemoryFixtureProvider {
  private readonly pendingCreates: (() => void)[] = [];
  private serial = 0;

  get pendingCount() {
    return this.pendingCreates.length;
  }

  async createDoc<TDoc extends FrappeDocData>(doctype: string, doc: Partial<TDoc>): Promise<TDoc> {
    await new Promise<void>((resolve) => this.pendingCreates.push(resolve));
    const { name: _clientName, ...rest } = doc as Record<string, unknown>;
    return await super.createDoc(doctype, {
      ...rest,
      name: `CMT-${String(++this.serial).padStart(3, '0')}`,
    } as Partial<TDoc>);
  }

  release() {
    const pending = this.pendingCreates.splice(0);
    for (const resolve of pending) {
      resolve();
    }
  }
}

const makeFixtures = () =>
  new DeferredCreateFixtureProvider({
    Comment: [
      {
        name: 'CMT-EXISTING',
        doctype: 'Comment',
        comment_type: 'Comment',
        content: 'already here',
        comment_by: 'Jane Doe',
        comment_email: 'jane@example.com',
        reference_doctype: 'Task',
        reference_name: 'TASK-001',
        creation: '2024-01-01 10:00:00',
        owner: 'jane@example.com',
      },
    ],
    Version: [],
  });

describe('Timeline optimistic comments (deferred network)', () => {
  it('paints the comment row BEFORE the create ack resolves, then reconciles without duplicating', async () => {
    const fixtures = makeFixtures();
    renderWithProviders(
      <FrappeProvider
        baseURL="https://bench.example.com"
        fixtures={fixtures}>
        <Timeline
          doctype="Task"
          docname="TASK-001"
        />
      </FrappeProvider>,
    );

    // Seeded comment arrives from the fixture store.
    await expect(screen.findByText('already here')).resolves.toBeTruthy();

    // Submit through the composer — no onAddComment prop: this is the
    // default engine write path (previously a silent drop).
    const input = screen.getByPlaceholderText('Add a comment...');
    fireEvent.change(input, { target: { value: 'optimistic!' } });
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));

    // THE REPRO KILL: the row paints while the server ack is still pending.
    await waitFor(() => {
      expect(screen.getByText('optimistic!')).toBeTruthy();
    });
    expect(fixtures.pendingCount).toBeGreaterThan(0);

    // Ack lands: the local: identity remaps to the server name — the row
    // stays painted and does not duplicate.
    fixtures.release();
    await waitFor(() => {
      expect(fixtures.getData().Comment?.some((c) => c.content === 'optimistic!')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getAllByText('optimistic!')).toHaveLength(1);
    });
    expect(screen.getByText('already here')).toBeTruthy();
  });
});
