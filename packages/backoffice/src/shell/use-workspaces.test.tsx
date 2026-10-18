/**
 * Workspace live-query teardown regression spec (backoffice-e2e-verify.md
 * gap #3): navigating away from the shell (unmounting every useWorkspaces
 * consumer) must wind the shared "Workspace" collection down WITHOUT
 * erroring the live queries — the historical failure was the registry's
 * grace GC calling collection.cleanup() while queries were still attached
 * ("[Live Query Error] Source collection 'Workspace' was manually cleaned
 * up while live query 'live-query-N' depends on it"), permanently erroring
 * them and wedging remounts on "Loading workspaces…".
 *
 * The engine-level fix lives in public/frappe (subscriber-aware deferred
 * GC — frappeReact.ts, spec'd there in frappeReactLiveQueryGc.spec.ts).
 * THIS spec pins the consumer wiring: the real useWorkspaces hook over the
 * real TanStack DB pipeline (fixture-backed SyncModule), through the full
 * unmount → natural wind-down → remount cycle, asserting zero live-query
 * errors and a clean reload. A regression in either layer (a manual
 * cleanup() call, unstable collection identity churn in useWorkspaces, a
 * broken loading gate) fails here.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { InMemoryFixtureProvider } from '@repo/frappe';
import { FrappeProvider } from '@repo/frappe-ui';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { useWorkspaces } from './use-workspaces';

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Workspace: [
      {
        name: 'Home',
        doctype: 'Workspace',
        title: 'Home',
        public: 1,
        for_user: '',
        sequence_id: 1,
        parent_page: '',
        is_hidden: 0,
      },
      {
        name: 'Users',
        doctype: 'Workspace',
        title: 'Users',
        public: 1,
        for_user: '',
        sequence_id: 2,
        parent_page: '',
        is_hidden: 0,
      },
    ],
  });

describe('useWorkspaces teardown', () => {
  let errorSpy: MockInstance;

  const liveQueryErrors = () =>
    errorSpy.mock.calls.filter(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- console.error arguments are untyped; only a string message can carry the marker
      (args) => typeof args[0] === 'string' && args[0].includes('[Live Query Error]'),
    );

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('unmount → natural wind-down → remount: no live-query errors, data reloads', { timeout: 20_000 }, async () => {
    // One provider instance across both mounts = one fixture SyncModule =
    // the production shape (shared collection registry per connection).
    const fixtures = makeFixtures();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FrappeProvider
        baseURL="http://workspace-teardown.fixtures.local"
        fixtures={fixtures}>
        {children}
      </FrappeProvider>
    );

    const first = renderHook(() => useWorkspaces(), { wrapper });
    await waitFor(
      () => {
        expect(first.result.current.isLoading).toBe(false);
        expect(first.result.current.workspaces.map((w) => w.name)).toStrictEqual(['Home', 'Users']);
      },
      { timeout: 10_000 },
    );

    // Navigate away: the last consumer unmounts. Let the FULL natural
    // wind-down run on real timers — TanStack's live-query idle-detach
    // (~1–2s) plus the registry's 1s grace GC ticks.
    first.unmount();
    await sleep(3500);
    expect(liveQueryErrors()).toHaveLength(0);

    // Navigate back: the hook must come up clean (no permanently-errored
    // query wedging the loading gate — the "Loading workspaces…" stick).
    const second = renderHook(() => useWorkspaces(), { wrapper });
    await waitFor(
      () => {
        expect(second.result.current.isLoading).toBe(false);
        expect(second.result.current.workspaces.map((w) => w.name)).toStrictEqual(['Home', 'Users']);
      },
      { timeout: 10_000 },
    );
    expect(liveQueryErrors()).toHaveLength(0);

    second.unmount();
  });

  it(
    'quick route bounce (remount within the GC grace window) keeps the collection live',
    { timeout: 20_000 },
    async () => {
      const fixtures = makeFixtures();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <FrappeProvider
          baseURL="http://workspace-bounce.fixtures.local"
          fixtures={fixtures}>
          {children}
        </FrappeProvider>
      );

      const first = renderHook(() => useWorkspaces(), { wrapper });
      await waitFor(
        () => {
          expect(first.result.current.isLoading).toBe(false);
        },
        { timeout: 10_000 },
      );

      // Bounce: unmount and remount well inside the 1s grace window (the
      // list → form → list pattern of real shell navigation).
      first.unmount();
      await sleep(200);
      const second = renderHook(() => useWorkspaces(), { wrapper });
      await waitFor(
        () => {
          expect(second.result.current.isLoading).toBe(false);
          expect(second.result.current.workspaces).toHaveLength(2);
        },
        { timeout: 10_000 },
      );

      // Long dwell afterwards — deferred GC must never error the live query.
      await sleep(2500);
      expect(liveQueryErrors()).toHaveLength(0);
      expect(second.result.current.workspaces).toHaveLength(2);

      second.unmount();
    },
  );
});
