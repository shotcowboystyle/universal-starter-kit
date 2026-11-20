/**
 * The rules that decide whether the canvas is visible at all.
 *
 * Asserted as TEXT, like `dom-entry.test.ts`'s invariants and for the same
 * reason: what this protects cannot fail in a way a render test would notice.
 * A canvas with no height still mounts, still lays out, still answers the
 * accessibility tree with every node in the right place, and still reports
 * `stage: ready` over the bridge. It just paints nothing. There is no error to
 * catch and no boundary to catch it.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphDomLayout, graphDomLayoutCss } from './GraphDomLayout';

describe(graphDomLayoutCss, () => {
  /**
   * Named one by one rather than snapshotted. A snapshot would go green on an
   * edit that dropped a rule, because the snapshot would be updated with it.
   */
  it('gives html and body a height, so a percentage height resolves', () => {
    expect(graphDomLayoutCss).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%/u);
  });

  it("gives Expo's #root mount point a height too", () => {
    // The chain is html > body > #root > <React root div> > .mp-graph. A gap
    // anywhere in it collapses everything below, so every step is named.
    expect(graphDomLayoutCss).toMatch(/#root\s*\{[^}]*height:\s*100%/u);
    expect(graphDomLayoutCss).toMatch(/#root\s*>\s*div\s*\{[^}]*height:\s*100%/u);
  });

  it('zeroes the body margin', () => {
    // Not cosmetic: a UA's default 8px margin makes the document wider than the
    // WebView, and React Flow's viewport then disagrees with the box being
    // touched by exactly that much.
    expect(graphDomLayoutCss).toMatch(/body\s*\{[^}]*margin:\s*0/u);
  });

  it('carries no color and no font', () => {
    // Paint belongs to the var layer and to `graph.css`; this file is geometry.
    expect(graphDomLayoutCss).not.toMatch(/color|background|font/iu);
  });
});

describe(GraphDomLayout, () => {
  it('renders one style element carrying those rules', () => {
    const { container } = render(<GraphDomLayout />);
    const style = container.querySelector('style[data-mpo-graph-layout]');
    expect(style).not.toBeNull();
    expect(style?.textContent).toBe(graphDomLayoutCss);
    // Nothing else. A layout sheet that rendered a box would change the layout
    // it exists to fix.
    expect(screen.queryByRole('presentation')).toBeNull();
    expect(container.children).toHaveLength(1);
  });
});
