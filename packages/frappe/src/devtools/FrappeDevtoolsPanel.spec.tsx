/**
 * FrappeDevtoolsPanel contract specs.
 *
 * The panel is plain DOM inside the TanStack Devtools shell, so its whole
 * contract is: read SyncModule.__debug(), repaint on every subscribeStore
 * emit, and paint the palette the shell's theme prop names. Nothing here
 * touches the sync engine — a stub SyncModule exposing just those two members
 * is the entire surface the panel consumes, which keeps the spec hermetic and
 * lets a test drive the panel into states a live engine reaches only by
 * timing (a stale checkpoint, a failed mutation, a lost socket).
 */
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SyncModule } from '../sync';
import type { FrappeDebugState } from '../sync/types';
import { Operation, Status } from '../sync/types';

import { FrappeDevtoolsPanel } from './FrappeDevtoolsPanel';
import { themes } from './theme';

afterEach(cleanup);

function emptyDebugState(): FrappeDebugState {
  return {
    subscriptions: [],
    normalizedCache: { size: 0, doctypes: [] },
    mutationJournal: { pending: [], confirmed: [], failed: [] },
    connection: { socketConnected: false, isLeader: false, isOnline: true },
  };
}

function populatedDebugState(): FrappeDebugState {
  return {
    subscriptions: [
      {
        id: 'sub-todo',
        query: { doctype: 'ToDo' } as FrappeDebugState['subscriptions'][number]['query'],
        docCount: 8,
        tombstoneCount: 1,
        checkpoint: new Date().toISOString(),
      },
      {
        id: 'sub-note',
        query: { doctype: 'Note' } as FrappeDebugState['subscriptions'][number]['query'],
        docCount: 3,
        tombstoneCount: 0,
      },
    ],
    normalizedCache: {
      size: 11,
      doctypes: [
        { doctype: 'ToDo', count: 8 },
        { doctype: 'Note', count: 3 },
      ],
    },
    mutationJournal: {
      pending: [
        {
          id: 'm-pending',
          operation: Operation.Update,
          doctype: 'ToDo',
          docname: 'TODO-HANGS',
          status: Status.Pending,
          createdAt: Date.now(),
          retryCount: 0,
        },
      ],
      confirmed: [
        {
          id: 'm-confirmed',
          operation: Operation.Update,
          doctype: 'ToDo',
          docname: 'TODO-0001',
          status: Status.Confirmed,
          createdAt: Date.now(),
          retryCount: 0,
        },
      ],
      failed: [
        {
          id: 'm-failed',
          operation: Operation.Update,
          doctype: 'ToDo',
          docname: 'TODO-REJECTS',
          status: Status.Failed,
          createdAt: Date.now(),
          retryCount: 2,
          error: 'ValidationError: TODO-REJECTS is locked',
        },
      ],
    },
    connection: { socketConnected: true, isLeader: true, isOnline: true },
  };
}

/**
 * A SyncModule stub with only what the panel calls. `emit()` drives the
 * subscribeStore listener the way the real store does on every write.
 */
function stubSyncModule(initial: FrappeDebugState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const module = {
    __debug: vi.fn(() => state),
    subscribeStore: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    }),
  } as unknown as SyncModule;
  return {
    module,
    unsubscribe,
    set(next: FrappeDebugState) {
      state = next;
      act(() => {
        for (const listener of listeners) {
          listener();
        }
      });
    },
    listenerCount: () => listeners.size,
  };
}

describe('FrappeDevtoolsPanel reads __debug()', () => {
  it('paints the subscriptions the debug snapshot names', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(stub.module.__debug).toHaveBeenCalledWith();
    expect(container.textContent).toContain('ToDo');
    expect(container.textContent).toContain('8 docs');
    expect(container.textContent).toContain('Note');
    expect(container.textContent).toContain('3 docs');
  });

  it('an empty snapshot still paints the shell, not a blank div', () => {
    const stub = stubSyncModule(emptyDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(container.firstElementChild).toBeTruthy();
    expect(container.textContent).toContain('Pages');
    expect(container.textContent).toContain('Cache');
    expect(container.textContent).toContain('Mutations');
  });

  it('with no subscription selected the Pages tab asks for one', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(container.textContent).toContain('Select a subscription');
  });
});

describe('FrappeDevtoolsPanel repaints on store emits', () => {
  it('subscribes once and re-reads __debug() on every emit', () => {
    const stub = stubSyncModule(emptyDebugState());
    render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(stub.listenerCount()).toBe(1);
    const before = (stub.module.__debug as ReturnType<typeof vi.fn>).mock.calls.length;
    stub.set(populatedDebugState());
    expect((stub.module.__debug as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
  });

  it('a subscription that appears after mount reaches the sidebar', () => {
    const stub = stubSyncModule(emptyDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(container.textContent).not.toContain('Note');
    stub.set(populatedDebugState());
    expect(container.textContent).toContain('Note');
  });

  it('unsubscribes from the store on unmount', () => {
    const stub = stubSyncModule(emptyDebugState());
    const { unmount } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    expect(stub.listenerCount()).toBe(1);
    unmount();
    expect(stub.listenerCount()).toBe(0);
    expect(stub.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('FrappeDevtoolsPanel tabs', () => {
  it('the Cache tab lists the cached doctypes and their counts', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    fireEvent.click(screen.getByText('Cache'));
    expect(container.textContent).toContain('ToDo');
    expect(container.textContent).toContain('8');
  });

  it('the Mutations tab lists every journal state under All', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    fireEvent.click(screen.getByText('Mutations'));
    expect(container.textContent).toContain('TODO-HANGS');
    expect(container.textContent).toContain('TODO-0001');
    expect(container.textContent).toContain('TODO-REJECTS');
    expect(container.textContent).toContain('Failed (1)');
  });

  it('a failed entry keeps its error message collapsed until the row is clicked', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    fireEvent.click(screen.getByText('Mutations'));
    expect(container.textContent).not.toContain('locked');
    fireEvent.click(screen.getByText('TODO-REJECTS'));
    expect(container.textContent).toContain('locked');
  });

  it('the Failed filter drops the pending and confirmed rows', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    fireEvent.click(screen.getByText('Mutations'));
    fireEvent.click(screen.getByText('Failed (1)'));
    expect(container.textContent).toContain('TODO-REJECTS');
    expect(container.textContent).not.toContain('TODO-HANGS');
    expect(container.textContent).not.toContain('TODO-0001');
  });

  it('selecting a subscription moves the Pages tab off the placeholder', () => {
    const stub = stubSyncModule(populatedDebugState());
    const { container } = render(
      <FrappeDevtoolsPanel
        syncModule={stub.module}
        devtoolsTheme="light"
      />,
    );
    fireEvent.click(screen.getByText('ToDo'));
    expect(container.textContent).not.toContain('Select a subscription');
  });
});

describe('FrappeDevtoolsPanel theme prop', () => {
  it("light and dark paint different backgrounds, and each is its palette's bg", () => {
    const light = render(
      <FrappeDevtoolsPanel
        syncModule={stubSyncModule(emptyDebugState()).module}
        devtoolsTheme="light"
      />,
    );
    const lightBg = (light.container.firstElementChild as HTMLElement).style.backgroundColor;
    cleanup();
    const dark = render(
      <FrappeDevtoolsPanel
        syncModule={stubSyncModule(emptyDebugState()).module}
        devtoolsTheme="dark"
      />,
    );
    const darkBg = (dark.container.firstElementChild as HTMLElement).style.backgroundColor;
    expect(lightBg).not.toBe(darkBg);
    expect(lightBg).toBe(themes.light.bg);
    expect(darkBg).toBe(themes.dark.bg);
    // The panel owns its own palette (devtools/theme.ts); it never reads the app knobs.
    expect(Object.keys(themes)).toEqual(['light', 'dark']);
  });
});
