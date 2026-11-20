import { render } from '@testing-library/react';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SuggestionList, fallbackSuggestionChrome, getSuggestionChrome } from './suggestion-popup';
import type { SuggestionListRef, SuggestionRow } from './suggestion-popup';

const rows: SuggestionRow[] = [
  { key: 'a', title: 'Alpha', description: 'first' },
  { key: 'b', title: 'Beta', description: 'second' },
  { key: 'c', title: 'Gamma', description: 'third' },
];

const chrome = { ...fallbackSuggestionChrome, rowPaddingX: 12 };

const renderList = (onSelect = vi.fn<(index: number) => void>()) => {
  const ref = createRef<SuggestionListRef>();
  const utils = render(
    <SuggestionList
      ref={ref}
      rows={rows}
      chrome={chrome}
      emptyLabel="No results"
      onSelect={onSelect}
    />,
  );
  return { ref, onSelect, ...utils };
};

describe(SuggestionList, () => {
  it('renders one option per row with LC-16 menu-row geometry', () => {
    const { container } = renderList();
    const options = container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(3);
    const { style } = options[0] as HTMLElement;
    // menuRowFrame-derived horizontal padding, flat corners, full width
    expect(style.padding).toBe('8px 12px');
    expect(style.borderRadius).toBe('0px');
    expect(style.width).toBe('100%');
  });

  it('marks the first row selected and navigates with arrows (wrapping)', () => {
    const { ref, container } = renderList();
    const selected = () =>
      [...container.querySelectorAll('[role="option"]')].findIndex((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected()).toBe(0);
    act(() => {
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) });
    });
    expect(selected()).toBe(1);
    act(() => {
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) });
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) });
    });
    expect(selected()).toBe(2);
  });

  it('selects with Enter and Tab', () => {
    const { ref, onSelect } = renderList();
    act(() => {
      ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) });
    });
    let handled = false;
    act(() => {
      handled = ref.current!.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'Enter' }),
      });
    });
    expect(handled).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('selects on click', () => {
    const { container, onSelect } = renderList();
    const options = container.querySelectorAll('[role="option"]');
    (options[2] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('shows the empty label when there are no rows', () => {
    const { container } = render(
      <SuggestionList
        rows={[]}
        chrome={chrome}
        emptyLabel="No results"
        onSelect={vi.fn<(index: number) => void>()}
      />,
    );
    expect(container.textContent).toContain('No results');
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});

describe(getSuggestionChrome, () => {
  it('reads the chrome pushed by the editor host', () => {
    const editor = { storage: { suggestionChrome: { value: chrome } } };
    expect(getSuggestionChrome(editor)).toBe(chrome);
  });

  it('falls back to the neutral chrome before the host pushes values', () => {
    expect(getSuggestionChrome(null)).toBe(fallbackSuggestionChrome);
    expect(getSuggestionChrome({ storage: {} })).toBe(fallbackSuggestionChrome);
  });
});
