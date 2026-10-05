import { renderWithProviders } from '@repo/test-utils';
import { formatAbsoluteDateTime } from '@repo/theme';
// Comment-section behavior: display-name prettify, one-level threading,
// relative timestamps, and the inline composer submit path.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Timeline,
  type TimelineEntry,
  formatRelativeTimestamp,
  getEntryDisplayName,
  prettifyAuthorName,
  threadEntries,
} from './Timeline';

afterEach(cleanup);

describe('prettifyAuthorName', () => {
  it('prettifies the email local part', () => {
    expect(prettifyAuthorName('john.doe@example.com')).toBe('John Doe');
    expect(prettifyAuthorName('alice@example.com')).toBe('Alice');
    expect(prettifyAuthorName('dev_ops-team@example.com')).toBe('Dev Ops Team');
    expect(prettifyAuthorName('jdoe42@example.com')).toBe('Jdoe');
  });

  it('passes non-email names through untouched', () => {
    expect(prettifyAuthorName('Grace Hopper')).toBe('Grace Hopper');
    expect(prettifyAuthorName('Administrator')).toBe('Administrator');
  });

  it('never returns an empty name', () => {
    expect(prettifyAuthorName('')).toBe('Unknown');
    expect(prettifyAuthorName('   ')).toBe('Unknown');
  });

  it('getEntryDisplayName prefers authorName over prettified author', () => {
    expect(getEntryDisplayName({ author: 'm@x.com', authorName: 'Marcus Wright' })).toBe('Marcus Wright');
    expect(getEntryDisplayName({ author: 'm.wright@x.com' })).toBe('M Wright');
  });
});

describe('threadEntries', () => {
  const entry = (id: string, parentId?: string, ts = '2026-01-01T00:00:00Z'): TimelineEntry => ({
    id,
    type: 'comment',
    author: 'a@x.com',
    content: id,
    timestamp: ts,
    parentId,
  });

  it('groups replies one level under their parent', () => {
    const threads = threadEntries([entry('a'), entry('b'), entry('a1', 'a', '2026-01-02T00:00:00Z')]);
    expect(threads.map((t) => t.entry.id)).toEqual(['a', 'b']);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['a1']);
    expect(threads[1].replies).toEqual([]);
  });

  it('flattens reply-to-reply under the thread root (one level max)', () => {
    const threads = threadEntries([
      entry('a'),
      entry('a1', 'a', '2026-01-02T00:00:00Z'),
      entry('a1a', 'a1', '2026-01-03T00:00:00Z'),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['a1', 'a1a']);
  });

  it('sorts replies oldest-first regardless of input order', () => {
    const threads = threadEntries([
      entry('a'),
      entry('a2', 'a', '2026-01-05T00:00:00Z'),
      entry('a1', 'a', '2026-01-02T00:00:00Z'),
    ]);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['a1', 'a2']);
  });

  it('treats orphaned parentIds as top-level', () => {
    const threads = threadEntries([entry('a'), entry('x', 'missing-parent')]);
    expect(threads.map((t) => t.entry.id)).toEqual(['a', 'x']);
  });

  it('survives parentId cycles without losing entries', () => {
    const threads = threadEntries([entry('b', 'c'), entry('c', 'b'), entry('a')]);
    // cycle: first member promotes to top-level, the other nests under it —
    // every entry stays in the feed
    const rendered = threads.flatMap((t) => [t.entry.id, ...t.replies.map((r) => r.id)]);
    expect(rendered.sort()).toEqual(['a', 'b', 'c']);
    // true roots keep input order; cycle fallbacks append after them
    expect(threads.map((t) => t.entry.id)).toEqual(['a', 'b']);
  });
});

describe('formatRelativeTimestamp', () => {
  const now = new Date('2026-08-12T12:00:00Z').getTime();
  const at = (msBefore: number) => new Date(now - msBefore).toISOString();

  it('formats compact relative times', () => {
    expect(formatRelativeTimestamp(at(10_000), now)).toBe('just now');
    expect(formatRelativeTimestamp(at(5 * 60_000), now)).toBe('5m ago');
    expect(formatRelativeTimestamp(at(2 * 3_600_000), now)).toBe('2h ago');
    expect(formatRelativeTimestamp(at(24 * 3_600_000), now)).toBe('1 day ago');
    expect(formatRelativeTimestamp(at(10 * 86_400_000), now)).toBe('10 days ago');
    expect(formatRelativeTimestamp(at(60 * 86_400_000), now)).toBe('2mo ago');
    expect(formatRelativeTimestamp(at(800 * 86_400_000), now)).toBe('2y ago');
  });

  it('returns the raw string for invalid timestamps', () => {
    expect(formatRelativeTimestamp('not-a-date', now)).toBe('not-a-date');
  });
});

describe('timestamp registers (content class picks the register)', () => {
  // House knob default is `timestampStyle: "absolute"` (test-utils mock =
  // defaultKnobs) — comment rows must STILL render the relative register.
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const entries: TimelineEntry[] = [
    {
      id: 'c1',
      type: 'comment',
      author: 'grace@example.com',
      content: 'Social commentary',
      timestamp: twoHoursAgo,
    },
    {
      id: 'v1',
      type: 'version',
      author: 'admin@example.com',
      timestamp: twoHoursAgo,
      changes: [{ field: 'status', old: 'Draft', new: 'Submitted' }],
    },
  ];

  it('defaults comments to relative and system events to compact absolute', () => {
    renderWithProviders(<Timeline entries={entries} />);
    expect(screen.getByText('2h ago')).toBeInTheDocument();
    expect(screen.getByText(formatAbsoluteDateTime(twoHoursAgo))).toBeInTheDocument();
  });

  it('formatTimestamp prop ejects the register for every class', () => {
    renderWithProviders(<Timeline entries={entries} formatTimestamp={() => 'CUSTOM-TS'} />);
    expect(screen.getAllByText('CUSTOM-TS')).toHaveLength(2);
    expect(screen.queryByText('2h ago')).not.toBeInTheDocument();
  });
});

describe('Timeline comment section rendering', () => {
  const entries: TimelineEntry[] = [
    {
      id: 'c1',
      type: 'comment',
      author: 'john.doe@example.com',
      content: 'Top-level comment',
      timestamp: '2026-08-12T10:00:00Z',
    },
    {
      id: 'c1r1',
      type: 'comment',
      parentId: 'c1',
      author: 'reply.guy@example.com',
      content: 'A threaded reply',
      timestamp: '2026-08-12T11:00:00Z',
    },
    {
      id: 'v1',
      type: 'version',
      author: 'admin@example.com',
      timestamp: '2026-08-11T10:00:00Z',
      changes: [{ field: 'status', old: 'Draft', new: 'Submitted' }],
    },
  ];

  it('renders prettified display names, never raw emails', () => {
    renderWithProviders(<Timeline entries={entries} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Reply Guy')).toBeInTheDocument();
    expect(screen.queryByText('john.doe@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();
  });

  it('renders the feed with feed/article roles and threaded reply content', () => {
    renderWithProviders(<Timeline entries={entries} />);
    expect(screen.getByRole('feed')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBe(3);
    expect(screen.getByText('A threaded reply')).toBeInTheDocument();
    expect(screen.getByText('made changes')).toBeInTheDocument();
  });

  it('submits a top-level comment through onCommentSubmit', () => {
    const onCommentSubmit = vi.fn();
    renderWithProviders(<Timeline entries={entries} onCommentSubmit={onCommentSubmit} />);
    const input = screen.getByPlaceholderText('Add a comment...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));
    expect(onCommentSubmit).toHaveBeenCalledWith('hello world', undefined);
  });

  it('opens an inline reply composer and submits with parentId', () => {
    const onCommentSubmit = vi.fn();
    renderWithProviders(<Timeline entries={entries} onCommentSubmit={onCommentSubmit} />);
    // Reply on the threaded reply — parentId must be the clicked entry's id
    fireEvent.click(screen.getByRole('button', { name: 'Reply Reply Guy' }));
    const replyInput = screen.getByPlaceholderText('Write a reply...');
    fireEvent.change(replyInput, { target: { value: 'nested answer' } });
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));
    expect(onCommentSubmit).toHaveBeenCalledWith('nested answer', { parentId: 'c1r1' });
  });

  it('calls onReply instead of opening the internal composer when provided', () => {
    const onReply = vi.fn();
    renderWithProviders(<Timeline entries={entries} onCommentAdded={() => {}} onReply={onReply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reply John Doe' }));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
  });

  it('falls back to onCommentAdded for top-level submits (legacy API)', () => {
    const onCommentAdded = vi.fn();
    renderWithProviders(<Timeline entries={entries} onCommentAdded={onCommentAdded} />);
    const input = screen.getByPlaceholderText('Add a comment...');
    fireEvent.change(input, { target: { value: 'legacy path' } });
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));
    expect(onCommentAdded).toHaveBeenCalledWith('legacy path');
  });

  it('hides the composer when enableAddComment is false or disabled', () => {
    renderWithProviders(<Timeline entries={entries} enableAddComment={false} onCommentAdded={() => {}} />);
    expect(screen.queryByPlaceholderText('Add a comment...')).not.toBeInTheDocument();
    cleanup();
    renderWithProviders(<Timeline entries={entries} disabled onCommentAdded={() => {}} />);
    expect(screen.queryByPlaceholderText('Add a comment...')).not.toBeInTheDocument();
  });

  // The Reply button IS the grown
  // transparent press target (pressTargetStyle + negative outset + hitSlop),
  // so in hover/press it keeps `background-color: transparent` — the house
  // Button's default hover/press fills would paint the full 44px floor over
  // the comment text above (measured 56×6px of overlap pre-fix). jsdom never
  // applies :hover, but tamagui compiles state backgrounds into
  // value-carrying atomic classes, so the paint channel is asserted through
  // the atoms: the transparent eject atoms MUST be present (they vanish if
  // the eject is reverted) and no painted-value atom may remain.
  it('Reply floor pins hover/press backgrounds to transparent', () => {
    renderWithProviders(<Timeline entries={entries} onCommentSubmit={() => {}} />);
    const reply = screen.getByRole('button', { name: 'Reply John Doe' });
    expect(reply.className).toMatch(/_bg-0hover-transparent/);
    expect(reply.className).toMatch(/_bg-0active-transparent/);
    expect(reply.className).not.toMatch(/_bg-0(?:hover|active)-(?!transparent)/);
  });
});
