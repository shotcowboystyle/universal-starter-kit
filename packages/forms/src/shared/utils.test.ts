import type { BorderRadius } from '@repo/theme';
import { borderRadiusMap, resolveRadiusClass } from '@repo/theme';
import { describe, expect, it, vi } from 'vitest';

import {
  clampRadiusForControl,
  clampRadiusForLargeComponent,
  getOTPCellRadius,
  stripRadiusFromStateProps,
  clampRadiusInStateProps,
  getFieldError,
  mergeFieldHandler,
} from './utils';

describe('clampRadiusForControl', () => {
  it('returns "$4" fallback when undefined', () => {
    expect(clampRadiusForControl(undefined)).toBe('$4');
  });

  it('returns 0 for $0', () => {
    expect(clampRadiusForControl('$0')).toBe(0);
  });

  it('passes through tokens within the limit', () => {
    expect(clampRadiusForControl('$2')).toBe('$2');
    expect(clampRadiusForControl('$4')).toBe('$4');
    expect(clampRadiusForControl('$6')).toBe('$6');
  });

  it('clamps tokens exceeding the max', () => {
    expect(clampRadiusForControl('$12')).toBe('$6');
    expect(clampRadiusForControl('$8')).toBe('$6');
  });

  it('uses custom max token number', () => {
    expect(clampRadiusForControl('$5', 4)).toBe('$4');
    expect(clampRadiusForControl('$3', 4)).toBe('$3');
  });

  it('passes through non-token strings', () => {
    expect(clampRadiusForControl('10px')).toBe('10px');
  });
});

describe('clampRadiusForLargeComponent', () => {
  it('returns "$3" fallback when undefined', () => {
    expect(clampRadiusForLargeComponent(undefined)).toBe('$3');
  });

  it('returns 0 for $0', () => {
    expect(clampRadiusForLargeComponent('$0')).toBe(0);
  });

  it('clamps to $4 by default', () => {
    expect(clampRadiusForLargeComponent('$12')).toBe('$4');
    expect(clampRadiusForLargeComponent('$6')).toBe('$4');
  });

  it('passes through tokens within the limit', () => {
    expect(clampRadiusForLargeComponent('$2')).toBe('$2');
    expect(clampRadiusForLargeComponent('$4')).toBe('$4');
  });
});

describe('getOTPCellRadius', () => {
  const H = 44;

  it('is a thin CIRCULAR-AT-FULL alias: 0 at none, token scale, height/2 at full', () => {
    expect(getOTPCellRadius('$0', H)).toBe(0);
    expect(getOTPCellRadius('none', H)).toBe(0);
    expect(getOTPCellRadius('$2', H)).toBe(5);
    expect(getOTPCellRadius('$4', H)).toBe(9);
    expect(getOTPCellRadius('$6', H)).toBe(16);
    expect(getOTPCellRadius('$12', H)).toBe(H / 2);
    expect(getOTPCellRadius('full', 40)).toBe(20);
  });

  it('falls back to medium ($4) when the token is missing', () => {
    expect(getOTPCellRadius(undefined, H)).toBe(9);
  });
});

describe('stripRadiusFromStateProps', () => {
  it('returns undefined/null props as-is', () => {
    expect(stripRadiusFromStateProps(undefined)).toBeUndefined();
  });

  it('returns props unchanged when no borderRadius', () => {
    const props = { color: 'red', opacity: 1 };
    expect(stripRadiusFromStateProps(props)).toBe(props);
  });

  it('removes borderRadius and keeps other props', () => {
    const result = stripRadiusFromStateProps({ borderRadius: '$4', color: 'blue' });
    expect(result).toEqual({ color: 'blue' });
    expect(result).not.toHaveProperty('borderRadius');
  });

  it('returns undefined when borderRadius was the only prop', () => {
    expect(stripRadiusFromStateProps({ borderRadius: '$4' })).toBeUndefined();
  });
});

describe('clampRadiusInStateProps', () => {
  it('returns undefined/null props as-is', () => {
    expect(clampRadiusInStateProps(undefined)).toBeUndefined();
  });

  it('returns props unchanged when no borderRadius', () => {
    const props = { color: 'red' };
    expect(clampRadiusInStateProps(props)).toBe(props);
  });

  it('clamps borderRadius in the props', () => {
    const result = clampRadiusInStateProps({ borderRadius: '$12', color: 'blue' });
    expect(result).toEqual({ borderRadius: '$6', color: 'blue' });
  });

  it('uses custom max token number', () => {
    const result = clampRadiusInStateProps({ borderRadius: '$8', color: 'blue' }, 4);
    expect(result).toEqual({ borderRadius: '$4', color: 'blue' });
  });

  // BINARY covers thumb AND track. A per-state override bag may not inject
  // an intermediate radius (the old token clamp turned $12 into $6 = 16px
  // on a 44px thumb). Every state resolves to 0 or h/2 and nothing between.
  describe('BINARY-class parts refuse intermediate radius in every state', () => {
    const STATES = ['hover', 'press', 'focus', 'focusVisible'] as const;
    const THUMB_H = 44;
    const TRACK_H = 28;
    const INTERMEDIATE = ['$2', '$4', '$6', '$8', '$12', 9, '9px'] as const;

    function expectBinaryRadius(value: unknown, heightPx: number) {
      expect(value === 0 || value === heightPx / 2).toBe(true);
    }

    it.each(STATES)("snaps a %s bag's token clamp to 0 or h/2 (thumb)", (state) => {
      for (const token of INTERMEDIATE) {
        const result = clampRadiusInStateProps(
          { borderRadius: token, color: 'blue', state },
          { radiusClass: 'BINARY', heightPx: THUMB_H },
        );
        expect(result?.borderRadius).toBe(THUMB_H / 2);
        expectBinaryRadius(result?.borderRadius, THUMB_H);
      }
    });

    it.each(STATES)("snaps a %s bag's token clamp to 0 or h/2 (track)", (state) => {
      for (const token of INTERMEDIATE) {
        const result = clampRadiusInStateProps(
          { borderRadius: token, state },
          { radiusClass: 'BINARY', heightPx: TRACK_H },
        );
        expect(result?.borderRadius).toBe(TRACK_H / 2);
        expectBinaryRadius(result?.borderRadius, TRACK_H);
      }
    });

    it.each(STATES)('resolves a none stop to 0 in a %s bag', (state) => {
      for (const none of ['$0', 0, 'none'] as const) {
        const result = clampRadiusInStateProps(
          { borderRadius: none, state },
          { radiusClass: 'BINARY', heightPx: THUMB_H },
        );
        expect(result?.borderRadius).toBe(0);
      }
    });

    it('walks nested state styles so a composite bag cannot sneak an intermediate radius', () => {
      const result = clampRadiusInStateProps(
        {
          borderRadius: '$4',
          hoverStyle: { borderRadius: '$6' },
          pressStyle: { borderRadius: '$12' },
          focusStyle: { borderRadius: 9 },
          focusVisibleStyle: { borderRadius: '$2' },
        },
        { radiusClass: 'BINARY', heightPx: THUMB_H },
      );
      expect(result?.borderRadius).toBe(THUMB_H / 2);
      for (const key of ['hoverStyle', 'pressStyle', 'focusStyle', 'focusVisibleStyle'] as const) {
        expect(result?.[key]?.borderRadius).toBe(THUMB_H / 2);
      }
    });

    // ONE-IMPLEMENTATION. The BINARY row is doctrine-GENERATED
    // (radiusClassTable.generated.ts).
    // A state bag must resolve through THAT table, not through a copy of it
    // living in forms — otherwise a DG-RAD edit reaches the base radius and
    // silently misses every hover/press/focus bag. Driven off borderRadiusMap
    // so a stop added to the doctrine is covered without touching this test.
    const STOPS = Object.keys(borderRadiusMap) as BorderRadius[];

    it.each(STOPS)("agrees with resolveRadiusClass('BINARY') at the %s stop", (stop) => {
      for (const heightPx of [THUMB_H, TRACK_H, 21]) {
        const expected = resolveRadiusClass('BINARY', stop, { heightPx });
        for (const spelling of [stop, borderRadiusMap[stop]]) {
          const result = clampRadiusInStateProps({ borderRadius: spelling }, { radiusClass: 'BINARY', heightPx });
          expect(result?.borderRadius).toBe(expected);
        }
      }
    });

    it('reads the token/stop mapping off borderRadiusMap rather than a hand-kept copy', () => {
      for (const stop of STOPS) {
        const byName = clampRadiusInStateProps({ borderRadius: stop }, { radiusClass: 'BINARY', heightPx: THUMB_H });
        const byToken = clampRadiusInStateProps(
          { borderRadius: borderRadiusMap[stop] },
          { radiusClass: 'BINARY', heightPx: THUMB_H },
        );
        expect(byName?.borderRadius).toBe(byToken?.borderRadius);
      }
    });

    it('refuses a BINARY bag with no height instead of guessing one', () => {
      expect(() => clampRadiusInStateProps({ borderRadius: '$12' }, { radiusClass: 'BINARY' })).toThrow(/heightPx/);
      expect(() => clampRadiusInStateProps({ borderRadius: '$0' }, { radiusClass: 'BINARY', heightPx: 0 })).toThrow(
        /heightPx/,
      );
    });
  });
});

describe('getFieldError', () => {
  function makeField(errors: string[]) {
    return { state: { meta: { errors } } } as any;
  }

  it('returns propError when provided', () => {
    expect(getFieldError(makeField(['field error']), 'prop error')).toBe('prop error');
  });

  it('returns field error when no propError', () => {
    expect(getFieldError(makeField(['validation failed']))).toBe('validation failed');
  });

  it('returns undefined when no errors', () => {
    expect(getFieldError(makeField([]))).toBeUndefined();
  });

  it('returns false propError over field error', () => {
    expect(getFieldError(makeField(['field error']), false)).toBe(false);
  });
});

describe('mergeFieldHandler', () => {
  it('calls both field handler and custom handler', () => {
    const fieldBlur = vi.fn();
    const customHandler = vi.fn();
    const field = { handleBlur: fieldBlur } as any;

    const merged = mergeFieldHandler(field, 'handleBlur', customHandler);
    merged('arg1', 'arg2');

    expect(fieldBlur).toHaveBeenCalledWith('arg1', 'arg2');
    expect(customHandler).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('works without a custom handler', () => {
    const fieldChange = vi.fn();
    const field = { handleChange: fieldChange } as any;

    const merged = mergeFieldHandler(field, 'handleChange');
    merged('value');

    expect(fieldChange).toHaveBeenCalledWith('value');
  });
});
