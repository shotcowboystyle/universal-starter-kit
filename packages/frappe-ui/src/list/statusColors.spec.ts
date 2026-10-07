/**
 * statusColors — desk indicator-color parity for the list status pill.
 * Workflow `states` from the doctype meta must win over the heuristic
 * word map; everything unknown lands on gray.
 */
import { describe, expect, it } from 'vitest';

import type { DoctypeMeta } from '../formEngine/doctypeMeta';

import { statusPillColors } from './statusColors';

function makeMeta(states: { title?: string; color?: string }[]): DoctypeMeta {
  return { name: 'ToDo', fields: [], states } as DoctypeMeta;
}

describe('statusPillColors heuristics (no meta)', () => {
  it('maps done/healthy words to green', () => {
    for (const status of ['Closed', 'Completed', 'Approved', 'Paid', 'Active', 'Delivered']) {
      expect(statusPillColors(status)).toEqual({ background: '$green3', text: '$green11' });
    }
  });

  it('maps in-flight words to orange', () => {
    for (const status of ['Open', 'Pending', 'In Progress', 'Overdue', 'Medium']) {
      expect(statusPillColors(status)).toEqual({ background: '$orange3', text: '$orange11' });
    }
  });

  it('maps informational words to blue', () => {
    for (const status of ['Submitted', 'Running', 'New', 'In Review', 'Low']) {
      expect(statusPillColors(status)).toEqual({ background: '$blue3', text: '$blue11' });
    }
  });

  it('maps failed/stopped words to red', () => {
    for (const status of ['Cancelled', 'Canceled', 'Failed', 'Rejected', 'Urgent', 'High']) {
      expect(statusPillColors(status)).toEqual({ background: '$red3', text: '$red11' });
    }
  });

  it('maps draft and unknown values to gray', () => {
    expect(statusPillColors('Draft')).toEqual({ background: '$gray3', text: '$gray11' });
    expect(statusPillColors('Something Custom')).toEqual({
      background: '$gray3',
      text: '$gray11',
    });
    expect(statusPillColors('')).toEqual({ background: '$gray3', text: '$gray11' });
  });

  it('normalizes case and whitespace', () => {
    expect(statusPillColors(' OPEN ')).toEqual({ background: '$orange3', text: '$orange11' });
    expect(statusPillColors('paid')).toEqual({ background: '$green3', text: '$green11' });
  });
});

describe('statusPillColors with workflow states', () => {
  it('prefers the workflow state color over the word heuristic', () => {
    // Heuristic would say orange for "Open"; the workflow says Red.
    const meta = makeMeta([{ title: 'Open', color: 'Red' }]);
    expect(statusPillColors('Open', meta)).toEqual({ background: '$red3', text: '$red11' });
  });

  it('matches state titles case-insensitively and trims', () => {
    const meta = makeMeta([{ title: '  open ', color: 'Green' }]);
    expect(statusPillColors('Open', meta)).toEqual({ background: '$green3', text: '$green11' });
  });

  it('maps desk color aliases onto ramp families', () => {
    const cases: [string, string][] = [
      ['Light-Blue', 'blue'],
      ['cyan', 'blue'],
      ['Amber', 'yellow'],
      ['Grey', 'gray'],
      ['darkgrey', 'gray'],
      ['Purple', 'purple'],
      ['Pink', 'pink'],
    ];
    for (const [deskColor, ramp] of cases) {
      const meta = makeMeta([{ title: 'Custom', color: deskColor }]);
      expect(statusPillColors('Custom', meta)).toEqual({
        background: `$${ramp}3`,
        text: `$${ramp}11`,
      });
    }
  });

  it('falls back to the heuristic for unknown desk colors', () => {
    const meta = makeMeta([{ title: 'Open', color: 'Teal' }]);
    expect(statusPillColors('Open', meta)).toEqual({ background: '$orange3', text: '$orange11' });
  });

  it('falls back to the heuristic when the state has no color or no match', () => {
    expect(statusPillColors('Open', makeMeta([{ title: 'Open' }]))).toEqual({
      background: '$orange3',
      text: '$orange11',
    });
    expect(statusPillColors('Closed', makeMeta([{ title: 'Open', color: 'Red' }]))).toEqual({
      background: '$green3',
      text: '$green11',
    });
  });
});
