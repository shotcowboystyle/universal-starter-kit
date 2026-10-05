import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFeedback, resetFeedback } from '../../feedback/store';
import { getToasts, resetToasts } from '../../Toast/store';

import { CodeBlock } from './index';

vi.mock('../Highlighter', () => ({
  useShikiTokens: (code: string) => code.split('\n').map((line: string) => [{ content: line }]),
}));

function copyOf(container: HTMLElement) {
  return container.querySelector("[aria-label='Copy to clipboard']");
}

const SAMPLE = 'export const token = "mpo_live_4f2a…";';
const writeText = vi.fn();

describe('CodeBlock copy (Input.Button + notify)', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...(typeof navigator !== 'undefined' ? navigator : {}),
      clipboard: { writeText },
    });
    resetToasts();
    resetFeedback();
  });

  afterEach(() => {
    resetToasts();
    resetFeedback();
  });

  it('copy is a real tab stop that rings its glyph and stays visible at compact widths', () => {
    const result = renderWithProviders(<CodeBlock>{SAMPLE}</CodeBlock>);
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    expect(copy.getAttribute('tabindex')).toBe('0');
    expect(copy.className).toMatch(/mp-chip-dismiss/);
    expect(copy.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
    expect(copy.getAttribute('data-end-cap')).toBe('44');
    const style = getComputedStyle(copy);
    expect(style.display).not.toBe('none');
  });

  it('empty code omits the copy cap', () => {
    const result = renderWithProviders(<CodeBlock />);
    expect(copyOf(result.container)).toBeNull();
  });

  it('disableCopy omits the copy cap', () => {
    const result = renderWithProviders(<CodeBlock disableCopy>{SAMPLE}</CodeBlock>);
    expect(copyOf(result.container)).toBeNull();
  });

  it('end-cap tracks size while code text stays knob-immune', () => {
    const small = renderWithProviders(
      <Preset cascade={false} overrides={{ bodyFont: 'serif', fontWeight: 'bold', size: 'small' }}>
        <CodeBlock size="$3">{SAMPLE}</CodeBlock>
      </Preset>,
    );
    const large = renderWithProviders(
      <Preset cascade={false} overrides={{ bodyFont: 'serif', fontWeight: 'bold', size: 'large' }}>
        <CodeBlock size="$5">{SAMPLE}</CodeBlock>
      </Preset>,
    );
    expect(copyOf(small.container)?.getAttribute('data-end-cap')).toBe('36');
    expect(copyOf(large.container)?.getAttribute('data-end-cap')).toBe('52');

    for (const result of [small, large]) {
      const code = result.container.querySelector("[data-register='code']") as HTMLElement | null;
      if (!code) {
        throw new Error('code node missing');
      }
      expect(code.getAttribute('data-register')).toBe('code');
      const tracking = code.style.letterSpacing || getComputedStyle(code).letterSpacing;
      expect(tracking === '0px' || tracking === '0' || tracking === 'normal').toBe(true);
      expect(result.container.textContent).toContain('export const token');
    }
  });

  it('success confirm is notify() toast Copied to clipboard. and the glyph does not flip', async () => {
    const result = renderWithProviders(<CodeBlock>{SAMPLE}</CodeBlock>);
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    fireEvent.click(copy);
    await vi.waitFor(() => {
      expect(getToasts()).toHaveLength(1);
    });
    expect(getToasts()[0]?.title).toBe('Copied to clipboard.');
    expect(getToasts()[0]?.intent).toBe('success');
    expect(getToasts()[0]?.title).not.toMatch(/success/i);
    expect(getFeedback()).toHaveLength(0);
    expect(copyOf(result.container)?.getAttribute('aria-label')).toBe('Copy to clipboard');
  });

  it('copy denied is field-scoped Copy failed. and never a toast', async () => {
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const result = renderWithProviders(<CodeBlock>{SAMPLE}</CodeBlock>);
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    fireEvent.click(copy);
    await vi.waitFor(() => {
      expect(getFeedback()).toHaveLength(1);
    });
    expect(getToasts()).toHaveLength(0);
    expect(getFeedback()[0]?.body).toBe('Copy failed.');
    expect(getFeedback()[0]?.scope).toBe('field');
    expect(getFeedback()[0]?.surface).toBe('alert');
  });

  it('keeps failures with their block and clears them on a successful retry', async () => {
    const result = renderWithProviders(
      <>
        <div data-testid="first-code">
          <CodeBlock>const first = 1;</CodeBlock>
        </div>
        <div data-testid="second-code">
          <CodeBlock>const second = 2;</CodeBlock>
        </div>
      </>,
    );
    const first = result.getByTestId('first-code');
    const second = result.getByTestId('second-code');
    writeText.mockRejectedValueOnce(new Error('Denied'));
    fireEvent.click(copyOf(first)!);
    await vi.waitFor(() => {
      expect(first.textContent).toContain('Copy failed.');
    });
    expect(second.textContent).not.toContain('Copy failed.');
    fireEvent.click(copyOf(first)!);
    await vi.waitFor(() => {
      expect(first.textContent).not.toContain('Copy failed.');
    });
    expect(getFeedback()).toHaveLength(0);
    expect(getToasts()).toHaveLength(1);
  });
});
