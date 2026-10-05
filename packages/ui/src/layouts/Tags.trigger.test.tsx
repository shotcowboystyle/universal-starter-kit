import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
// Regression test for the Tags "Add Tag" trigger scale (post Tags→Chip
// consolidation): the trigger previously rendered as a Tamagui Button whose
// size token set a fixed field height ($4 → 44px) — 2x the Chip pill. The
// visual pill shares ChipFrame/ChipText, so its padding/font/height atomic
// classes must match the pills exactly (size recipe). Since the
// press-floor rollout the interactive trigger is a transparent wrapper
// floored at 44px via the house pressTarget* channel; the chip-scale pill
// nests inside it.
// jsdom's getComputedStyle cannot cascade Tamagui's class-based CSS, so this
// asserts on the atomic classes (same approach as Timeline.radius.test.tsx).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tags } from './Tags';

afterEach(cleanup);

const tags = [{ id: 'tag-1', label: 'urgent' }];

function classesByPrefix(el: Element, prefixes: string[]): string[] {
  return String(el.className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

/** Walk up from the chip label to the ChipFrame (first ancestor with padding classes). */
function chipFrameOf(label: HTMLElement): HTMLElement {
  let el: HTMLElement | null = label.parentElement;
  for (let i = 0; i < 8 && el; i++) {
    if (classesByPrefix(el, ['_pt-', '_pl-']).length > 0) {
      return el;
    }
    el = el.parentElement;
  }
  throw new Error('chip frame not found');
}

function renderTags() {
  return renderWithProviders(<Tags tags={tags} onAdd={vi.fn()} onRemove={vi.fn()} />);
}

/** The chip-scale visual pill nested inside the wrapper trigger. */
function triggerPillOf(trigger: HTMLElement): HTMLElement {
  const pill = chipFrameOf(screen.getByText('Add Tag'));
  if (!trigger.contains(pill)) {
    throw new Error('trigger pill not inside trigger');
  }
  return pill;
}

describe('Tags Add Tag trigger (chip-scale)', () => {
  it('trigger pill padding classes match the chip pill exactly', () => {
    renderTags();
    const chip = chipFrameOf(screen.getByText('urgent'));
    const trigger = screen.getByLabelText('Add Tag');
    const pill = triggerPillOf(trigger);
    const paddingPrefixes = ['_pt-', '_pb-', '_pl-', '_pr-'];
    expect(classesByPrefix(pill, paddingPrefixes)).toEqual(classesByPrefix(chip, paddingPrefixes));
  });

  it('trigger pill height matches the chip pill (size recipe)', () => {
    renderTags();
    const chip = chipFrameOf(screen.getByText('urgent'));
    const pill = triggerPillOf(screen.getByLabelText('Add Tag'));
    // The pill has no recipe height — it hugs its label — so the two boxes
    // match only if every channel that feeds the box matches. Padding and
    // font are covered by the sibling cases; the one that came apart was the
    // border: the trigger is outlined and the tag chips are not, and while
    // the border width lived on the `outline` variant alone the trigger
    // rendered 2px taller than the chips beside it in the same row.
    expect(classesByPrefix(pill, ['_h-'])).toEqual(classesByPrefix(chip, ['_h-']));
    const borderPrefixes = ['_btw-', '_bbw-', '_blw-', '_brw-', '_bw-'];
    expect(classesByPrefix(pill, borderPrefixes)).toEqual(classesByPrefix(chip, borderPrefixes));
    expect(classesByPrefix(pill, borderPrefixes).length).toBeGreaterThan(0);
  });

  /**
   * The RESOLVER owns the outlined hairline floor —
   * `outlined` + `none` draws the enumerated `small` stop, 0.5 — and a
   * component adds no second `Math.max(..., 1)` on top. A local floor made
   * `small` measure the same as `medium` here and nowhere else, so the Tags
   * row was the one outlined control the borderWidth knob could not thin.
   */
  it.each([
    ['none', '0--5px'],
    ['small', '0--5px'],
    ['medium', '1px'],
    ['large', '2px'],
  ] as const)('outlined borderWidth %s resolves to %s, floored only by the resolver', (borderWidth, px) => {
    renderWithProviders(
      <Preset overrides={{ borderWidth, fillStyle: 'outlined' }}>
        <Tags tags={tags} onAdd={vi.fn()} onRemove={vi.fn()} />
      </Preset>,
    );
    const pill = triggerPillOf(screen.getByLabelText('Add Tag'));
    const chip = chipFrameOf(screen.getByText('urgent'));
    const edges = ['_btw-', '_bbw-', '_blw-', '_brw-'];
    const expected = edges.map((edge) => `${edge}${px}`).sort();
    expect(classesByPrefix(pill, edges)).toEqual(expected);
    // The trigger and the chips it sits beside share one box at every stop;
    // a floor on only one of them is what pulled their heights apart.
    expect(classesByPrefix(chip, edges)).toEqual(expected);
  });

  it('trigger wrapper carries the 44px press-floor (minHeight class)', () => {
    renderTags();
    const trigger = screen.getByLabelText('Add Tag');
    expect(classesByPrefix(trigger, ['_mih-']).length).toBeGreaterThan(0);
  });

  it('trigger label font size class matches the chip label', () => {
    renderTags();
    const chipLabel = screen.getByText('urgent');
    const triggerLabel = screen.getByText('Add Tag');
    expect(classesByPrefix(triggerLabel, ['_fos-'])).toEqual(classesByPrefix(chipLabel, ['_fos-']));
  });

  it('clicking the trigger opens the add-tag panel', async () => {
    renderTags();
    fireEvent.click(screen.getByLabelText('Add Tag'));
    await waitFor(() => {
      expect(document.querySelector('input[placeholder="Add tag..."]')).toBeTruthy();
    });
  });
});
