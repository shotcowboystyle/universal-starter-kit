/**
 * frappeDevtoolsPlugin contract specs (MPO-8).
 *
 * The plugin is the whole surface the TanStack Devtools shell sees: an id and
 * a name for the tab strip, and a render(hostElement, { theme }) the shell
 * calls when the tab opens. What renders is FrappeDevtoolsPanel bound to the
 * SyncModule the factory closed over — so the contract worth pinning is the
 * binding, not the panel's paint, which FrappeDevtoolsPanel.test.tsx owns.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SyncModule } from '../sync';
import type { FrappeDebugState } from '../sync/types';

import { FrappeDevtoolsPanel } from './FrappeDevtoolsPanel';
import { frappeDevtoolsPlugin } from './plugin';

const stubSyncModule = (label: string) => {
  const state: FrappeDebugState = {
    subscriptions: [
      {
        id: `sub-${label}`,
        query: { doctype: label } as FrappeDebugState['subscriptions'][number]['query'],
        docCount: 1,
        tombstoneCount: 0,
      },
    ],
    normalizedCache: { size: 1, doctypes: [{ doctype: label, count: 1 }] },
    mutationJournal: { pending: [], confirmed: [], failed: [] },
    connection: { socketConnected: false, isLeader: false, isOnline: true },
  };
  return {
    __debug: vi.fn<SyncModule['__debug']>(() => state),
    subscribeStore: vi.fn<SyncModule['subscribeStore']>(() => () => {}),
  } as unknown as SyncModule;
};

describe('frappeDevtoolsPlugin identity', () => {
  afterEach(cleanup);

  it('is the id and name the shell lists in its tab strip', () => {
    const plugin = frappeDevtoolsPlugin(stubSyncModule('ToDo'));
    expect(plugin.id).toBe('frappe');
    expect(plugin.name).toBe('Frappe');
    expect(plugin.render).toBeTypeOf('function');
  });

  it('the identity does not change with the SyncModule it wraps', () => {
    const a = frappeDevtoolsPlugin(stubSyncModule('ToDo'));
    const b = frappeDevtoolsPlugin(stubSyncModule('Note'));
    expect(a.id).toBe(b.id);
    expect(a.name).toBe(b.name);
  });
});

describe('frappeDevtoolsPlugin render()', () => {
  afterEach(cleanup);

  it('returns the panel element bound to the module the factory closed over', () => {
    const syncModule = stubSyncModule('ToDo');
    const plugin = frappeDevtoolsPlugin(syncModule);
    const element = plugin.render(document.createElement('div'), { theme: 'light' });
    expect(element.type).toBe(FrappeDevtoolsPanel);
    expect(element.props.syncModule).toBe(syncModule);
  });

  it("forwards the shell's theme prop straight through, both ways", () => {
    const plugin = frappeDevtoolsPlugin(stubSyncModule('ToDo'));
    const host = document.createElement('div');
    expect(plugin.render(host, { theme: 'light' }).props.devtoolsTheme).toBe('light');
    expect(plugin.render(host, { theme: 'dark' }).props.devtoolsTheme).toBe('dark');
  });

  it("the returned element actually mounts and paints that module's state", () => {
    const plugin = frappeDevtoolsPlugin(stubSyncModule('Sales Invoice'));
    const { container } = render(plugin.render(document.createElement('div'), { theme: 'light' }));
    expect(container.textContent).toContain('Sales Invoice');
  });

  it('render() does not write into the host element itself — the shell mounts what it returns', () => {
    const plugin = frappeDevtoolsPlugin(stubSyncModule('ToDo'));
    const host = document.createElement('div');
    plugin.render(host, { theme: 'light' });
    expect(host.childElementCount).toBe(0);
  });

  it('two renders of one plugin stay bound to the same module', () => {
    const syncModule = stubSyncModule('ToDo');
    const plugin = frappeDevtoolsPlugin(syncModule);
    const host = document.createElement('div');
    expect(plugin.render(host, { theme: 'light' }).props.syncModule).toBe(syncModule);
    expect(plugin.render(host, { theme: 'dark' }).props.syncModule).toBe(syncModule);
  });
});
