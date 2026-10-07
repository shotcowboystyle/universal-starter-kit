/**
 * The `$body` face inside the WebView, and the control that proves it painted.
 *
 * WKWebView cannot see an `expo-font` registration, so the face has to arrive
 * as bytes. Design §6.3 names two mechanisms, and this module owns both ends:
 * the `@font-face` CSS (asset URL first, base64 second) and
 * `probeRenderedFamily`, which answers the question MPO-191 actually asked —
 * did the first family in the cascade render, or did we quietly get
 * `-apple-system` and call it a pass?
 *
 * WHY THE FIRST NAME IS CORRUPTED RATHER THAN THE WHOLE STACK REPLACED. The
 * gate measured the real stack against a wholly bogus family
 * (`NoSuchFont, monospace`). Two different widths came back and it read as a
 * pass — but a stack that fell through to `-apple-system` ALSO measures
 * differently from monospace, so the gate could not tell "Inter rendered" from
 * "the second family rendered". Corrupting only the first name leaves the rest
 * of the cascade byte-identical, so the widths differ if and only if the first
 * family is the one that painted.
 *
 * Design: docs/design/node-graph-editor.md §6.3.
 */

/** A knob font category, narrowed to what this package can ship bytes for. */
export type GraphFaceCategory = 'sans-serif';

/** One declared face: what it is, and where its bytes come from. */
export interface GraphFaceDeclaration {
  /** Stable id — the generator's key and the `assetUris` key a consumer passes. */
  readonly id: string;
  /** The CSS family name. Must be the FIRST name in the category's stack. */
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  readonly category: GraphFaceCategory;
  /** Repo-relative source, so the generated payload is traceable to a file. */
  readonly source: string;
}

/** A declared face with its bytes, as `faces.generated.ts` emits it. */
export interface GraphFaceAsset extends GraphFaceDeclaration {
  /** WOFF2, base64. */
  readonly base64: string;
  /** Decoded length, so the ceiling is measured against real bytes. */
  readonly byteLength: number;
  /** sha256 of the source file, so a silent source swap fails `--check`. */
  readonly sha256: string;
}

/**
 * The faces this package ships bytes for.
 *
 * TWO DEPARTURES FROM DESIGN §6.3, both forced by what is actually in the repo
 * and both measured rather than assumed.
 *
 * 1. **700, not 600.** The design asked for Inter 400 and 600. The repo ships
 *    `inter-400.woff2` and `inter-700.woff2` and nothing between them
 *    (`git ls-files '*.woff2'` — 20 files, all 400 or 700, ten copies of the
 *    same pair). `@tamagui/font-inter` does ship an `Inter-SemiBold.woff2` at
 *    `usWeightClass` 600, but its cmap carries 92 codepoints — bare ASCII,
 *    missing even `?` and `~` — so a node label with a question mark in it
 *    would fall out of the face. Declaring the 700 file at `font-weight: 700`
 *    is not a loss: the CSS font matching algorithm resolves a request for 600
 *    to the nearest heavier declared face, which is this one.
 *
 * 2. **No mono face.** `fontCategoryStacks.mono` is
 *    `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` —
 *    every name a system face WKWebView resolves on its own. There is no mono
 *    webfont anywhere in the repo to build a payload from, and declaring one
 *    under a family the stack never names would render nothing at all. The
 *    category falls through to the WebView's own faces, which is what the rest
 *    of §6.3 already says happens to every category but these.
 */
export const graphFaces: readonly GraphFaceDeclaration[] = [
  {
    id: 'inter-400',
    family: 'Inter',
    weight: 400,
    style: 'normal',
    category: 'sans-serif',
    source: 'apps/storybook/public/fonts/inter-400.woff2',
  },
  {
    id: 'inter-700',
    family: 'Inter',
    weight: 700,
    style: 'normal',
    category: 'sans-serif',
    source: 'apps/storybook/public/fonts/inter-700.woff2',
  },
];

/**
 * The declared payload ceiling, in decoded WOFF2 bytes.
 *
 * 96 KB against a measured 69.5 KB (34,500 + 36,636), which is ~38% headroom:
 * enough that a face rebuilt from a newer Inter, or one more punctuation block
 * added to the subset ranges, does not trip it — and tight enough that a THIRD
 * face cannot slip in unnoticed, because a third would land around 106 KB.
 *
 * IT WAS 220 KB, AND THE DIFFERENCE IS THE SUBSET (MPO-211). Design §6.3 asked
 * for latin-subset faces and milestone 2 shipped the repo's whole Inter files:
 * 2,505 codepoints each, 1,980 of them outside Latin (254 Cyrillic, 121 Greek,
 * 256 Vietnamese), 200.2 KB decoded — twice §6.3's own "roughly 100 KB
 * inflated" estimate. Base64 does not compress, so every one of those glyphs
 * cost its full weight in the DOM bundle's gzip. `scripts/build-graph-faces.mjs`
 * now cuts the subset with `subset-font` (harfbuzz) at generate time, 205,008
 * bytes down to 71,136, and the toolchain gap that blocked it is closed by one
 * devDependency of THIS package — nothing reaches a consumer's install.
 */
export const graphFaceCeilingBytes = 96 * 1024;

/** Decoded bytes across every generated face. */
export function faceBytes(faces: readonly GraphFaceAsset[]): number {
  return faces.reduce((total, face) => total + face.byteLength, 0);
}

/**
 * Splits a CSS font stack into the family names a browser would try, in order.
 *
 * Quotes are stripped because a family is the same family quoted or not, and
 * the probe compares names rather than re-serializing them.
 */
export function splitFontStack(stack: string): string[] {
  return stack
    .split(',')
    .map((part) =>
      part
        .trim()
        .replaceAll(/^["']|["']$/g, '')
        .trim(),
    )
    .filter((part) => part.length > 0);
}

/**
 * The suffix that turns a real family name into one no font can answer to.
 *
 * Appended rather than replacing the name, so a screenshot of the panel still
 * shows WHICH family was under test.
 */
const absentSuffix = ' mp-absent';

/**
 * Breaks the first family in a stack and leaves every later one byte-identical.
 *
 * The result is quoted, because the suffix contains a space.
 */
export function corruptFirstFamily(stack: string): string {
  const families = splitFontStack(stack);
  if (families.length === 0) {
    return stack;
  }
  const [first, ...rest] = families;
  const broken = `"${first}${absentSuffix}"`;
  return [broken, ...rest.map((name) => (/\s/.test(name) ? `"${name}"` : name))].join(', ');
}

/** Design §6.3's probe result, plus the honesty bit the design's shape lacked. */
export interface FaceProbe {
  readonly stack: string;
  readonly widthStack: number;
  /** The same cascade, first family name broken. */
  readonly widthFirstCorrupted: number;
  /** `widthStack !== widthFirstCorrupted`, and only meaningful when conclusive. */
  readonly matched: boolean;
  /**
   * Whether the two measurements could tell us anything at all.
   *
   * False in the two cases where equal widths are not evidence of a miss:
   * nothing measured (a hidden or empty element reads 0), and a stack with no
   * fallback behind the first name, where corrupting it leaves the UA default
   * and the widths may coincide by luck. Design §6.3's interface had no such
   * field, so both cases would have reported a confident `matched: false`.
   */
  readonly conclusive: boolean;
}

export interface ProbeFamilyOptions {
  readonly stack: string;
  /** Width of one line of text rendered in `stack`. */
  readonly measure: (stack: string) => number;
}

/** The control, with measurement injected so it is testable off a browser. */
export function probeFamily({ stack, measure }: ProbeFamilyOptions): FaceProbe {
  const widthStack = measure(stack);
  const corrupted = corruptFirstFamily(stack);
  const widthFirstCorrupted = measure(corrupted);
  const hasFallback = splitFontStack(stack).length > 1;
  const measured = widthStack > 0 && widthFirstCorrupted > 0;
  const conclusive = hasFallback && measured;
  return {
    stack,
    widthStack,
    widthFirstCorrupted,
    matched: conclusive && widthStack !== widthFirstCorrupted,
    conclusive,
  };
}

/** The string every probe measures. Latin, mixed case, no spaces to collapse. */
const probeText = 'AaBbGgQqRrWw0123456789';

/**
 * A canvas measurer bound to an element's computed size.
 *
 * Canvas rather than a hidden DOM span on purpose: `measureText` reports a
 * float and never triggers layout, so probing on every render costs nothing and
 * two runs of the same stack cannot disagree by a rounding of the box model.
 */
function canvasMeasurer(fontSize: string, fontWeight: string): ((stack: string) => number) | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    return null;
  }
  return (stack: string) => {
    context.font = `${fontWeight} ${fontSize} ${stack}`;
    return context.measureText(probeText).width;
  };
}

/**
 * Design §6.3's entry point: probe the family an element actually rendered in.
 *
 * Reads the element's own computed `font-family`, so it reports on the real
 * cascade the knob stack produced rather than on one this module guessed.
 */
export function probeRenderedFamily(el: Element): FaceProbe {
  const empty: FaceProbe = {
    stack: '',
    widthStack: 0,
    widthFirstCorrupted: 0,
    matched: false,
    conclusive: false,
  };
  if (typeof window === 'undefined') {
    return empty;
  }
  const style = window.getComputedStyle(el);
  const stack = style.fontFamily;
  if (!stack) {
    return empty;
  }
  const measure = canvasMeasurer(style.fontSize || '16px', style.fontWeight || '400');
  if (!measure) {
    return { ...empty, stack };
  }
  return probeFamily({ stack, measure });
}

/**
 * The `@font-face` block for a set of faces.
 *
 * `assetUris` is the PRIMARY path of design §6.3: a consumer hands in the URL
 * Expo produced from a `require()` of the face, and no bytes ride in the
 * bundle for it. A face with no URI falls back to its inline base64. The
 * `require()` lives in the consumer because that is where the asset lives —
 * this package vendors no font binary of its own, per §6.3's note that no new
 * vendored asset is needed.
 *
 * `font-display: block` rather than `swap`: the probe measures a rendered
 * width, and a swap would let it measure the fallback face during the swap
 * period and report a miss that is really a race.
 */
export function graphFaceCss(faces: readonly GraphFaceAsset[], assetUris?: Readonly<Record<string, string>>): string {
  return faces
    .map((face) => {
      const uri = assetUris?.[face.id];
      const src = uri ? `url("${uri}")` : `url("data:font/woff2;base64,${face.base64}")`;
      return [
        '@font-face {',
        `  font-family: "${face.family}";`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weight};`,
        '  font-display: block;',
        `  src: ${src} format("woff2");`,
        '}',
      ].join('\n');
    })
    .join('\n');
}
