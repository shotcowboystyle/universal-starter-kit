/**
 * The node census — the source of design §9.5's `nodesMounted`.
 *
 * What these hold, and why each one is here rather than assumed:
 *
 *  - the count is of DISTINCT ids, because React mounts, unmounts and remounts
 *    the same node under StrictMode and a naive `+1 / -1` would drift upward
 *    every time it did;
 *  - the release is idempotent, because an effect cleanup can run twice for the
 *    same reason;
 *  - subscribers are notified only on a real CHANGE, because the reader is a
 *    `useSyncExternalStore` and a notification with no change is a render.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { mountedNodeCount, registerMountedNode, resetNodeCensus, subscribeNodeCensus } from './nodeCensus';

afterEach(resetNodeCensus);

describe('the node census', () => {
  it('counts distinct nodes, not registrations', () => {
    const releaseA = registerMountedNode('a');
    registerMountedNode('a');
    registerMountedNode('b');
    expect(mountedNodeCount()).toBe(2);
    releaseA();
    expect(mountedNodeCount()).toBe(1);
  });

  it('survives a release called twice, which an effect cleanup can do', () => {
    const release = registerMountedNode('a');
    registerMountedNode('b');
    release();
    release();
    expect(mountedNodeCount()).toBe(1);
  });

  it('notifies a subscriber on a change and stays silent without one', () => {
    let notifications = 0;
    const unsubscribe = subscribeNodeCensus(() => {
      notifications += 1;
    });
    registerMountedNode('a');
    expect(notifications).toBe(1);
    // The same id again is not a change, and a `useSyncExternalStore` reader
    // would re-render for nothing.
    registerMountedNode('a');
    expect(notifications).toBe(1);
    registerMountedNode('b');
    expect(notifications).toBe(2);
    unsubscribe();
    registerMountedNode('c');
    expect(notifications).toBe(2);
  });

  it('reads zero after a reset', () => {
    registerMountedNode('a');
    resetNodeCensus();
    expect(mountedNodeCount()).toBe(0);
  });
});
