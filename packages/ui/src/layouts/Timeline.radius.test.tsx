import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
// Regression test for SB-M-301: the borderRadius knob must reach Timeline
// entry rows (previously only the comment composer and empty state responded).
// jsdom's getComputedStyle cannot cascade Tamagui's class-based CSS, so this
// asserts on the atomic border-radius classes (_btlr-*) the knob emits.
import { cleanup, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Timeline, type TimelineEntry } from './Timeline';

afterEach(cleanup);

const entries: TimelineEntry[] = [
  {
    id: 'entry-1',
    type: 'comment',
    content: 'Looks good!',
    author: 'Alice',
    timestamp: '2026-01-15T10:00:00Z',
  },
];

function entryRowRadiusClass(): string | undefined {
  const author = screen.getByText('Alice');
  let el: HTMLElement | null = author.parentElement;
  for (let i = 0; i < 12 && el; i++) {
    const radiusClass = String(el.className || '')
      .split(' ')
      .find((c) => c.startsWith('_btlr-'));
    if (radiusClass) {
      return radiusClass;
    }
    el = el.parentElement;
  }
  return undefined;
}

describe('Timeline avatar identity shape', () => {
  // Entry and composer avatars both keep their identity circle at
  // `borderRadius: none`, so each one must carry the R-IDENTITY declaration the
  // spec-generated allowlist reads. An undeclared circle is a KNOB-TOTALITY defect.
  it('declares every knob-immune avatar circle at borderRadius:none', () => {
    const { container } = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Timeline entries={entries} onCommentSubmit={() => {}} />
      </Preset>,
    );
    // the composer avatar proves the composer branch rendered
    expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument();

    const declared = container.querySelectorAll('[data-radius-class="R-IDENTITY"]');
    expect(declared.length).toBeGreaterThanOrEqual(2);
    for (const el of declared) {
      expect(el.getAttribute('data-radius-part')).toBe('Avatar');
    }
  });
});

describe('Timeline entry radius knob (SB-M-301)', () => {
  it('entry row border radius follows the borderRadius knob', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Timeline entries={entries} />
      </Preset>,
    );
    const fullRadiusClass = entryRowRadiusClass();
    cleanup();

    renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <Timeline entries={entries} />
      </Preset>,
    );
    const noneRadiusClass = entryRowRadiusClass();

    expect(fullRadiusClass).toBeDefined();
    expect(fullRadiusClass).not.toBe(noneRadiusClass);
  });
});

describe('Timeline comment card is CONTAINER-CAP on its own padding', () => {
  const cardRadius = (borderRadius: 'none' | 'medium' | 'large' | 'full', compact = false) => {
    renderWithProviders(
      <Preset overrides={{ borderRadius }}>
        <Timeline entries={entries} compact={compact} />
      </Preset>,
    );
    const found = entryRowRadiusClass();
    cleanup();
    return found;
  };

  it('takes the token while it fits the $3 padding', () => {
    expect(cardRadius('none')).toBe('_btlr-0px');
    expect(cardRadius('medium')).toBe('_btlr-9px');
  });

  it('caps large and full at the 13px padding', () => {
    expect(cardRadius('large')).toBe('_btlr-13px');
    expect(cardRadius('full')).toBe('_btlr-13px');
  });

  it('caps at the compact $2 padding when compact', () => {
    expect(cardRadius('medium', true)).toBe('_btlr-7px');
  });

  it('declares an OwnInset cap for the constraint audit', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <Timeline entries={entries} />
      </Preset>,
    );
    const card = screen.getByText('Looks good!').closest('[data-constraint-container]');
    expect(card?.getAttribute('data-constraint-container')).toBe('OwnInset');
    expect(card?.getAttribute('data-radius-knob')).toBe('full');
  });
});
