import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { DrawnIcon, Icon } from './index';

describe('Icon', () => {
  it('renders an icon control, not an unsupported-type string', () => {
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" />);
    const text = result.container.textContent ?? '';
    expect(text).not.toMatch(/Unsupported field type/);
    expect(result.container.querySelector('[data-testid="icon-field"]')).toBeTruthy();
    const input = result.container.querySelector('input');
    expect(input?.value).toBe('mail');
  });

  it('shows a dashed well when empty', () => {
    const result = renderWithProviders(<Icon label="Workspace icon" placeholder="Choose an icon" />);
    expect(result.container.querySelector('[data-testid="icon-empty-well"]')).toBeTruthy();
    const input = result.container.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('Choose an icon');
  });

  it('read-only renders the glyph well without a picker trigger', () => {
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" readOnly />);
    expect(result.container.querySelector('[data-testid="icon-field-readonly"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="icon-field"]')).toBeNull();
    expect(result.container.textContent ?? '').not.toMatch(/Unsupported field type/);
  });

  it('opens a FloatingPanel grid and commits a drawn-set pick', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <Icon label="Workspace icon" value="" placeholder="Choose an icon" onChange={onChange} />,
    );

    const input = result.container.querySelector('input');
    expect(input).toBeTruthy();
    await act(async () => {
      if (input) {
        fireEvent.click(input);
      }
    });

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="icon-panel"]')).toBeTruthy();
    });

    const mail = document.body.querySelector('[data-testid="icon-option-mail"]');
    expect(mail).toBeTruthy();
    await act(async () => {
      if (mail) {
        fireEvent.click(mail);
      }
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('mail');
    });
  });

  it('uses fixed glyph cells and keeps search and selection working', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" onChange={onChange} />);
    const input = result.container.querySelector('input')!;
    fireEvent.click(input);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="icon-panel"]')).toBeTruthy();
    });
    for (const cell of document.querySelectorAll('[data-testid^="icon-option-"]')) {
      // Tamagui extracts literal geometry into atomic classes in this test build.
      expect(cell).toHaveClass('_w-64px');
      expect(cell.firstElementChild).toHaveClass('_h-60px');
    }
    fireEvent.change(input, { target: { value: 'chev' } });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid^="icon-option-"]')).toHaveLength(4);
    });
    expect(input.value).toBe('chev');
    fireEvent.click(document.querySelector('[data-testid="icon-option-chev-u"]')!);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('chev-u');
    });
    expect(input.value).toBe('mail');
  });

  it('does not paint typed icon glyphs in the trigger', () => {
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" />);
    const text = result.container.textContent ?? '';
    for (const glyph of ['∨', '∧', '✓', '×', '▸', '☰']) {
      expect(text).not.toContain(glyph);
    }
    expect(result.container.querySelector('svg')).toBeTruthy();
  });

  it('keeps desktop option semantics without adding a second search field', async () => {
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" />);
    fireEvent.click(result.container.querySelector('input')!);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="icon-panel"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="icon-sheet-search"]')).toBeNull();
    expect(document.querySelector('[data-testid="icon-option-mail"]')).toHaveAttribute('role', 'option');
    expect(document.querySelector('[data-testid="icon-option-mail"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('lets a narrow sheet search, commit and reopen with a cleared query', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    const onChange = vi.fn();
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" onChange={onChange} />);
    try {
      const input = result.container.querySelector('input')!;
      fireEvent.click(input);
      const search = await waitFor(() => {
        const element = document.querySelector<HTMLInputElement>('[data-testid="icon-sheet-search"]');
        expect(element).toBeTruthy();
        return element!;
      });
      fireEvent.change(search, { target: { value: 'chev' } });
      await waitFor(() => {
        expect(document.querySelectorAll('[data-testid^="icon-option-"]')).toHaveLength(4);
      });
      fireEvent.click(document.querySelector('[data-testid="icon-option-chev-u"]')!);
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith('chev-u');
      });
      fireEvent.click(input);
      await waitFor(() => {
        expect(document.querySelectorAll('[data-testid^="icon-option-"]')).toHaveLength(16);
      });
      expect(document.querySelector<HTMLInputElement>('[data-testid="icon-sheet-search"]')?.value).toBe('');
      fireEvent.click(result.getByLabelText('Clear icon'));
      expect(onChange).toHaveBeenCalledWith('');
    } finally {
      result.unmount();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('returns focus after a sheet pick without reopening and supports keyboard reopening', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    const onChange = vi.fn();
    const result = renderWithProviders(<Icon label="Workspace icon" onChange={onChange} />);
    try {
      const input = result.container.querySelector('input')!;
      await act(async () => {
        input.focus();
      });
      const search = await waitFor(() => {
        const element = document.querySelector<HTMLInputElement>('[data-testid="icon-sheet-search"]');
        expect(element).toBeTruthy();
        return element!;
      });
      await act(async () => {
        search.focus();
      });
      fireEvent.change(search, { target: { value: 'chev' } });
      fireEvent.click(document.querySelector('[data-testid="icon-option-chev-u"]')!);
      expect(onChange).toHaveBeenCalledWith('chev-u');
      await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input).toHaveAttribute('aria-expanded', 'true');
    } finally {
      result.unmount();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('returns desktop pick focus even when pointer capture opened before the input focused', async () => {
    const result = renderWithProviders(<Icon label="Workspace icon" />);
    const input = result.container.querySelector('input')!;
    expect(document.activeElement).not.toBe(input);
    fireEvent.click(input);
    const option = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-testid="icon-option-mail"]');
      expect(element).toBeTruthy();
      return element!;
    });
    fireEvent.click(option);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(input);
  });

  it('does not reclaim focus after dismissal onto another field', async () => {
    const result = renderWithProviders(
      <>
        <Icon label="Workspace icon" />
        <input aria-label="Next field" />
      </>,
    );
    const input = result.container.querySelector('input')!;
    await act(async () => {
      input.focus();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="icon-panel"]')).toBeTruthy();
    });
    const next = result.getByLabelText('Next field');
    await act(async () => {
      next.focus();
    });
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(next);
  });

  it('allows fresh focus entry after the restore window when the calendar clock is frozen', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_768_478_400_000);
    const result = renderWithProviders(<Icon label="Workspace icon" />);
    try {
      const input = result.container.querySelector('input')!;
      fireEvent.click(input);
      await waitFor(() => {
        expect(document.querySelector('[data-testid="icon-option-mail"]')).toBeTruthy();
      });
      fireEvent.click(document.querySelector('[data-testid="icon-option-mail"]')!);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 500)));
      expect(input).toHaveAttribute('aria-expanded', 'false');
      await act(async () => {
        input.blur();
      });
      await act(async () => {
        input.focus();
      });
      expect(input).toHaveAttribute('aria-expanded', 'true');
    } finally {
      result.unmount();
      clock.mockRestore();
    }
  });

  // A glyph outside InputParts.Icon has nothing injecting a colour, and
  // `currentColor` does not cascade on react-native-svg: iOS resolved it to nil
  // and Core Graphics then painted with whatever stroke was last in the
  // context. Every paint has to leave here as a concrete value.
  it('paints the readOnly glyph with a resolved colour, never currentColor', () => {
    const result = renderWithProviders(<Icon label="Workspace icon" value="mail" readOnly />);
    const svg = result.container.querySelector('svg');
    expect(svg).toBeTruthy();
    const color = svg?.getAttribute('color');
    expect(color).toBeTruthy();
    expect(color).not.toBe('currentColor');
    // No token survives to the renderer either: "$color11" is not a paint.
    expect(color?.startsWith('$')).toBe(false);
    const strokes = Array.from(svg?.querySelectorAll('[stroke]') ?? []).map((el) => el.getAttribute('stroke'));
    expect(strokes.length).toBeGreaterThan(0);
    for (const stroke of strokes) {
      expect(stroke).not.toBe('currentColor');
      expect(stroke?.startsWith('$')).toBe(false);
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme} resolves default, token, and filled glyph paint`, () => {
      const { container } = renderWithProviders(
        <Theme name={scheme}>
          <DrawnIcon name="mail" />
          <DrawnIcon name="mail" color="$color11" />
          <DrawnIcon name="mail" color="currentColor" />
          <DrawnIcon name="grip" color="$unknownIconToken" />
          <DrawnIcon name="mail" color="rebeccapurple" />
        </Theme>,
      );
      const svgs = Array.from(container.querySelectorAll('svg'));
      const ink = svgs[0].getAttribute('color');
      expect(ink).toBeTruthy();
      expect(ink).not.toMatch(/^(currentColor|\$)/);
      for (const svg of svgs.slice(0, 4)) {
        expect(svg.getAttribute('color')).toBe(ink);
        for (const part of svg.querySelectorAll('[stroke], [fill]')) {
          for (const attr of ['stroke', 'fill']) {
            const paint = part.getAttribute(attr);
            if (paint && paint !== 'none') {
              expect(paint).toBe(ink);
            }
          }
        }
      }
      expect(svgs[4].getAttribute('color')).toBe('rebeccapurple');
    });
  }
});
