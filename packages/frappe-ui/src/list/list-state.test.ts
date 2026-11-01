import { Order } from '@repo/frappe';
import { describe, expect, it } from 'vitest';

import { isListNarrowed, listStateFilters, listStateFromParams, listStateOrderBy, listStateParams } from './list-state';
import type { FrappeListControls } from './list-state';

const controls: FrappeListControls = {
  sorts: [
    { value: 'number', label: 'Number', orderBy: [{ field: 'poke_id', order: Order.Asc }] },
    { value: 'name', label: 'Name', orderBy: [{ field: 'pokemon_name', order: Order.Asc }] },
  ],
  facets: [
    {
      param: 'type',
      doctype: 'Pokemon Poke Type',
      field: 'poke_type',
      label: 'Type',
      options: ['grass', 'fire'],
    },
    { param: 'gen', field: 'generation', label: 'Generation', options: ['1', '2'] },
  ],
  ranges: [{ param: 'xp', field: 'base_experience', label: 'Min XP' }],
  defaultView: 'grid',
  views: ['grid', 'list', 'table'],
};

describe(listStateFromParams, () => {
  it('reads nothing into the defaults', () => {
    expect(listStateFromParams({}, controls)).toStrictEqual({
      search: '',
      sort: 'number',
      facets: {},
      ranges: {},
      favoritesOnly: false,
      view: 'grid',
    });
  });

  it('reads every control from its param', () => {
    expect(
      listStateFromParams({ q: 'bulba', sort: 'name', type: 'grass', xp: '60', fav: '1', view: 'table' }, controls),
    ).toStrictEqual({
      search: 'bulba',
      sort: 'name',
      facets: { type: 'grass' },
      ranges: { xp: 60 },
      favoritesOnly: true,
      view: 'table',
    });
  });

  it('drops values the controls do not offer', () => {
    expect(listStateFromParams({ sort: 'height', type: 'water', xp: '-4', view: 'kanban' }, controls)).toStrictEqual(
      listStateFromParams({}, controls),
    );
  });
});

describe(listStateParams, () => {
  it('writes defaults as absent params so a clean list has a clean URL', () => {
    expect(
      listStateParams({ search: '', sort: 'number', facets: { type: '' }, ranges: { xp: 0 }, view: 'grid' }, controls),
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicit undefined param tells the router to drop it; toStrictEqual pins those keys
    ).toStrictEqual({ q: undefined, sort: undefined, type: undefined, xp: undefined, view: undefined });
  });

  it('writes a patch as only the params it touches', () => {
    expect(listStateParams({ favoritesOnly: true }, controls)).toStrictEqual({ fav: '1' });
    expect(listStateParams({ sort: 'name', facets: { type: 'fire' } }, controls)).toStrictEqual({
      sort: 'name',
      type: 'fire',
    });
  });

  it('round-trips through listStateFromParams', () => {
    const state = listStateFromParams({ q: '25', sort: 'name', gen: '2', xp: '100', fav: '1', view: 'list' }, controls);
    expect(listStateFromParams(listStateParams(state, controls), controls)).toStrictEqual(state);
  });
});

describe(listStateFilters, () => {
  const empty = listStateFromParams({}, controls);

  it('is undefined when nothing narrows, so the list reads its unfiltered query', () => {
    expect(listStateFilters(empty, controls)).toBeUndefined();
    expect(isListNarrowed(empty)).toBe(false);
  });

  it('turns each control into a bench filter', () => {
    const state = {
      ...empty,
      search: ' bulba ',
      facets: { type: 'grass', gen: '1' },
      ranges: { xp: 60 },
      favoritesOnly: true,
    };
    expect(
      listStateFilters(state, controls, {
        search: (query) => [['pokemon_name', 'like', `%${query}%`]],
        favorites: new Set(['ivysaur', 'bulbasaur']),
      }),
    ).toStrictEqual([
      ['pokemon_name', 'like', '%bulba%'],
      ['Pokemon Poke Type', 'poke_type', '=', 'grass'],
      ['generation', '=', '1'],
      ['base_experience', '>=', 60],
      ['name', 'in', ['bulbasaur', 'ivysaur']],
    ]);
    expect(isListNarrowed(state)).toBe(true);
  });

  it('keeps the given filters first', () => {
    expect(
      listStateFilters({ ...empty, ranges: { xp: 10 } }, controls, {
        base: [['species', '=', 'seed']],
      }),
    ).toStrictEqual([
      ['species', '=', 'seed'],
      ['base_experience', '>=', 10],
    ]);
  });

  it('filters favorites-only with no favorites to an empty match', () => {
    expect(listStateFilters({ ...empty, favoritesOnly: true }, controls)).toStrictEqual([['name', 'in', []]]);
  });
});

describe(listStateOrderBy, () => {
  it("is the chosen sort's order, else the fallback", () => {
    const empty = listStateFromParams({}, controls);
    expect(listStateOrderBy({ ...empty, sort: 'name' }, controls)).toStrictEqual([
      { field: 'pokemon_name', order: Order.Asc },
    ]);
    expect(listStateOrderBy(empty, controls)).toStrictEqual([{ field: 'poke_id', order: Order.Asc }]);
    expect(
      listStateOrderBy(empty, { ...controls, sorts: [] }, [{ field: 'modified', order: Order.Desc }]),
    ).toStrictEqual([{ field: 'modified', order: Order.Desc }]);
  });
});
