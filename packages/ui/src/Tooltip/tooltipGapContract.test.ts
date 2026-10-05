/**
 * The source half of the gap contract: Tooltip owns no gap constant of its own.
 *
 * The runtime value is asserted where it lives — `layoutTokens.test.ts` pins
 * `OVERLAY_ANCHOR_GAP` at 4. Asserting that number again from a Tooltip spec
 * proves nothing about Tooltip: it passes just as happily if this component
 * goes back to a hardcoded `offset={4}`, which is exactly the drift this
 * contract was written to close.
 *
 * So this is the source half, in the shape of `panelWidthContract.test.ts`.
 * A Tooltip is a FREE overlay — no trigger to attach to — so it is one of the
 * few overlays `OVERLAY_ANCHOR_GAP` still governs after the cover ruling
 * (`OVERLAY_ATTACH_GAP = 0`). It must READ that token rather than restate its
 * value under a second name.
 *
 * Both twins are checked. The web/native split is where a duplicate constant
 * survives longest: fixing one file and leaving the other still renders the
 * right gap on the platform anyone happened to look at.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tooltipDir = dirname(fileURLToPath(import.meta.url));

/** The web twin, the native twin, and the module they share. */
const tooltipSources = ['index.tsx', 'index.native.tsx', 'tooltipShared.tsx'];

function read(relative: string): string {
  return readFileSync(resolve(tooltipDir, relative), 'utf8');
}

describe('Tooltip gap contract', () => {
  it.each(tooltipSources)('%s declares no gap constant of its own', (relative) => {
    // Named for the constant this AC deleted, but the assertion is the rule,
    // not the name: any local OFFSET/GAP constant is the same drift again.
    expect(read(relative)).not.toMatch(/\b(?:const|let|var)\s+\w*(?:OFFSET|GAP)\w*\s*=/);
  });

  it.each(['index.tsx', 'index.native.tsx'])(
    '%s positions the bubble with the shared FREE-overlay token',
    (relative) => {
      const source = read(relative);
      expect(source).toMatch(/import\s*\{[^}]*\bOVERLAY_ANCHOR_GAP\b[^}]*\}\s*from\s*['"]@repo\/theme['"]/s);
      expect(source).toContain('offset={OVERLAY_ANCHOR_GAP}');
      // A literal offset is the regression: it renders the same 4px today and
      // silently stops tracking the token the moment the house rule moves.
      expect(source).not.toMatch(/offset=\{\s*\d/);
    },
  );
});
