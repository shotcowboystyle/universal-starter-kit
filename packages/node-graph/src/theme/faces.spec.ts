/**
 * The corrupted-first-family control, and the generated face payload
 * (design §6.3, MPO-211 task 2.5).
 *
 * MPO-191 asks whether the `$body` face actually RENDERED inside the WebView,
 * and the gate's own probe could not answer that. It measured the real stack
 * against a wholly bogus family name, so it could tell "something other than
 * nothing rendered" and nothing more: a stack that fell through to
 * `-apple-system` measured differently from `NoSuchFont, monospace` and read as
 * a pass. Corrupting only the FIRST name leaves the rest of the cascade intact,
 * so the two measurements differ if and only if the first family is the one
 * that painted.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  corruptFirstFamily,
  faceBytes,
  graphFaceCeilingBytes,
  graphFaceCss,
  graphFaces,
  probeFamily,
  splitFontStack,
} from './faces';
import type { GraphFaceCategory } from './faces';
import { generatedGraphFaces } from './faces.generated';

/**
 * A measurer that models a real cascade: it returns a width per family, and
 * picks the FIRST family it knows about. An unknown name is skipped, exactly as
 * a browser skips a family it cannot resolve.
 */
function cascadeMeasurer(known: Readonly<Record<string, number>>) {
  return (stack: string): number => {
    for (const family of splitFontStack(stack)) {
      const width = known[family];
      if (width !== undefined) {
        return width;
      }
    }
    return 0;
  };
}

describe(splitFontStack, () => {
  it('reads the families a browser would, quotes and spacing and all', () => {
    expect(splitFontStack('Inter, -apple-system, "Segoe UI" , Roboto')).toEqual([
      'Inter',
      '-apple-system',
      'Segoe UI',
      'Roboto',
    ]);
    expect(splitFontStack("'Roboto Slab', 'Rockwell', serif")).toEqual(['Roboto Slab', 'Rockwell', 'serif']);
    expect(splitFontStack('')).toEqual([]);
  });
});

describe(corruptFirstFamily, () => {
  it('breaks the first name and leaves every later one untouched', () => {
    const stack = 'Inter, -apple-system, "Segoe UI", sans-serif';
    const corrupted = corruptFirstFamily(stack);
    const families = splitFontStack(corrupted);
    expect(families[0]).not.toBe('Inter');
    expect(families.slice(1)).toEqual(['-apple-system', 'Segoe UI', 'sans-serif']);
  });

  it('produces a name no font can answer to, and a stable one', () => {
    expect(corruptFirstFamily('Inter, sans-serif')).toBe(corruptFirstFamily('Inter, sans-serif'));
    expect(splitFontStack(corruptFirstFamily('Inter, sans-serif'))[0]).toContain('Inter');
  });

  it('is a no-op on an empty stack rather than inventing a family', () => {
    expect(corruptFirstFamily('')).toBe('');
  });

  it('keeps a single-family stack measurable by leaving nothing behind it', () => {
    // The one case where the control cannot conclude anything, and must not
    // pretend it can: with no fallback, corrupting the only name leaves the UA
    // default, which may coincidentally measure the same. The probe reports
    // `conclusive: false` for it rather than a false `matched`.
    expect(splitFontStack(corruptFirstFamily('Inter'))).toHaveLength(1);
  });
});

describe('probeFamily — the control MPO-191 asked for', () => {
  const stack = 'Inter, -apple-system, "Segoe UI", sans-serif';

  it('reports matched:false when the two widths are EQUAL — the first family never rendered', () => {
    // Inter is absent, so the real cascade already falls through to
    // -apple-system, and corrupting "Inter" changes nothing.
    const measure = cascadeMeasurer({ '-apple-system': 120, 'Segoe UI': 130, 'sans-serif': 140 });
    const probe = probeFamily({ stack, measure });
    expect(probe.widthStack).toBe(120);
    expect(probe.widthFirstCorrupted).toBe(120);
    expect(probe.matched).toBe(false);
    expect(probe.conclusive).toBe(true);
  });

  it('reports matched:true when they DIFFER — the first family painted', () => {
    const measure = cascadeMeasurer({ Inter: 100, '-apple-system': 120, 'sans-serif': 140 });
    const probe = probeFamily({ stack, measure });
    expect(probe.widthStack).toBe(100);
    expect(probe.widthFirstCorrupted).toBe(120);
    expect(probe.matched).toBe(true);
    expect(probe.conclusive).toBe(true);
  });

  it("beats the gate's bogus-family probe on the case that made it worthless", () => {
    // Inter absent, second family present. The gate compared the real stack
    // against `NoSuchFont, monospace`, which measures as monospace — a
    // DIFFERENT width — so the gate reported a pass while Inter had not
    // rendered at all. The first-corrupted control reports the failure.
    const measure = cascadeMeasurer({
      '-apple-system': 120,
      'sans-serif': 140,
      monospace: 210,
    });
    const bogus = measure('NoSuchFont, monospace');
    expect(bogus).not.toBe(measure(stack)); // what the gate would have called a pass
    expect(probeFamily({ stack, measure }).matched).toBe(false); // what is actually true
  });

  it('refuses to conclude from a stack with no fallback behind the first name', () => {
    const measure = cascadeMeasurer({ Inter: 100 });
    const probe = probeFamily({ stack: 'Inter', measure });
    expect(probe.conclusive).toBe(false);
    expect(probe.matched).toBe(false);
  });

  it('refuses to conclude when nothing measured — a zero-width probe is not evidence', () => {
    const probe = probeFamily({ stack, measure: () => 0 });
    expect(probe.conclusive).toBe(false);
  });

  it('carries the stack it measured, so a screenshot of the panel is readable', () => {
    const measure = cascadeMeasurer({ Inter: 100, 'sans-serif': 140 });
    expect(probeFamily({ stack, measure }).stack).toBe(stack);
  });
});

describe('the generated payload', () => {
  it('carries exactly the declared faces, in the declared order', () => {
    expect(generatedGraphFaces.map((face) => face.id)).toEqual(graphFaces.map((face) => face.id));
  });

  it('declares only faces this repo can actually source', () => {
    for (const face of generatedGraphFaces) {
      expect(face.base64.length, `${face.id} must carry bytes`).toBeGreaterThan(0);
      expect(face.byteLength).toBe(Buffer.from(face.base64, 'base64').byteLength);
      expect(face.family).toBe('Inter');
      expect([400, 700]).toContain(face.weight);
    }
  });

  it('is SUBSET, not the whole font file (design 6.3, MPO-211)', () => {
    // The regression this guards is a regeneration on a machine where the
    // subsetter silently did nothing: the module would still be "current"
    // against its sources and the DOM bundle would quietly gain 130 KB of
    // Cyrillic, Greek and Vietnamese that base64 cannot compress away.
    // Measured against the source files themselves, so it cannot be satisfied
    // by a comment.
    const repoRoot = path.resolve(import.meta.dirname, '../../../..');
    for (const face of generatedGraphFaces) {
      const source = readFileSync(path.join(repoRoot, face.source));
      expect(
        face.byteLength,
        `${face.id} is ${face.byteLength} bytes against a ${source.byteLength}-byte source — it was not subset`,
      ).toBeLessThan(source.byteLength / 2);
    }
  });

  it('stays under the declared ceiling', () => {
    expect(faceBytes(generatedGraphFaces)).toBeLessThanOrEqual(graphFaceCeilingBytes);
    // And the ceiling is not a rubber stamp: it has to be a real budget, not
    // whatever the payload happens to weigh.
    expect(graphFaceCeilingBytes).toBeLessThan(faceBytes(generatedGraphFaces) * 2);
  });

  it('emits one @font-face per face, with the base64 inline', () => {
    const css = graphFaceCss(generatedGraphFaces);
    expect(css.match(/@font-face/g)).toHaveLength(generatedGraphFaces.length);
    for (const face of generatedGraphFaces) {
      expect(css).toContain(`font-weight: ${face.weight}`);
      expect(css).toContain('format("woff2")');
    }
    expect(css).toContain('data:font/woff2;base64,');
  });

  it('prefers a supplied asset URI over the base64 for the same face', () => {
    const css = graphFaceCss(generatedGraphFaces, { 'inter-400': '/fonts/inter-400.woff2' });
    expect(css).toContain('url("/fonts/inter-400.woff2")');
    const inline = css.match(/data:font\/woff2;base64,/g) ?? [];
    expect(inline).toHaveLength(generatedGraphFaces.length - 1);
  });

  it('is current against its sources, so a font swap cannot rot it', () => {
    // The generator re-derives the module and exits non-zero on any
    // difference. Running it HERE is what stops faces.generated.ts becoming a
    // byte string nobody re-reads after the fonts move.
    const packageRoot = path.resolve(import.meta.dirname, '../..');
    expect(() =>
      execFileSync(process.execPath, ['scripts/build-graph-faces.mjs', '--check'], {
        cwd: packageRoot,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('declares no mono face, because there is no mono webfont to declare', () => {
    // fontCategoryStacks.mono is ui-monospace / SFMono-Regular / Menlo /
    // Monaco / Consolas / monospace — every one a SYSTEM face WKWebView already
    // resolves. Design §6.3 asked for a mono 400 payload; the repo ships no
    // mono webfont to build one from, and inventing a family the stack never
    // names would render nothing. See faces.ts.
    expect([...new Set(generatedGraphFaces.map((face) => face.category))]).toEqual(['sans-serif']);
    expect([...new Set(graphFaces.map((face) => face.category))]).toEqual(['sans-serif']);
    // And the TYPE refuses one too, so this cannot be undone by editing data.
    // @ts-expect-error GraphFaceCategory is "sans-serif" alone.
    const mono: GraphFaceCategory = 'mono';
    expect(mono).toBe('mono');
  });
});
