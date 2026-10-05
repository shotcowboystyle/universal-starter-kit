import { describe, expect, it } from 'vitest';

import { getGroupPosition, stackEdgeRadius, stackRadiusProps } from './groupGeometry';

describe('getGroupPosition', () => {
  it('returns only for singleton or empty groups', () => {
    expect(getGroupPosition(0, 1)).toBe('only');
    expect(getGroupPosition(0, 0)).toBe('only');
  });

  it('maps first/middle/last by index', () => {
    expect(getGroupPosition(0, 3)).toBe('first');
    expect(getGroupPosition(1, 3)).toBe('middle');
    expect(getGroupPosition(2, 3)).toBe('last');
  });

  it('a two-item group has no middle', () => {
    expect(getGroupPosition(0, 2)).toBe('first');
    expect(getGroupPosition(1, 2)).toBe('last');
  });
});

describe('stackRadiusProps (vertical)', () => {
  const r = '$4';

  it('first rounds only the top corners', () => {
    expect(stackRadiusProps('first', r)).toEqual({
      borderStartStartRadius: r,
      borderStartEndRadius: r,
      borderEndStartRadius: 0,
      borderEndEndRadius: 0,
    });
  });

  it('last rounds only the bottom corners', () => {
    expect(stackRadiusProps('last', r)).toEqual({
      borderStartStartRadius: 0,
      borderStartEndRadius: 0,
      borderEndStartRadius: r,
      borderEndEndRadius: r,
    });
  });

  it('middle is square on every corner', () => {
    expect(stackRadiusProps('middle', r)).toEqual({
      borderStartStartRadius: 0,
      borderStartEndRadius: 0,
      borderEndStartRadius: 0,
      borderEndEndRadius: 0,
    });
  });

  it('only rounds all four corners', () => {
    expect(stackRadiusProps('only', r)).toEqual({
      borderStartStartRadius: r,
      borderStartEndRadius: r,
      borderEndStartRadius: r,
      borderEndEndRadius: r,
    });
  });
});

describe('stackRadiusProps (horizontal)', () => {
  const r = '$4';

  it('first rounds only the inline-start corners', () => {
    expect(stackRadiusProps('first', r, 'horizontal')).toEqual({
      borderStartStartRadius: r,
      borderEndStartRadius: r,
      borderStartEndRadius: 0,
      borderEndEndRadius: 0,
    });
  });

  it('last rounds only the inline-end corners', () => {
    expect(stackRadiusProps('last', r, 'horizontal')).toEqual({
      borderStartStartRadius: 0,
      borderEndStartRadius: 0,
      borderStartEndRadius: r,
      borderEndEndRadius: r,
    });
  });
});

describe('stackEdgeRadius', () => {
  it('supports conditional edges (open accordion trigger: last item, bottom square)', () => {
    expect(stackEdgeRadius('$4', { start: false, end: false })).toEqual({
      borderStartStartRadius: 0,
      borderStartEndRadius: 0,
      borderEndStartRadius: 0,
      borderEndEndRadius: 0,
    });
    expect(stackEdgeRadius('$4', { start: true })).toEqual({
      borderStartStartRadius: '$4',
      borderStartEndRadius: '$4',
      borderEndStartRadius: 0,
      borderEndEndRadius: 0,
    });
  });

  it('treats undefined radius as 0 (radius:none world stays square)', () => {
    expect(stackEdgeRadius(undefined, { start: true, end: true })).toEqual({
      borderStartStartRadius: 0,
      borderStartEndRadius: 0,
      borderEndStartRadius: 0,
      borderEndEndRadius: 0,
    });
  });
});
