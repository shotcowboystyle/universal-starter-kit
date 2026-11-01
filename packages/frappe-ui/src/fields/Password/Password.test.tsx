import { renderWithProviders } from '@repo/test-utils';
import { SIZE_RECIPE_TOKENS, sizeRecipeForToken } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Password } from './index';

const revealOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[aria-label='Show password'], [aria-label='Hide password']");

describe('Password reveal', () => {
  it('toggle is a real tab stop and rings its own glyph, not the 44px box', () => {
    const result = renderWithProviders(
      <Password
        label="Secret"
        value="hunter2"
      />,
    );
    const input = result.container.querySelector('input');
    const reveal = revealOf(result.container);
    if (!input || !reveal) {
      throw new Error('input or reveal not found');
    }

    expect(input.getAttribute('type')).toBe('password');
    expect(reveal.getAttribute('tabindex')).toBe('0');
    expect(reveal.className).toMatch(/mp-chip-dismiss/u);
    expect(reveal.className).not.toMatch(/mp-chip-dismiss-ring/u);
    const ring = reveal.querySelector('.mp-chip-dismiss-ring');
    expect(ring).not.toBeNull();
    expect(reveal.contains(ring)).toBe(true);

    const extraStops = [...result.container.querySelectorAll("[tabindex='0']")].filter(
      (el) => el !== input && el !== reveal,
    );
    expect(extraStops).toHaveLength(0);
    expect(result.container.querySelector('.mp-composite-ring')).toBeTruthy();
  });

  it('toggling does not move the caret or change the control geometry', () => {
    const result = renderWithProviders(
      <Password
        label="Secret"
        value="hunter2"
      />,
    );
    const input = result.container.querySelector('input');
    const box = result.container.querySelector<HTMLElement>("[data-ring-target='box']");
    const reveal = revealOf(result.container);
    if (!input || !box || !reveal) {
      throw new Error('anatomy missing');
    }

    const heightBefore = box.dataset.visualHeight;
    const endCapBefore = reveal.dataset.endCap;
    input.focus();
    input.setSelectionRange(3, 3);
    expect(input.selectionStart).toBe(3);

    fireEvent.click(reveal);

    expect(input.getAttribute('type')).toBe('text');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
    expect(document.activeElement).toBe(input);
    expect(box.dataset.visualHeight).toBe(heightBefore);
    expect(revealOf(result.container)?.dataset.endCap).toBe(endCapBefore);
  });

  it("default size stays 44 tall with the toggle present (not Bento's 46)", () => {
    const result = renderWithProviders(
      <Password
        label="Secret"
        value="hunter2"
      />,
    );
    const box = result.container.querySelector<HTMLElement>("[data-ring-target='box']");
    const reveal = revealOf(result.container);
    if (!box || !reveal) {
      throw new Error('box or reveal not found');
    }
    expect(box.dataset.visualHeight).toBe('44');
    expect(reveal.dataset.endCap).toBe('44');
    expect(box.dataset.visualHeight).not.toBe('46');
  });

  it('reveal state is announced and resets to masked when the field loses value', () => {
    const onChange = vi.fn<(value: string) => void>();
    const Harness = () => {
      const [value, setValue] = useState('hunter2');
      return (
        <Password
          label="Secret"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    };
    const result = renderWithProviders(<Harness />);
    const input = result.container.querySelector('input');
    const reveal = revealOf(result.container);
    if (!input || !reveal) {
      throw new Error('input or reveal not found');
    }

    expect(reveal.getAttribute('aria-label')).toBe('Show password');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(reveal);
    const shown = revealOf(result.container);
    if (!shown) {
      throw new Error('reveal missing after toggle');
    }
    expect(input.getAttribute('type')).toBe('text');
    expect(shown.getAttribute('aria-label')).toBe('Hide password');
    expect(shown.getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('');
    expect(input.getAttribute('type')).toBe('password');
    const reset = revealOf(result.container);
    expect(reset?.getAttribute('aria-label')).toBe('Show password');
    expect(reset?.getAttribute('aria-pressed')).toBe('false');
  });

  it('reveal renders at every size step from the size recipe', () => {
    for (const token of SIZE_RECIPE_TOKENS) {
      if (token === '$true') {
        continue;
      }
      const { height } = sizeRecipeForToken(token);
      const result = renderWithProviders(
        <Password
          label="Secret"
          value="secret"
          size={token}
        />,
      );
      const box = result.container.querySelector<HTMLElement>("[data-ring-target='box']");
      const reveal = revealOf(result.container);
      if (!box || !reveal) {
        throw new Error(`anatomy missing at ${token}`);
      }
      expect(box.dataset.visualHeight, token).toBe(String(height));
      expect(reveal.dataset.endCap, token).toBe(String(height));
    }
  });
});
