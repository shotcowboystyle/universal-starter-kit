/**
 * Task 6.1: the rule announces itself once, and never for a canvas that gave
 * none.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphChildrenWarning, resetGraphChildrenWarning, warnOnGraphChildren } from './graphChildren';

describe(warnOnGraphChildren, () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetGraphChildrenWarning();
    warn = vi.spyOn(console, 'warn').mockReturnValue();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('warns once, however many canvases are given children', () => {
    expect(warnOnGraphChildren('a toolbar')).toBe(true);
    expect(warnOnGraphChildren('another toolbar')).toBe(false);
    expect(warnOnGraphChildren('a third')).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('names BOTH legal places, not only the ban', () => {
    warnOnGraphChildren('x');
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('graphRef');
    expect(message).toContain('serializable option');
    // The eleven commands, so the reader does not have to go and find them.
    for (const command of ['relayout', 'perfStart', 'perfStop', 'undo', 'redo']) {
      expect(message).toContain(command);
    }
  });

  it('says nothing for a canvas with no children', () => {
    expect(warnOnGraphChildren()).toBe(false);
    expect(warnOnGraphChildren(null)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * `{condition && <Toolbar/>}` with a false condition is the correct code, and
   * warning about it would train an author to ignore the warning.
   */
  it('says nothing for a collapsed conditional child', () => {
    expect(warnOnGraphChildren(false)).toBe(false);
    expect(warnOnGraphChildren([false, null, undefined])).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('still warns when only ONE of several children is real', () => {
    expect(warnOnGraphChildren([false, 'a toolbar', null])).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('exports the message so a story author can be pointed at it', () => {
    expect(graphChildrenWarning).toMatch(/IGNORED/);
  });
});
