/**
 * Document titles are reverse breadcrumbs.
 * Covers pure composition (reverse order, separators, empty parts) and the
 * hook's document.title assignment semantics.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { composeDocumentTitle, useDocumentTitle, type DocumentTitleTrail } from './useDocumentTitle';

describe('composeDocumentTitle', () => {
  it('reverses a breadcrumb trail into Leaf – Section – App', () => {
    expect(composeDocumentTitle([{ label: 'Desk' }, { label: 'Pokemon' }, { label: 'Pikachu' }])).toBe(
      'Pikachu – Pokemon – Desk',
    );
  });

  it('accepts plain strings and drops empty or nullish parts', () => {
    expect(composeDocumentTitle(['Desk', null, { label: '   ' }, 'Todo', undefined])).toBe('Todo – Desk');
  });

  it('returns an empty string for empty or missing trails', () => {
    expect(composeDocumentTitle([])).toBe('');
    expect(composeDocumentTitle(null)).toBe('');
    expect(composeDocumentTitle(undefined)).toBe('');
  });

  it('supports a custom separator', () => {
    expect(composeDocumentTitle(['App', 'Leaf'], ' | ')).toBe('Leaf | App');
  });

  it('does not mutate the given trail', () => {
    const trail = [{ label: 'Desk' }, { label: 'Todo' }];
    composeDocumentTitle(trail);
    expect(trail.map((p) => p.label)).toEqual(['Desk', 'Todo']);
  });
});

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'initial title';
  });

  it('sets document.title to the reverse breadcrumb trail', () => {
    const { result } = renderHook(() =>
      useDocumentTitle([{ label: 'Desk' }, { label: 'Todo' }, { label: 'TODO-001' }]),
    );
    expect(result.current).toBe('TODO-001 – Todo – Desk');
    expect(document.title).toBe('TODO-001 – Todo – Desk');
  });

  it('updates document.title when the trail changes', () => {
    const { rerender } = renderHook(({ trail }: { trail: DocumentTitleTrail }) => useDocumentTitle(trail), {
      initialProps: { trail: ['Desk', 'Todo'] as DocumentTitleTrail },
    });
    expect(document.title).toBe('Todo – Desk');

    rerender({ trail: ['Desk', 'Pokemon', 'Pikachu'] });
    expect(document.title).toBe('Pikachu – Pokemon – Desk');
  });

  it('leaves document.title untouched for an empty trail', () => {
    renderHook(() => useDocumentTitle([]));
    expect(document.title).toBe('initial title');
  });

  it('composes without assigning when enabled=false', () => {
    const { result } = renderHook(() => useDocumentTitle(['Desk', 'Todo'], { enabled: false }));
    expect(result.current).toBe('Todo – Desk');
    expect(document.title).toBe('initial title');
  });

  it('keeps the last title after unmount (navigation overwrites; unmount does not blank)', () => {
    const { unmount } = renderHook(() => useDocumentTitle(['Desk', 'Todo']));
    expect(document.title).toBe('Todo – Desk');
    unmount();
    expect(document.title).toBe('Todo – Desk');
  });
});
