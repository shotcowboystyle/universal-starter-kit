import { describe, expect, it } from 'vitest';

import { isNestedPanelAction } from './nestedAction';

describe('independent actions inside panel triggers', () => {
  it('recognizes an SVG descendant of a marked action', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<button data-floating-panel-action="true"><svg><path /></svg></button>';
    expect(
      isNestedPanelAction({
        nativeEvent: { target: wrapper.querySelector('path') },
        currentTarget: wrapper,
      }),
    ).toBe(true);
  });

  it('does not let a marker above the wrapper suppress an ordinary opener', () => {
    const outer = document.createElement('div');
    outer.setAttribute('data-floating-panel-action', 'true');
    outer.innerHTML = '<div><button>Open</button></div>';
    expect(
      isNestedPanelAction({
        target: outer.querySelector('button'),
        currentTarget: outer.firstElementChild,
      }),
    ).toBe(false);
  });

  it('keeps unmarked buttons and non-DOM events as ordinary trigger presses', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<button>Open</button>';
    expect(isNestedPanelAction({ target: wrapper.firstElementChild, currentTarget: wrapper })).toBe(false);
    expect(isNestedPanelAction({})).toBe(false);
  });
});
