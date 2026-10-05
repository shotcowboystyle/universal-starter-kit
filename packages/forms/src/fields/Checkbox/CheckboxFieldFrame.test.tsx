import { renderWithProviders } from '@repo/test-utils';
/**
 * CheckboxFieldFrame — the unpainted hit target.
 *
 * This is the `role=checkbox` node the user actually presses. The whole point
 * of it is that it paints NOTHING: the visible box is CheckboxGlyphBox, and if
 * this frame ever grew a background, a border or a focus ring, the wash would
 * wrap the label+box group instead of sitting on the 20px box. Tamagui's own
 * size variant sets borderRadius = size/8 on a Checkbox frame, so "we override
 * it to 0" is a live claim about a default that fights back, not boilerplate.
 */
import { cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { FieldLayout } from '../../fieldLayout';

import { CheckboxFieldFrame } from './CheckboxFieldFrame';

afterEach(cleanup);

const TRANSPARENT = new Set(['transparent', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)']);

/** Tamagui paints through atomic classes; read the inline channel first. */
function cssOf(node: HTMLElement, prop: string): string {
  const inline = node.style.getPropertyValue(prop);
  if (inline) {
    return inline;
  }
  return getComputedStyle(node).getPropertyValue(prop) || '';
}

function frame(container: HTMLElement): HTMLElement {
  const node = container.querySelector("[role='checkbox']");
  if (!node) {
    throw new Error('CheckboxFieldFrame did not render a role=checkbox node');
  }
  return node as HTMLElement;
}

describe('CheckboxFieldFrame', () => {
  it('links the rendered field message, forwards its ref, and preserves an explicit description', () => {
    const ref = createRef<any>();
    const fixture = (override?: { 'aria-describedby': string | undefined }) => (
      <FieldLayout id="consent" helperText="Read the terms" error="Accept the terms">
        <CheckboxFieldFrame id="consent" checked={false} ref={ref} {...override} />
      </FieldLayout>
    );
    const result = renderWithProviders(fixture());
    expect(frame(result.container).getAttribute('aria-describedby')).toBe('consent-error');
    expect(ref.current).toBe(frame(result.container));
    result.rerender(fixture({ 'aria-describedby': 'consumer-description' }));
    expect(frame(result.container).getAttribute('aria-describedby')).toBe('consumer-description');
    result.rerender(fixture({ 'aria-describedby': undefined }));
    expect(frame(result.container).getAttribute('aria-describedby')).toBeNull();
  });

  it('still renders a real role=checkbox, so the styling never costs the semantics', () => {
    const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} />);
    expect(frame(container)).toBeTruthy();
  });

  it('reports its checked state to assistive tech', () => {
    const off = renderWithProviders(<CheckboxFieldFrame checked={false} />);
    expect(frame(off.container).getAttribute('aria-checked')).toBe('false');
    cleanup();
    const on = renderWithProviders(<CheckboxFieldFrame checked />);
    expect(frame(on.container).getAttribute('aria-checked')).toBe('true');
  });

  it('paints no fill and no border in the idle state', () => {
    const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} />);
    const node = frame(container);
    expect(TRANSPARENT.has(cssOf(node, 'background-color'))).toBe(true);
    expect(cssOf(node, 'border-top-width') || '0px').toBe('0px');
  });

  it("overrides Tamagui's size-driven radius back to zero, so the target is never a disc", () => {
    const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} size="$6" />);
    expect(cssOf(frame(container), 'border-top-left-radius') || '0px').toBe('0px');
  });

  it('keeps the radius at zero across the size ladder, not only at the default', () => {
    for (const size of ['$2', '$4', '$6'] as const) {
      const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} size={size} />);
      expect(cssOf(frame(container), 'border-top-left-radius') || '0px', String(size)).toBe('0px');
      cleanup();
    }
  });

  it("carries no outline of its own, so the ring is the glyph box's job", () => {
    const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} />);
    const outline = cssOf(frame(container), 'outline-width');
    expect(outline === '' || outline === '0px').toBe(true);
  });

  it('declares transparent hover, press, focus and active styles', () => {
    // Asserted on the styled definition rather than by simulating five states:
    // these are the exact overrides that keep a wash off the group, and a
    // regression would be someone deleting one of them.
    const config = (CheckboxFieldFrame as unknown as { staticConfig?: { defaultProps?: Record<string, any> } })
      .staticConfig;
    const defaults = config?.defaultProps ?? {};
    for (const state of ['hoverStyle', 'pressStyle', 'focusStyle', 'focusVisibleStyle', 'activeStyle']) {
      const bag = defaults[state];
      expect(bag, `${state} must be declared on the frame`).toBeTruthy();
      expect(TRANSPARENT.has(String(bag.backgroundColor)), state).toBe(true);
      expect(TRANSPARENT.has(String(bag.borderColor)), state).toBe(true);
    }
    expect(defaults.focusStyle.outlineWidth).toBe(0);
    expect(defaults.focusVisibleStyle.outlineWidth).toBe(0);
    expect(defaults.borderWidth).toBe(0);
    expect(defaults.borderRadius).toBe(0);
  });

  it('lets a caller still size the target, because the frame is the hit area', () => {
    const { container } = renderWithProviders(<CheckboxFieldFrame checked={false} width={44} height={44} />);
    const node = frame(container);
    expect(cssOf(node, 'width')).toBe('44px');
    expect(cssOf(node, 'height')).toBe('44px');
  });

  it('renders the glyph it is given inside the target', () => {
    const { container } = renderWithProviders(
      <CheckboxFieldFrame checked>
        <span data-inner-glyph />
      </CheckboxFieldFrame>,
    );
    expect(frame(container).querySelector('[data-inner-glyph]')).toBeTruthy();
  });
});
