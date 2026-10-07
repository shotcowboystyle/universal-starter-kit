// The prev/next pager's context channel: DoctypeListScreen writes the last
// list order, DocFormScreen reads neighbors. Pins the honest-affordance
// contract — no context (deep link) resolves to inList=false so the pager
// hides instead of rendering dead arrows.
import { beforeEach, describe, expect, it } from 'vitest';

import { getListNavContext, getListNavNeighbors, resetListNavContext, setListNavContext } from './listNavContext';

describe('listNavContext', () => {
  beforeEach(() => {
    resetListNavContext();
    sessionStorage.clear();
  });

  it('round-trips the list order per doctype', () => {
    setListNavContext('ToDo', ['a', 'b', 'c']);
    setListNavContext('User', ['x', 'y']);
    expect(getListNavContext('ToDo')).toEqual(['a', 'b', 'c']);
    expect(getListNavContext('User')).toEqual(['x', 'y']);
  });

  it('returns undefined when no context was ever written', () => {
    expect(getListNavContext('ToDo')).toBeUndefined();
  });

  it('ignores empty writes so fetch-in-flight renders keep the last order', () => {
    setListNavContext('ToDo', ['a', 'b']);
    setListNavContext('ToDo', []);
    expect(getListNavContext('ToDo')).toEqual(['a', 'b']);
  });

  it('drops non-string and empty names from writes', () => {
    setListNavContext('ToDo', ['a', '', 'b']);
    expect(getListNavContext('ToDo')).toEqual(['a', 'b']);
  });

  it('computes neighbors at the middle of the order', () => {
    setListNavContext('ToDo', ['a', 'b', 'c']);
    expect(getListNavNeighbors('ToDo', 'b')).toEqual({ inList: true, prev: 'a', next: 'c' });
  });

  it('omits prev at the first entry and next at the last (boundary honesty)', () => {
    setListNavContext('ToDo', ['a', 'b', 'c']);
    expect(getListNavNeighbors('ToDo', 'a')).toEqual({ inList: true, next: 'b' });
    expect(getListNavNeighbors('ToDo', 'c')).toEqual({ inList: true, prev: 'b' });
  });

  it('reports inList=false for a document outside the last order (deep link)', () => {
    setListNavContext('ToDo', ['a', 'b']);
    expect(getListNavNeighbors('ToDo', 'zz')).toEqual({ inList: false });
    expect(getListNavNeighbors('Role', 'a')).toEqual({ inList: false });
  });

  it('survives a reload through the sessionStorage mirror', () => {
    setListNavContext('ToDo', ['a', 'b', 'c']);
    // Simulate a reload: module memory is gone, sessionStorage persists.
    const stored = sessionStorage.getItem('backoffice:listNav:ToDo');
    resetListNavContext();
    expect(stored).not.toBeNull();
    sessionStorage.setItem('backoffice:listNav:ToDo', stored!);
    expect(getListNavContext('ToDo')).toEqual(['a', 'b', 'c']);
    expect(getListNavNeighbors('ToDo', 'b')).toEqual({ inList: true, prev: 'a', next: 'c' });
  });

  it('ignores a corrupted sessionStorage mirror', () => {
    sessionStorage.setItem('backoffice:listNav:ToDo', '{not json');
    expect(getListNavContext('ToDo')).toBeUndefined();
    sessionStorage.setItem('backoffice:listNav:ToDo', JSON.stringify({ nope: true }));
    expect(getListNavContext('ToDo')).toBeUndefined();
  });

  it('skips identical rewrites (table state fires every render)', () => {
    setListNavContext('ToDo', ['a', 'b']);
    const first = getListNavContext('ToDo');
    setListNavContext('ToDo', ['a', 'b']);
    // Same array identity — the write bailed instead of re-mirroring.
    expect(getListNavContext('ToDo')).toBe(first);
  });
});
