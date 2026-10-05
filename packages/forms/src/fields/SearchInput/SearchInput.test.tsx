import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { SIZE_RECIPE_TOKENS, sizeRecipeForToken } from '@repo/theme';
import { fireEvent } from '@testing-library/react';
import { useTheme } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { SearchInput } from './index';

const SEARCH_INPUT_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a searchbox with placeholder and leading icon', () => {
    const result = renderWithProviders(<SearchInput placeholder="Search things" />);
    const input = result.container.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('Search things');
    expect(input?.getAttribute('role')).toBe('searchbox');
    expect(input?.getAttribute('aria-label')).toBe('Search');
    expect(result.container.querySelector('svg')).toBeTruthy();
  });

  it('uses readable glyph ink for search and clear rather than the boundary ramp', () => {
    let expectedInk = '';
    function Sample() {
      const theme = useTheme();
      expectedInk = String(theme.color11?.val);
      return <SearchInput placeholder="Search things" defaultValue="corp" />;
    }
    const { container } = renderWithProviders(<Sample />);
    const glyphs = container.querySelectorAll('svg');
    expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) {
      expect(glyph.getAttribute('fill')).toBe(expectedInk);
    }
  });

  it('bidi-isolates the default placeholder and passes explicit ones through', () => {
    // Default: FSI…PDI framing so the trailing "..." cannot reorder to
    // "…Search" under RTL; the visible run stays byte-identical inside.
    const result = renderWithProviders(<SearchInput />);
    const input = result.container.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('\u2068Search...\u2069');
    // Explicit placeholders are the consumer's interpolation site — the
    // component must not double-wrap or mutate them (asserted above too).
    expect(input?.getAttribute('placeholder')?.slice(1, -1)).toBe('Search...');
  });

  it('fires onChange per keystroke and onSearch after debounce', () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput onChange={onChange} onSearch={onSearch} debounceMs={300} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid keystrokes into one onSearch', () => {
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput onSearch={onSearch} debounceMs={300} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'a' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'ab' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'abc' } });
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');
  });

  it('debounceMs=0 fires onSearch synchronously', () => {
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput onSearch={onSearch} debounceMs={0} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'now' } });
    expect(onSearch).toHaveBeenCalledWith('now');
  });

  it('shows clear button only when there is text; clearing empties and fires immediately', () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput onChange={onChange} onSearch={onSearch} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    expect(result.container.querySelector("[aria-label='Clear search']")).toBeNull();
    fireEvent.change(input, { target: { value: 'abc' } });
    const clear = result.container.querySelector("[aria-label='Clear search']");
    if (!clear) {
      throw new Error('clear button not rendered');
    }
    fireEvent.click(clear);
    expect(onChange).toHaveBeenLastCalledWith('');
    // clear fires onSearch immediately, no debounce wait
    expect(onSearch).toHaveBeenCalledWith('');
    expect(input.value).toBe('');
    // pending "abc" debounce was cancelled
    vi.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalledWith('abc');
  });

  it('onClear fires on the clear affordance and on Escape, not on typed emptiness', () => {
    // Consumers (DataTableToolbar) hang side effects like clearFilters off
    // explicit clear intent; backspacing to "" must not trigger it.
    const onClear = vi.fn();
    const result = renderWithProviders(<SearchInput onClear={onClear} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.change(input, { target: { value: '' } });
    vi.advanceTimersByTime(1000);
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'abc' } });
    const clear = result.container.querySelector("[aria-label='Clear search']");
    if (!clear) {
      throw new Error('clear button not rendered');
    }
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: 'again' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it('clear button is keyboard-reachable (tabIndex + Enter)', async () => {
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput defaultValue="abc" onSearch={onSearch} />);
    const clear = result.container.querySelector("[aria-label='Clear search']");
    if (!clear) {
      throw new Error('clear button not rendered');
    }
    expect(clear.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(clear, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('one ring box; magnifier is not a tab stop; clear is the second focusable', () => {
    const result = renderWithProviders(<SearchInput defaultValue="abc" />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    expect(result.container.querySelector('.mp-composite-ring')).toBeTruthy();
    expect(input.className).toMatch(/mp-input-area/);
    expect(input.className).toMatch(/mp-search-input/);
    expect(input.getAttribute('type')).toBe('search');
    const leading = result.container.querySelector('.mp-search-leading');
    expect(leading).toBeTruthy();
    expect(leading?.getAttribute('tabindex')).toBe('-1');
    expect(leading?.getAttribute('aria-hidden')).toBe('true');
    const clear = result.container.querySelector("[aria-label='Clear search']");
    if (!clear) {
      throw new Error('clear button not rendered');
    }
    expect(clear.getAttribute('tabindex')).toBe('0');
    expect(clear.className).toMatch(/mp-chip-dismiss/);
    expect(clear.className).not.toMatch(/mp-chip-dismiss-ring/);
    const ring = clear.querySelector('.mp-chip-dismiss-ring');
    expect(ring).not.toBeNull();
    expect(clear.contains(ring)).toBe(true);
    expect(result.container.querySelector('.mp-search-clear-ring')).toBeNull();
    const extraStops = [...result.container.querySelectorAll("[tabindex='0']")].filter(
      (el) => el !== input && el !== clear,
    );
    expect(extraStops).toHaveLength(0);
  });

  it('restores focus to the searchbox after clear', () => {
    const result = renderWithProviders(<SearchInput defaultValue="abc" />);
    const input = result.container.querySelector('input');
    const clear = result.container.querySelector("[aria-label='Clear search']");
    if (!input || !clear) {
      throw new Error('input or clear not found');
    }
    fireEvent.click(clear);
    expect(document.activeElement).toBe(input);
  });

  it('Escape clears, Enter flushes the pending search', () => {
    const onSearch = vi.fn();
    const result = renderWithProviders(<SearchInput onSearch={onSearch} debounceMs={300} />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledWith('abc');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
  });

  it('controlled mode reflects the value prop', () => {
    const result = renderWithProviders(<SearchInput value="hello" onChange={() => {}} />);
    const input = result.container.querySelector('input');
    expect(input!.value).toBe('hello');
  });

  it('entered value uses the full input ramp (T-VALUE ignore), not textAccent', () => {
    // InputFrame drops unknown data-* on the raw <input>; the contract is the
    // Area color override. T-VALUE = full ramp; textAccent must not dim it.
    expect(SEARCH_INPUT_SRC).toMatch(/color: ['"]\$color['"]/);
    expect(SEARCH_INPUT_SRC).toMatch(/['"]data-mp-t-value['"]: ['"]full['"]/);
    expect(SEARCH_INPUT_SRC).toMatch(/textAccentColor/);
    const result = renderWithProviders(<SearchInput defaultValue="pikachu" />);
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    expect(input.value).toBe('pikachu');
  });

  it('clearable=false hides the clear button', () => {
    const result = renderWithProviders(<SearchInput defaultValue="abc" clearable={false} />);
    expect(result.container.querySelector("[aria-label='Clear search']")).toBeNull();
  });

  it('disabled hides the clear button and blocks input', () => {
    const result = renderWithProviders(<SearchInput defaultValue="abc" disabled />);
    expect(result.container.querySelector("[aria-label='Clear search']")).toBeNull();
    const input = result.container.querySelector('input');
    expect(input?.getAttribute('aria-disabled')).toBe('true');
  });

  it('does not fork a SearchInput-only clear ring stylesheet', () => {
    renderWithProviders(<SearchInput defaultValue="abc" />);
    const chrome = document.getElementById('mp-search-input-chrome')?.textContent ?? '';
    expect(chrome).not.toMatch(/mp-search-clear/);
    expect(chrome).toMatch(/mp-search-input/);
  });

  it('default painted box is 44 tall; end-cap is the size-recipe square', () => {
    const result = renderWithProviders(<SearchInput defaultValue="abc" />);
    const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
    const clear = result.container.querySelector("[aria-label='Clear search']") as HTMLElement;
    if (!box || !clear) {
      throw new Error('box or clear not found');
    }
    expect(box.getAttribute('data-visual-height')).toBe('44');
    expect(clear.getAttribute('data-end-cap')).toBe('44');
    expect(box.getAttribute('data-press-floor')).toBe('box');
  });

  it('end-cap square is generated from the size recipe at every token', () => {
    for (const token of SIZE_RECIPE_TOKENS) {
      if (token === '$true') {
        continue;
      }
      const height = sizeRecipeForToken(token).height;
      const result = renderWithProviders(<SearchInput defaultValue="abc" size={token} aria-label={`q-${token}`} />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      const clear = result.container.querySelector("[aria-label='Clear search']") as HTMLElement;
      if (!box || !clear) {
        throw new Error(`anatomy missing at ${token}`);
      }
      expect(box.getAttribute('data-visual-height'), token).toBe(String(height));
      expect(clear.getAttribute('data-end-cap'), token).toBe(String(height));
    }
  });

  it('compact steps density and leaves size on the recipe; size ejects height', () => {
    const compact = renderWithProviders(<SearchInput compact />);
    const compactBox = compact.container.querySelector("[data-ring-target='box']") as HTMLElement;
    expect(compactBox.getAttribute('data-density')).toBe('compact');
    // Compact is density only — default size stays the medium recipe.
    expect(compactBox.getAttribute('data-size')).toBe('$4');

    const sized = renderWithProviders(<SearchInput size="$5" />);
    const sizedBox = sized.container.querySelector("[data-ring-target='box']") as HTMLElement;
    expect(sizedBox.getAttribute('data-density')).toBe('comfortable');
    expect(sizedBox.getAttribute('data-size')).toBe('$5');

    const both = renderWithProviders(<SearchInput compact size="$5" />);
    const bothBox = both.container.querySelector("[data-ring-target='box']") as HTMLElement;
    expect(bothBox.getAttribute('data-density')).toBe('compact');
    expect(bothBox.getAttribute('data-size')).toBe('$5');
  });

  it('renders skeleton without a searchbox', () => {
    const result = renderWithProviders(<SearchInput label="Find" skeleton />);
    expect(result.container.querySelector('input')).toBeNull();
    expect(result.findTextElement('Find')).toBeDefined();
  });

  it('error replaces helper in the field slot', () => {
    const result = renderWithProviders(<SearchInput label="Find" helperText="Type a name" error="Too short" />);
    expect(result.findTextElement('Type a name')).toBeUndefined();
    expect(result.findTextElement('Too short')).toBeDefined();
  });

  it('form-integrated name keeps onChange(value)', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <Form formOptions={{ defaultValues: { q: '' } }} onSubmit={() => {}} submitText="Go">
        <SearchInput name="q" label="Find" onChange={onChange} debounceMs={0} />
      </Form>,
    );
    expect(result.findTextElement('Find')).toBeDefined();
    const input = result.container.querySelector('input');
    if (!input) {
      throw new Error('input not found');
    }
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });
});
