import { renderWithProviders } from '@repo/test-utils';
/**
 * CheckboxBox — the painted glyph and the geometry rules around it.
 *
 * Checkbox.test.tsx already covers the two headline radius helpers through the
 * package barrel. What had no coverage at all is everything else this module
 * exports: the WCAG hit-target constant, the three size/border derivations,
 * the "the 44px frame paints nothing" prop bag, the keyboard-modality
 * focus handlers, and the glyph box itself. Those are the parts that regress
 * silently — nothing today would notice if the hit target grew a wash or the
 * glyph started stealing the press.
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKBOX_GLYPH_MAX_RADIUS_TOKEN,
  CHECKBOX_TARGET_PX,
  CheckboxGlyphBox,
  checkboxKbFocusHandlers,
  checkboxTargetFrameProps,
  clampCheckboxGlyphRadius,
  getCheckboxBoxBorderWidth,
  getCheckboxGlyphSize,
  getCheckboxIconSize,
  isCircularCheckboxRadius,
} from './CheckboxBox';

afterEach(cleanup);

/**
 * Modality is the ONE thing here that has to be stood in for. The real tracker
 * (`@repo/theme/keyboardFocusRing`) installs global document
 * listeners lazily and never flips under this test environment - a dispatched
 * keydown, on the document or on a real element, leaves `wasKeyboardFocus()`
 * false - so driving it would assert the environment, not the component.
 * Everything else in the module stays real: only this one function is
 * replaced, over `importActual`.
 */
let keyboardModality = false;
vi.mock('@repo/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/theme')>();
  return { ...actual, wasKeyboardFocus: () => keyboardModality };
});

function pressKey() {
  keyboardModality = true;
}
function pressPointer() {
  keyboardModality = false;
}

afterEach(() => {
  keyboardModality = false;
});

function glyph(container: HTMLElement): HTMLElement {
  const node = container.querySelector("[data-checkbox-box='true']");
  if (!node) {
    throw new Error('CheckboxGlyphBox did not render');
  }
  return node as HTMLElement;
}

/** Tamagui paints through atomic classes, so read both channels. */
function cssOf(node: HTMLElement, prop: string): string {
  const inline = node.style.getPropertyValue(prop);
  if (inline) {
    return inline;
  }
  return getComputedStyle(node).getPropertyValue(prop) || '';
}

function classesOf(node: HTMLElement): string {
  return Array.from(node.classList).join(' ');
}

describe('CheckboxBox — the target is 44px and the glyph is smaller', () => {
  it('pins the WCAG 2.5.5 pressable floor at 44px', () => {
    expect(CHECKBOX_TARGET_PX).toBe(44);
  });

  it('derives the glyph at 45% of the size token, rounded', () => {
    // $4 resolves to 44 on the house size scale in this config, so the glyph
    // is derived, never hardcoded: whatever the token resolves to, the glyph
    // is round(0.45 x) and strictly smaller than the 44px target.
    for (const token of ['$2', '$3', '$4', '$5'] as const) {
      const size = getCheckboxGlyphSize(token);
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(CHECKBOX_TARGET_PX);
    }
  });

  it('grows the glyph monotonically with the size token', () => {
    const small = getCheckboxGlyphSize('$2');
    const large = getCheckboxGlyphSize('$5');
    expect(large).toBeGreaterThan(small);
  });
});

describe("CheckboxBox — the empty box's edge is the shape", () => {
  it('floors the border at 2px whatever the knob says', () => {
    expect(getCheckboxBoxBorderWidth(1)).toBe(2);
    expect(getCheckboxBoxBorderWidth(0)).toBe(2);
    expect(getCheckboxBoxBorderWidth(undefined)).toBe(2);
    expect(getCheckboxBoxBorderWidth(Number.NaN)).toBe(2);
  });

  it('honours a thicker knob instead of clamping it down', () => {
    expect(getCheckboxBoxBorderWidth(3)).toBe(3);
    expect(getCheckboxBoxBorderWidth(6)).toBe(6);
  });

  it('keeps the check mark at 70% of the glyph but never under 10px', () => {
    expect(getCheckboxIconSize(20)).toBe(14);
    expect(getCheckboxIconSize(30)).toBe(21);
    // The floor bites on the small end: 0.7 x 10 = 7 would be unreadable.
    expect(getCheckboxIconSize(10)).toBe(10);
    expect(getCheckboxIconSize(4)).toBe(10);
  });
});

describe('CheckboxBox — the radius law', () => {
  it('caps every token stop at $2, which is the documented maximum', () => {
    expect(CHECKBOX_GLYPH_MAX_RADIUS_TOKEN).toBe(2);
    expect(clampCheckboxGlyphRadius('$1')).toBe('$1');
    expect(clampCheckboxGlyphRadius('$2')).toBe('$2');
    for (const token of ['$3', '$4', '$6', '$8', '$10', '$12']) {
      expect(clampCheckboxGlyphRadius(token), token).toBe('$2');
    }
  });

  it('goes hard-angled for pointy and for $0, and pointy wins over any stop', () => {
    expect(clampCheckboxGlyphRadius('$0')).toBe(0);
    expect(clampCheckboxGlyphRadius('$12', { pointy: true })).toBe(0);
    expect(clampCheckboxGlyphRadius('$1', { pointy: true })).toBe(0);
    expect(clampCheckboxGlyphRadius(undefined, { pointy: true })).toBe(0);
    // pointy:false is not pointy — it must not swallow the stop.
    expect(clampCheckboxGlyphRadius('$1', { pointy: false })).toBe('$1');
  });

  it('passes a non-token value through untouched', () => {
    expect(clampCheckboxGlyphRadius('4px')).toBe('4px');
  });

  it('RULE GAP: an absent token falls back to $4, above the documented $2 cap', () => {
    // This is the module's own shared clamp fallback (clampRadius(..., "$4")),
    // and it contradicts the comment three lines above it in CheckboxBox.tsx:
    // "$4 (9) already paints as a circle on that box". Asserted as OBSERVED
    // behaviour, deliberately not "fixed" here — which of the two is right is
    // an open design decision, not something to guess at.
    expect(clampCheckboxGlyphRadius(undefined)).toBe('$4');
    // The live caller always passes a resolved knob token, so the gap is in
    // the exported contract, not in what the Checkbox renders today.
  });

  it('calls a radius circular exactly at half the side, not before', () => {
    expect(isCircularCheckboxRadius(9, 20)).toBe(false);
    expect(isCircularCheckboxRadius(10, 20)).toBe(true);
    expect(isCircularCheckboxRadius(11, 20)).toBe(true);
    expect(isCircularCheckboxRadius(0, 20)).toBe(false);
  });

  it('refuses to answer for a zero or negative side', () => {
    expect(isCircularCheckboxRadius(10, 0)).toBe(false);
    expect(isCircularCheckboxRadius(10, -20)).toBe(false);
  });

  it('keeps the capped stop non-circular on a real glyph, which is the point of the cap', () => {
    // $2 = 5px on the house radius scale, glyph ~20px: 5 < 10, so square.
    expect(isCircularCheckboxRadius(5, 20)).toBe(false);
    // $4 = 9px would not be, which is why the cap exists.
    expect(isCircularCheckboxRadius(9, 18)).toBe(true);
  });
});

describe('CheckboxBox — the 44px frame paints nothing', () => {
  it('is a 44px square with no border, no radius and no fill', () => {
    expect(checkboxTargetFrameProps.width).toBe(CHECKBOX_TARGET_PX);
    expect(checkboxTargetFrameProps.height).toBe(CHECKBOX_TARGET_PX);
    expect(checkboxTargetFrameProps.minWidth).toBe(CHECKBOX_TARGET_PX);
    expect(checkboxTargetFrameProps.minHeight).toBe(CHECKBOX_TARGET_PX);
    expect(checkboxTargetFrameProps.borderWidth).toBe(0);
    expect(checkboxTargetFrameProps.borderRadius).toBe(0);
    expect(checkboxTargetFrameProps.padding).toBe(0);
    expect(checkboxTargetFrameProps.backgroundColor).toBe('transparent');
    expect(checkboxTargetFrameProps.outlineWidth).toBe(0);
  });

  it('keeps every interaction channel transparent, so no wash can wrap the label', () => {
    for (const state of ['hoverStyle', 'pressStyle', 'focusStyle', 'focusVisibleStyle', 'activeStyle'] as const) {
      const bag = checkboxTargetFrameProps[state] as Record<string, unknown>;
      expect(bag.backgroundColor, state).toBe('transparent');
      expect(bag.borderColor, state).toBe('transparent');
    }
    expect(checkboxTargetFrameProps.focusStyle.outlineWidth).toBe(0);
    expect(checkboxTargetFrameProps.focusVisibleStyle.outlineWidth).toBe(0);
  });
});

describe('CheckboxBox — keyboard-modality focus handlers', () => {
  it('raises kbFocus on a focus that followed a key press', () => {
    const setKbFocus = vi.fn();
    const handlers = checkboxKbFocusHandlers(setKbFocus, vi.fn());
    pressKey();
    handlers.onFocus?.({});
    expect(setKbFocus).toHaveBeenCalledWith(true);
  });

  it('stays quiet on a focus that followed a pointer press', () => {
    const setKbFocus = vi.fn();
    const handlers = checkboxKbFocusHandlers(setKbFocus, vi.fn());
    pressPointer();
    handlers.onFocus?.({});
    expect(setKbFocus).not.toHaveBeenCalled();
  });

  it('always clears kbFocus on blur, whatever the modality was', () => {
    const setKbFocus = vi.fn();
    const handlers = checkboxKbFocusHandlers(setKbFocus, vi.fn());
    pressPointer();
    handlers.onBlur?.({});
    expect(setKbFocus).toHaveBeenCalledWith(false);
  });

  it('tracks hover in and out', () => {
    const setHovered = vi.fn();
    const handlers = checkboxKbFocusHandlers(vi.fn(), setHovered);
    handlers.onHoverIn?.({});
    expect(setHovered).toHaveBeenLastCalledWith(true);
    handlers.onHoverOut?.({});
    expect(setHovered).toHaveBeenLastCalledWith(false);
  });

  it("forwards the caller's own handlers instead of swallowing them", () => {
    const rest = {
      onFocus: vi.fn(),
      onBlur: vi.fn(),
      onHoverIn: vi.fn(),
      onHoverOut: vi.fn(),
    };
    const handlers = checkboxKbFocusHandlers(vi.fn(), vi.fn(), rest);
    const event = { id: 1 };
    handlers.onFocus?.(event);
    handlers.onBlur?.(event);
    handlers.onHoverIn?.(event);
    handlers.onHoverOut?.(event);
    expect(rest.onFocus).toHaveBeenCalledWith(event);
    expect(rest.onBlur).toHaveBeenCalledWith(event);
    expect(rest.onHoverIn).toHaveBeenCalledWith(event);
    expect(rest.onHoverOut).toHaveBeenCalledWith(event);
  });

  it('survives a caller that passes no handlers at all', () => {
    const handlers = checkboxKbFocusHandlers(vi.fn(), vi.fn());
    expect(() => {
      handlers.onFocus?.({});
      handlers.onBlur?.({});
      handlers.onHoverIn?.({});
      handlers.onHoverOut?.({});
    }).not.toThrow();
  });
});

describe('CheckboxGlyphBox — the painted box', () => {
  it('marks itself so the boards and the other specs can find it', () => {
    const { container } = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    expect(glyph(container)).toBeTruthy();
  });

  it('never takes the press, so the 44px frame keeps the responder', () => {
    const { container } = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    expect(cssOf(glyph(container), 'pointer-events')).toBe('none');
  });

  it('publishes the focus-ring flag only while kbFocus is true', () => {
    const off = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    expect(glyph(off.container).getAttribute('data-focus-ring')).toBeNull();
    cleanup();
    const on = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus borderWidth={2} borderRadius={5} />,
    );
    expect(glyph(on.container).getAttribute('data-focus-ring')).toBe('true');
  });

  it('is an empty box when idle and drops that transparency when marked', () => {
    const unmarked = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    expect(classesOf(glyph(unmarked.container))).toContain('_bg-transparent');
    cleanup();
    const marked = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    // Checked paints the MARK channel (formSelectedColors.mark), so the
    // transparent fill is gone. The mark token is an accent value the test
    // config does not resolve, which is exactly why this asserts the absence
    // of the idle fill rather than a colour literal.
    expect(classesOf(glyph(marked.container))).not.toContain('_bg-transparent');
  });

  it('takes the checked border off the boundary ramp entirely, so it is a fill and not a second outline', () => {
    const { container } = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    const painted = classesOf(glyph(container));
    expect(painted).not.toContain('_btc-color10');
    expect(painted).not.toContain('_btc-color11');
  });

  it('moves the idle border from the boundary tier to the press tier on hover', () => {
    // formControlColors.boundary = $color10 (the edge that carries the
    // shape, >=3:1), thumb.press = $color11.
    const idle = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} borderWidth={2} borderRadius={5} />,
    );
    expect(classesOf(glyph(idle.container))).toContain('_btc-color10');
    cleanup();
    const hovered = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked={false} kbFocus={false} hovered borderWidth={2} borderRadius={5} />,
    );
    expect(classesOf(glyph(hovered.container))).toContain('_btc-color11');
  });

  it('takes its geometry from the props rather than a hardcoded box', () => {
    const { container } = renderWithProviders(
      <CheckboxGlyphBox glyphSize={26} isMarked={false} kbFocus={false} borderWidth={3} borderRadius={7} />,
    );
    const node = glyph(container);
    expect(cssOf(node, 'width')).toBe('26px');
    expect(cssOf(node, 'height')).toBe('26px');
    expect(cssOf(node, 'border-top-width')).toBe('3px');
    expect(classesOf(node)).toContain('_btlr-7px');
  });

  it('renders the check mark it is handed', () => {
    const { container } = renderWithProviders(
      <CheckboxGlyphBox glyphSize={20} isMarked kbFocus={false} borderWidth={2} borderRadius={5}>
        <span data-mark>x</span>
      </CheckboxGlyphBox>,
    );
    expect(container.querySelector('[data-mark]')).toBeTruthy();
  });
});
