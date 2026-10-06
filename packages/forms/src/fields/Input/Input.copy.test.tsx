import { renderWithProviders } from '@repo/test-utils';
import { SIZE_RECIPE_TOKENS, sizeRecipeForToken } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './index';

const copyOf = (container: HTMLElement) => container.querySelector<HTMLElement>("[aria-label='Copy to clipboard']");

describe('Input copy (CopyField slot)', () => {
  it('copy is a real tab stop and rings its own glyph, not the 44px box', () => {
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        label="API token"
        value="mpo_live_4f2a9c81e0b3"
      />,
    );
    const input = result.container.querySelector('input')!;
    const copy = copyOf(result.container);
    if (copy === null) {
      throw new Error('input or copy not found');
    }

    expect(input.getAttribute('aria-readonly')).toBe('true');
    expect(copy.getAttribute('tabindex')).toBe('0');
    expect(copy.getAttribute('aria-label')).toBe('Copy to clipboard');
    expect(copy.className).toMatch(/mp-chip-dismiss/u);
    expect(copy.className).not.toMatch(/mp-chip-dismiss-ring/u);
    const ring = copy.querySelector('.mp-chip-dismiss-ring');
    expect(ring).not.toBeNull();
    expect(copy.contains(ring)).toBe(true);

    const extraStops = [...result.container.querySelectorAll("[tabindex='0']")].filter(
      (el) => el !== input && el !== copy,
    );
    expect(extraStops).toHaveLength(0);
    expect(result.container.querySelector('.mp-composite-ring')).toBeTruthy();
  });

  it('empty omits the cap so there is one tab stop', () => {
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        label="Webhook URL"
        value=""
      />,
    );
    expect(copyOf(result.container)).toBeNull();
    const input = result.container.querySelector('input')!;
    expect(input).not.toBeNull();
    const stops = [...result.container.querySelectorAll("[tabindex='0']")].filter((el) => el !== input);
    expect(stops).toHaveLength(0);
  });

  it('disabled keeps geometry and drops the second tab stop', () => {
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        disabled
        label="API token"
        value="mpo_live_4f2a9c81e0b3"
      />,
    );
    const copy = copyOf(result.container);
    if (copy === null) {
      throw new Error('copy missing when disabled');
    }
    expect(copy.dataset.endCap).toBe('44');
    expect(copy.getAttribute('tabindex')).toBe('-1');
  });

  it('default size stays 44 tall with the copy cap present', () => {
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        label="API token"
        value="mpo_live_4f2a9c81e0b3"
      />,
    );
    const box = result.container.querySelector<HTMLElement>("[data-ring-target='box']")!;
    const copy = copyOf(result.container);
    if (copy === null) {
      throw new Error('box or copy not found');
    }
    expect(box.dataset.visualHeight).toBe('44');
    expect(copy.dataset.endCap).toBe('44');
  });

  it('copy cap tracks the size recipe at every step', () => {
    for (const token of SIZE_RECIPE_TOKENS) {
      if (token === '$true') {
        continue;
      }
      const { height } = sizeRecipeForToken(token);
      const result = renderWithProviders(
        <Input
          copy
          readOnly
          label="API token"
          value="secret"
          size={token}
        />,
      );
      const box = result.container.querySelector<HTMLElement>("[data-ring-target='box']")!;
      const copy = copyOf(result.container);
      if (copy === null) {
        throw new Error(`anatomy missing at ${token}`);
      }
      expect([token, box.dataset.visualHeight]).toStrictEqual([token, String(height)]);
      expect([token, copy.dataset.endCap]).toStrictEqual([token, String(height)]);
    }
  });

  it('identifier value rides the mono register', () => {
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        label="API token"
        value="mpo_live_4f2a9c81e0b3"
      />,
    );
    const input = result.container.querySelector('input')!;
    expect(input.dataset.register).toBe('identifier');
  });

  it('pressing copy writes the value to the clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });
    const onCopyResult = vi.fn<(ok: boolean) => void>();
    const result = renderWithProviders(
      <Input
        copy
        readOnly
        label="API token"
        value="mpo_live_4f2a9c81e0b3"
        onCopyResult={onCopyResult}
      />,
    );
    const copy = copyOf(result.container);
    if (copy === null) {
      throw new Error('copy missing');
    }
    fireEvent.click(copy);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('mpo_live_4f2a9c81e0b3');
    });
    await vi.waitFor(() => {
      expect(onCopyResult).toHaveBeenCalledWith(true);
    });
  });
});
