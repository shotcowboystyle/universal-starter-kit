/**
 * The registry that lets the PACKAGE's own stories reach an APP's `'use dom'`
 * entry (design §9.3).
 *
 * Small surface, and every assertion here is about a rule that was decided
 * rather than an implementation detail: last writer wins, `null` clears, and
 * nothing is looked up by string. The last one is the point — a schema
 * registers by id because `schemaId` is what crosses the bridge, and this does
 * not, because a DOM entry never crosses it. It is a component handed from one
 * Hermes module to another.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { clearNodeGraphDomEntry, getNodeGraphDomEntry, setNodeGraphDomEntry } from './dom-entry-registry';
import type { NodeGraphDomEntry } from './dom-entry-registry';

const first = (() => null) as unknown as NodeGraphDomEntry;
const second = (() => null) as unknown as NodeGraphDomEntry;

describe('the DOM entry registry', () => {
  afterEach(() => {
    clearNodeGraphDomEntry();
  });

  it('starts empty, which is what makes the host draw a fallback', () => {
    // `NodeGraphNative` reads exactly this. Empty must mean "nothing supplied",
    // never "something the package invented", or a consumer who forgot to
    // register would get a canvas that cannot find their config.
    expect(getNodeGraphDomEntry()).toBeNull();
  });

  it('returns the entry that was set', () => {
    setNodeGraphDomEntry(first);
    expect(getNodeGraphDomEntry()).toBe(first);
  });

  it('lets the last writer win', () => {
    // An app has ONE entry. A second call is a hot reload replacing the first,
    // not two apps competing, so it must not throw and must not keep the old.
    setNodeGraphDomEntry(first);
    setNodeGraphDomEntry(second);
    expect(getNodeGraphDomEntry()).toBe(second);
  });

  it('clears with null as well as with the test seam', () => {
    setNodeGraphDomEntry(first);
    setNodeGraphDomEntry(null);
    expect(getNodeGraphDomEntry()).toBeNull();
    setNodeGraphDomEntry(first);
    clearNodeGraphDomEntry();
    expect(getNodeGraphDomEntry()).toBeNull();
  });

  it('holds the component itself, not a serializable stand-in', () => {
    // The distinction from `registerGraphSchema`, and the reason this registry
    // takes no id: a schema's `render` has to be reachable from INSIDE the DOM
    // bundle, so it is looked up by a string that crosses the bridge. A DOM
    // entry is used on the native side and never crosses anything, so identity
    // is the whole contract.
    setNodeGraphDomEntry(first);
    expect(getNodeGraphDomEntry()).not.toStrictEqual(second);
    expect(getNodeGraphDomEntry()).toBeTypeOf('function');
  });
});
