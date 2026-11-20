import { describe, expect, it } from 'vitest';

import { isNestedPanelAction } from './nested-action';

const SVG_NS = 'http://www.w3.org/2000/svg';

const button = (label = '') => {
  const element = document.createElement('button');
  element.textContent = label;
  return element;
};

describe('independent actions inside panel triggers', () => {
  it('recognizes an SVG descendant of a marked action', () => {
    const wrapper = document.createElement('div');
    const action = button();
    action.dataset.floatingPanelAction = 'true';
    const svg = document.createElementNS(SVG_NS, 'svg');
    const path = document.createElementNS(SVG_NS, 'path');
    svg.append(path);
    action.append(svg);
    wrapper.append(action);
    expect(
      isNestedPanelAction({
        nativeEvent: { target: wrapper.querySelector('path') },
        currentTarget: wrapper,
      }),
    ).toBe(true);
  });

  it('does not let a marker above the wrapper suppress an ordinary opener', () => {
    const outer = document.createElement('div');
    outer.dataset.floatingPanelAction = 'true';
    const inner = document.createElement('div');
    const opener = button('Open');
    inner.append(opener);
    outer.append(inner);
    expect(
      isNestedPanelAction({
        target: opener,
        currentTarget: outer.firstElementChild,
      }),
    ).toBe(false);
  });

  it('keeps unmarked buttons and non-DOM events as ordinary trigger presses', () => {
    const wrapper = document.createElement('div');
    const opener = button('Open');
    wrapper.append(opener);
    expect(isNestedPanelAction({ target: wrapper.firstElementChild, currentTarget: wrapper })).toBe(false);
    expect(isNestedPanelAction({})).toBe(false);
  });
});
