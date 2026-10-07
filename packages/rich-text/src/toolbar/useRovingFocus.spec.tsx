import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useRovingFocus } from './useRovingFocus';

function Toolbar({ disabledSecond = false }: { disabledSecond?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useRovingFocus(ref);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Test toolbar">
      <button type="button">one</button>
      <button
        type="button"
        disabled={disabledSecond}>
        two
      </button>
      <button type="button">three</button>
    </div>
  );
}

/** Tamagui Buttons render as <div role="button">, not <button> */
function DivToolbar() {
  const ref = useRef<HTMLDivElement>(null);
  useRovingFocus(ref);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Div toolbar">
      <div
        role="button"
        tabIndex={0}>
        bold
      </div>
      <div
        role="button"
        tabIndex={0}>
        italic
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled="true">
        redo
      </div>
      <div
        role="button"
        tabIndex={0}>
        undo
      </div>
    </div>
  );
}

describe(useRovingFocus, () => {
  it('handles div[role=button] controls (Tamagui Button shape)', () => {
    const { getAllByRole, getByRole } = render(<DivToolbar />);
    const buttons = getAllByRole('button');
    // aria-disabled control is excluded from the roving order entirely
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, 0, -1]);
    buttons[0].focus();
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    // skips the aria-disabled control
    expect(document.activeElement).toBe(buttons[3]);
  });

  it('makes the toolbar a single tab stop (first button 0, rest -1)', () => {
    const { getAllByRole } = render(<Toolbar />);
    const buttons = getAllByRole('button');
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves focus with ArrowRight and wraps', () => {
    const { getAllByRole, getByRole } = render(<Toolbar />);
    const [first, second, third] = getAllByRole('button');
    first.focus();
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(first);
  });

  it('moves focus with ArrowLeft (reverse) and Home/End', () => {
    const { getAllByRole, getByRole } = render(<Toolbar />);
    const [first, _second, third] = getAllByRole('button');
    first.focus();
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(getByRole('toolbar'), { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(getByRole('toolbar'), { key: 'End' });
    expect(document.activeElement).toBe(third);
  });

  it('skips disabled controls', () => {
    const { getAllByRole, getByRole } = render(<Toolbar disabledSecond />);
    const [first, _second, third] = getAllByRole('button');
    first.focus();
    fireEvent.keyDown(getByRole('toolbar'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(third);
  });

  it('updates the tab stop when focus lands on a control', () => {
    const { getAllByRole } = render(<Toolbar />);
    const buttons = getAllByRole('button');
    fireEvent.focusIn(buttons[2]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
  });
});
