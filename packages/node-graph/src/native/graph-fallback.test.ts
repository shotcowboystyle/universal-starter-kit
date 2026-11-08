/**
 * What the fallback SAYS, which is the only thing a reader on a phone gets.
 *
 * The line these hold to account used to be "It never started, which usually
 * means the bundle failed to parse." On emulator-5590, rebooted fresh, that is
 * what the screen said — and nothing had failed to parse: the WebView was
 * still starting and Retry rendered the canvas at once (MPO-211). A watchdog
 * cannot tell a dead canvas from a slow one, so the wording must not claim it
 * can.
 */

import { describe, expect, it } from 'vitest';

import { graphFallbackDetail } from './GraphFallback.native';

describe(graphFallbackDetail, () => {
  it('names the stage boot reached, and what the wait cost', () => {
    const detail = graphFallbackDetail('faces', true, 'no-ready', 12_000);
    expect(detail).toContain('"faces"');
    expect(detail).toContain('12000 ms');
  });

  it('does not blame a parse error for a timeout it cannot diagnose', () => {
    const detail = graphFallbackDetail(null, false, 'no-ready', 12_000);
    expect(detail).not.toMatch(/never started/u);
    expect(detail).toMatch(/slow cold start/u);
    // The other cause is still named — it is a real possibility, just not the
    // likelier one, and a reader who retries twice needs to know what a second
    // silence means.
    expect(detail).toMatch(/fails? to parse/u);
    expect(detail).toContain('12000 ms');
  });

  it("still separates 'started and reported' from 'nothing came back'", () => {
    expect(graphFallbackDetail(null, true, 'no-ready', 4000)).toMatch(/reported a problem/u);
    expect(graphFallbackDetail(null, false, 'no-ready', 4000)).toMatch(/Nothing came back/u);
  });

  it('says no WebView was created when there is no DOM entry, and names no budget', () => {
    const detail = graphFallbackDetail(null, false, 'no-dom-entry', 12_000);
    expect(detail).toMatch(/no WebView was created/u);
    expect(detail).not.toContain('12000');
  });

  it('omits the budget entirely when none was waited', () => {
    expect(graphFallbackDetail('flow', true, 'render')).toBe('It reached "flow" and stopped there.');
  });
});
