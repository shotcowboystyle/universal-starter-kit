/**
 * Theme-matrix invariance + no-breakage assertions.
 *
 * The theme matrix sweeps every story cell across the globals axes
 * (scheme × theme colour × preset) and holds TWO separate assertions,
 * never one:
 *
 *  1. GEOMETRY INVARIANCE across the THEME axis — switching the theme
 *     colour may repaint ink, never move a box. Colour is the one axis
 *     whose whole contract is "paint only" (RECIPE-INPUTS: size
 *     recipes are generated from inputs at config time; Tamagui colour
 *     themes stay the colour path). Any geometry delta across colours
 *     means a recipe consumed a theme option.
 *
 *  2. NO-BREAKAGE across the PRESET axis — presets are EXPECTED to move
 *     pixels (boldPreset flips radius/border/weight/space; heroPreset
 *     moves the page title scale), so geometry equality is deliberately
 *     NOT asserted there. What must hold in every preset cell: the story
 *     renders, structural values stay on the knob scales
 *     (runConstraintAudit off-scale count vs the default cell), and text
 *     ink keeps the WCAG floor (evaluateTextContrast). Conveying SVG
 *     glyphs also receive an absolute 3:1 gate in every matrix cell.
 *
 * MEASURING RULE: every text assertion here measures TEXT NODES — the
 * computed style of the element that DIRECTLY contains the text, and the
 * Range-measured rect of the text itself — never the story frame. The
 * frame's font-family is always Inter and its colour is not the ink
 * (that trap has shipped wrong fixes before).
 * SVG measurements read descendant fill/stroke, including opacity. The
 * bounded model handles single-ink shapes over a resolved solid backdrop;
 * gradients, masks, filters, multicolor and unsupported group composition
 * stay named and unverified. Explicitly declared charts route to a separate
 * proof channel measuring ordered mark paint and SVG text. Geometry claims
 * without a measured certificate stay unverified. Image-file SVGs, CSS glyphs and icon fonts
 * are outside this channel's coverage.
 *
 * `captureMatrixSnapshot` is completely self-contained (no imports, no
 * closures) so it can be passed straight to Playwright's
 * `page.evaluate(captureMatrixSnapshot)`, exactly like
 * `runConstraintAudit`. The comparators are pure Node-side functions so
 * vitest can hold them to the tripwire tests without a browser.
 */

import { aaTextContrastRatio, measureContrast, minContrastRatio } from '../theme/color-rules';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatrixRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MatrixElementGeometry {
  /** Stable structural path from the story root (tag:index-among-same-tag). */
  key: string;
  tag: string;
  rect: MatrixRect;
  /**
   * Geometry-bearing computed properties. The theme axis must never move
   * any of these; colour properties are deliberately absent.
   */
  props: Record<string, string>;
  /** Range-measured rect of the element's DIRECT text nodes, when any. */
  textRect?: MatrixRect;
}

export interface MatrixTextSample {
  /** Structural key of the element that DIRECTLY contains the text node. */
  key: string;
  /** First characters of the text node (identification only). */
  text: string;
  /** Composited ink colour as #rrggbb (alpha already blended over background). */
  color: string;
  /** Composited effective background as #rrggbb. */
  background: string;
  /** False when no opaque backdrop could be resolved (gradient/image/alpha chain). */
  backgroundResolved: boolean;
  /** True when a background-image/gradient sits between text and backdrop. */
  overImage: boolean;
  fontSizePx: number;
  fontWeightNum: number;
  rect: MatrixRect;
}

export type IconExclusion = 'disabled-control' | 'decorative-standalone' | 'hidden';
export type IconUnmeasurableReason =
  | 'unresolved-backdrop'
  | 'masked-or-filtered'
  | 'use-indirection'
  | 'unsupported-paint'
  | 'unsupported-compositing'
  | 'multicolor'
  | 'no-paint';

export interface MatrixIconSample {
  key: string;
  /** Name of the control owning this glyph, or the standalone SVG's name. */
  context: string;
  status: 'conveying' | IconExclusion;
  background: string;
  backgroundResolved: boolean;
  overImage: boolean;
  /** Actual descendant ink, alpha-composited over the effective backdrop. */
  paint?: string;
  paintKinds?: ('fill' | 'stroke')[];
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- field of the exported MatrixIconSample snapshot; renaming it breaks snapshot consumers
  shapeCount: number;
  distinctPaints: number;
  unmeasurable?: IconUnmeasurableReason;
  rect: MatrixRect;
}

export interface IconContrastViolation {
  key: string;
  context: string;
  paint: string;
  background: string;
  ratio: number;
  required: number;
}

export interface IconUnverified {
  key: string;
  context: string;
  reason: IconUnmeasurableReason;
}

export interface IconContrastResult {
  /** Absolute verdict. Unverified conveying paint cannot produce a pass. */
  ok: boolean;
  candidates: number;
  measured: number;
  violations: IconContrastViolation[];
  unverified: IconUnverified[];
  excludedDisabled: number;
  excludedDecorative: number;
  excludedHidden: number;
}

export type ChartKind = 'bar' | 'pie' | 'donut' | 'line' | 'area';
export type ChartUnmeasurableReason =
  | IconUnmeasurableReason
  | 'unknown-kind'
  | 'no-marks'
  | 'hidden-chart'
  | 'unverified-separation'
  | 'incomplete-datum-text'
  | 'unsupported-overlap';

export interface MatrixChartPaint {
  key: string;
  label: string;
  background: string;
  paint?: string;
  unmeasurable?: ChartUnmeasurableReason;
}

export interface MatrixChartSample {
  key: string;
  kind: string;
  context: string;
  label: string;
  background: string;
  backgroundResolved: boolean;
  marks: MatrixChartPaint[];
  labels: MatrixChartPaint[];
  /** Explicit thin axis/grid lines. Never treated as data-mark ink. */
  chrome?: MatrixChartPaint[];
  /** Painted drawables outside the declared mark/text/chrome channels. */
  unaccountedPaint?: MatrixChartPaint[];
  /** A component declaration is recorded, never accepted as geometry proof. */
  separation: { declared: boolean; method?: 'rect-bounds' | 'eroded-arc'; minimumGapPx?: number };
  datumText: {
    declared: boolean;
    expected: number;
    observed: number;
    complete: boolean;
    viewId?: string;
    expectedValues?: string;
    verification?: 'opened-dialog';
    failure?: string;
  };
  unmeasurable?: ChartUnmeasurableReason;
}

export type ChartProofRule = 'mark-backdrop' | 'adjacent-pair' | 'axis-text' | 'missing-label';

export interface ChartProofViolation {
  key: string;
  context: string;
  rule: ChartProofRule;
  paint?: string;
  background?: string;
  ratio?: number;
  required?: number;
}

export interface ChartProofResult {
  ok: boolean;
  candidates: number;
  measured: number;
  marksMeasured: number;
  labelsMeasured: number;
  byKind: Record<string, number>;
  violations: ChartProofViolation[];
  unverified: { key: string; context: string; reason: ChartUnmeasurableReason }[];
}

export interface MatrixSnapshot {
  /** False when the story root is missing or empty — always a failure. */
  storyRendered: boolean;
  geometry: MatrixElementGeometry[];
  textSamples: MatrixTextSample[];
  iconSamples: MatrixIconSample[];
  chartSamples: MatrixChartSample[];
  /** All top-level SVG roots inside the audited story, including hidden roots. */
  svgRootCount: number;
}

export interface GeometryMove {
  key: string;
  property: string;
  before: string;
  after: string;
}

export interface GeometryDiff {
  identical: boolean;
  /** Elements present in `before` but missing in `after`. */
  removedKeys: string[];
  /** Elements present in `after` but missing in `before`. */
  addedKeys: string[];
  moves: GeometryMove[];
}

export interface TextContrastViolation {
  key: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
  required: number;
}

export interface TextContrastResult {
  measured: number;
  unmeasurable: number;
  violations: TextContrastViolation[];
}

// ── Browser-side capture (self-contained for page.evaluate) ──────────────────

/**
 * Captures geometry, direct text ink and SVG glyph paint in the rendered story.
 *
 * Self-contained by construction — pass directly to
 * `page.evaluate(captureMatrixSnapshot)`.
 */
export const captureMatrixSnapshot = (): MatrixSnapshot => {
  // parseFloat tolerates unit suffixes ('2px', '50%'); Number() would turn those into NaN.
  const toFloat = Number.parseFloat;
  const NONE = 'none';
  const UNRESOLVED_BACKDROP = 'unresolved-backdrop' as const;
  const UNSUPPORTED_PAINT = 'unsupported-paint' as const;
  // dataset exists on HTMLElement and SVGElement; no other node kind in a story carries data attributes.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const dataOf = (el: Element): DOMStringMap =>
    el instanceof HTMLElement || el instanceof SVGElement ? el.dataset : {};
  const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'head', 'title', 'noscript', 'br', 'wbr', 'template']);

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const roundTo = (value: number, steps: number) => Math.round(value * steps) / steps;
  const round = (n: number) => roundTo(n, 4);

  const toRect = (r: DOMRect) => ({
    x: round(r.x),
    y: round(r.y),
    w: round(r.width),
    h: round(r.height),
  });

  const alphaValue = (raw: string) => (raw.endsWith('%') ? toFloat(raw) / 100 : toFloat(raw));

  // rgb()/rgba() → [r,g,b,a]; anything else → null (gradients, keywords).
  const parseCssColor = (raw: string): [number, number, number, number] | null => {
    const s = raw.trim().toLowerCase();
    if (s === 'transparent') {
      return [0, 0, 0, 0];
    }
    const groups =
      /^rgba?\(\s*(?<r>[\d.]+)[\s,]+(?<g>[\d.]+)[\s,]+(?<b>[\d.]+)(?:[\s,/]+(?<alpha>[\d.%]+))?\s*\)$/u.exec(s)?.groups;
    if (!groups) {
      return null;
    }
    const { r, g, b, alpha } = groups;
    return [toFloat(r), toFloat(g), toFloat(b), alpha === undefined ? 1 : alphaValue(alpha)];
  };

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const toHex = (rgb: [number, number, number]): string => {
    const channels = rgb.map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    );
    return `#${channels.join('')}`;
  };

  // Composite `top` (with alpha) over opaque `bottom`.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const blend = (top: [number, number, number, number], bottom: [number, number, number]): [number, number, number] => {
    const [topR, topG, topB, a] = top;
    const [bottomR, bottomG, bottomB] = bottom;
    return [topR * a + bottomR * (1 - a), topG * a + bottomG * (1 - a), topB * a + bottomB * (1 - a)];
  };

  /**
   * Effective backdrop behind an element: walk ancestors collecting
   * backgroundColor layers until one is opaque, then composite downward.
   * Reports whether the chain actually resolved and whether a
   * background-image sits in it.
   */
  const effectiveBackground = (el: Element) => {
    const layers: [number, number, number, number][] = [];
    let overImage = false;
    let node: Element | null = el;
    let opaqueBase: [number, number, number] | null = null;
    while (node) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== '' && cs.backgroundImage !== NONE) {
        overImage = true;
      }
      if (dataOf(node).mpoChartBackdrop === 'patterned') {
        overImage = true;
      }
      const parsed = parseCssColor(cs.backgroundColor);
      if (parsed && parsed[3] > 0) {
        if (parsed[3] >= 0.999) {
          opaqueBase = [parsed[0], parsed[1], parsed[2]];
          break;
        }
        layers.push(parsed);
      }
      node = node.parentElement;
    }
    if (!opaqueBase) {
      // No opaque layer up the chain — an honest measurement is impossible.
      return { hex: '#ffffff', resolved: false, overImage };
    }
    let acc = opaqueBase;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      acc = blend(layers[i], acc);
    }
    return { hex: toHex(acc), resolved: !overImage, overImage };
  };

  // Multiplied opacity from the element up to the root.
  const effectiveOpacity = (el: Element): number => {
    let o = 1;
    let node: Element | null = el;
    while (node) {
      const v = toFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(v)) {
        o *= v;
      }
      node = node.parentElement;
    }
    return o;
  };

  const visible = (node: Element): boolean => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const hiddenVisibility = style.visibility === 'hidden' || style.visibility === 'collapse';
    const hasBox = rect.width > 0 || rect.height > 0;
    return !hiddenVisibility && effectiveOpacity(node) > 0 && hasBox;
  };

  const roundMilli = (value: number) => roundTo(value, 1000);
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const pathTokens = (path: string): string => {
    const tokens: string[] =
      path
        .replaceAll(/^path\(["']?|["']?\)$/gu, '')
        .match(/[a-zA-Z]|[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/gu) ?? [];
    return JSON.stringify(tokens.map((token) => (Number.isNaN(Number(token)) ? token : Number(token))));
  };

  const GEOMETRY_PROPS = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'rowGap',
    'columnGap',
    'fontSize',
    'fontWeight',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
  ] as const;

  // Prefer the preview's stable inner root. `#storybook-root` also contains
  // the Tamagui `<Theme>` host, which is present only when a colour global
  // is set — capturing there reports a remount as geometry drift.
  const matrixRoot = document.querySelector('#mpo-matrix-root') ?? document.querySelector('[data-mpo-matrix-root]');
  const root =
    matrixRoot ?? document.querySelector('#storybook-root') ?? document.querySelector('#root') ?? document.body;
  const storyRendered = root != null && root.children.length > 0;

  const geometry: MatrixElementGeometry[] = [];
  const textSamples: MatrixTextSample[] = [];
  const iconSamples: MatrixIconSample[] = [];
  const chartSamples: MatrixChartSample[] = [];
  let svgRootCount = 0;
  const capturedSvgRoots = new Set<Element>();

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises this function alone, so every helper must live inside it
  const accessibleName = (el: Element): string => {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy !== null && labelledBy !== '') {
      const name = labelledBy
        .split(/\s+/u)
        // oxlint-disable-next-line unicorn/prefer-query-selector -- aria-labelledby tokens are raw ids; getElementById needs no CSS escaping
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
      if (name !== '') {
        return name.slice(0, 100);
      }
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: 'labels' in el means a labelable form control, and every such control types `labels` as NodeListOf<HTMLLabelElement> | null
    const labels = 'labels' in el ? (el.labels as NodeListOf<HTMLLabelElement> | null) : null;
    const labelText = labels ? [...labels].map((label) => label.textContent ?? '').join(' ') : '';
    const candidates = [el.getAttribute('aria-label'), labelText, el.getAttribute('title'), el.textContent];
    const name = candidates.find((candidate) => candidate !== null && candidate !== '') ?? '';
    return name.trim().slice(0, 100);
  };

  const controlName = (el: Element): string => {
    // Compound fields put their glyph beside the named input. aria-hidden on
    // that glyph avoids a duplicate AT stop; it does not make its paint optional.
    if (el.matches('[data-mp-input-box]')) {
      const input = el.querySelector('input, textarea, select');
      if (input) {
        const inputName = accessibleName(input);
        if (inputName !== '') {
          return inputName;
        }
        const placeholder = input.getAttribute('placeholder');
        return placeholder !== null && placeholder !== '' ? placeholder : 'input';
      }
    }
    return accessibleName(el);
  };

  const unsupportedCompositing = (el: Element): boolean => {
    let backgroundInGroup = false;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      const background = parseCssColor(cs.backgroundColor);
      if (background && background[3] > 0) {
        backgroundInGroup = true;
      }
      // Alpha on a group containing a background changes both sides of the
      // contrast pair. Multiplying only ink alpha would invent a measurement.
      if (toFloat(cs.opacity) < 1 && backgroundInGroup) {
        return true;
      }
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') {
        return true;
      }
    }
    return false;
  };

  // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one ordered list of exclusion and unmeasurable-paint checks; splitting it scatters the verdict order
  const collectIcon = (el: Element, key: string, cs: CSSStyleDeclaration): void => {
    if (el.tagName.toLowerCase() !== 'svg' || el.parentElement?.closest('svg')) {
      return;
    }
    const backdrop = effectiveBackground(el);
    const rect = el.getBoundingClientRect();
    const sample: MatrixIconSample = {
      key,
      context: accessibleName(el),
      status: 'conveying',
      background: backdrop.hex,
      backgroundResolved: backdrop.resolved,
      overImage: backdrop.overImage,
      // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- field of the exported MatrixIconSample snapshot
      shapeCount: 0,
      distinctPaints: 0,
      rect: toRect(rect),
    };
    iconSamples.push(sample);
    const collapsedVisibility = cs.visibility === 'hidden' || cs.visibility === 'collapse';
    const emptyBox = rect.width === 0 || rect.height === 0;
    if (collapsedVisibility || emptyBox || effectiveOpacity(el) === 0) {
      sample.status = 'hidden';
      return;
    }
    if (el.closest('[disabled], [aria-disabled="true"], [data-disabled="true"]')) {
      sample.status = 'disabled-control';
      return;
    }
    const controls =
      'button, a[href], label, summary, [data-mp-input-box], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"]';
    let namedControl: Element | null = el.closest(controls);
    while (namedControl && !controlName(namedControl)) {
      namedControl = namedControl.parentElement?.closest(controls) ?? null;
    }
    if (namedControl) {
      sample.context = controlName(namedControl);
    } else if (el.closest('[aria-hidden="true"], [role="presentation"], [role="none"]')) {
      sample.status = 'decorative-standalone';
      return;
    }
    if (!backdrop.resolved) {
      sample.unmeasurable = UNRESOLVED_BACKDROP;
      return;
    }
    if (el.querySelector('use')) {
      sample.unmeasurable = 'use-indirection';
      return;
    }
    const paintNodes = [el, ...el.querySelectorAll('*')];
    for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
      paintNodes.push(ancestor);
    }
    if (
      paintNodes.some((node) => {
        const style = getComputedStyle(node);
        return (style.filter !== '' && style.filter !== NONE) || (style.maskImage !== '' && style.maskImage !== NONE);
      })
    ) {
      sample.unmeasurable = 'masked-or-filtered';
      return;
    }
    const background: [number, number, number] = [
      Number.parseInt(backdrop.hex.slice(1, 3), 16),
      Number.parseInt(backdrop.hex.slice(3, 5), 16),
      Number.parseInt(backdrop.hex.slice(5, 7), 16),
    ];
    const paints = new Set<string>();
    const kinds = new Set<'fill' | 'stroke'>();
    // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard-clause continues keep this paint walk flat
    for (const drawable of el.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, tspan')) {
      // Definitions do not paint until referenced; <use> is scoped out above.
      if (drawable.closest('defs, clipPath, mask, pattern, marker, symbol')) {
        continue;
      }
      const style = getComputedStyle(drawable);
      let hiddenGroup = false;
      for (let node: Element | null = drawable; node && node !== el; node = node.parentElement) {
        if (getComputedStyle(node).display === NONE) {
          hiddenGroup = true;
        }
      }
      const hiddenStyle = style.display === NONE || style.visibility === 'hidden' || style.visibility === 'collapse';
      if (hiddenGroup || hiddenStyle || effectiveOpacity(drawable) === 0) {
        continue;
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the selector above yields only SVG painting elements, all of which are SVGGraphicsElement
      const bounds = (drawable as SVGGraphicsElement).getBBox();
      if (
        typeof SVGGeometryElement !== 'undefined' &&
        drawable instanceof SVGGeometryElement &&
        drawable.getTotalLength() === 0
      ) {
        continue;
      }
      sample.shapeCount += 1;
      if (unsupportedCompositing(drawable)) {
        sample.unmeasurable = 'unsupported-compositing';
        return;
      }
      if ([style.markerStart, style.markerMid, style.markerEnd].some((value) => value !== '' && value !== NONE)) {
        sample.unmeasurable = UNSUPPORTED_PAINT;
        return;
      }
      const strokeWidth = toFloat(style.strokeWidth);
      const noStroke = Number.isNaN(strokeWidth) || strokeWidth <= 0;
      const noFill = drawable.tagName.toLowerCase() === 'line' || bounds.width === 0 || bounds.height === 0;
      // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard-clause continues keep this paint walk flat
      for (const kind of ['fill', 'stroke'] as const) {
        if ((kind === 'fill' && noFill) || (kind === 'stroke' && noStroke)) {
          continue;
        }
        const raw = style[kind].trim().toLowerCase();
        if (raw === NONE) {
          continue;
        }
        const ink = parseCssColor(raw === 'currentcolor' ? style.color : raw);
        if (!ink) {
          sample.unmeasurable = UNSUPPORTED_PAINT;
          return;
        }
        const paintOpacity = alphaValue(kind === 'fill' ? style.fillOpacity : style.strokeOpacity);
        ink[3] *= (Number.isFinite(paintOpacity) ? paintOpacity : 1) * effectiveOpacity(drawable);
        if (ink[3] === 0) {
          continue;
        }
        paints.add(toHex(blend(ink, background)));
        kinds.add(kind);
      }
    }
    sample.distinctPaints = paints.size;
    if (paints.size === 0) {
      sample.unmeasurable = 'no-paint';
    } else if (paints.size > 1) {
      sample.unmeasurable = 'multicolor';
    } else {
      [sample.paint] = paints;
      sample.paintKinds = [...kinds];
    }
  };

  // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one ordered proof pipeline (backdrop, separation, mark, label and chrome channels) that shares the sample being built
  const collectChart = (el: Element, key: string): void => {
    const backdrop = effectiveBackground(el);
    const rawCount = dataOf(el).mpoChartDatumCount;
    const expected = rawCount !== undefined && /^\d+$/u.test(rawCount) ? Number(rawCount) : -1;
    const owner = el.closest('[data-mpo-chart-owner]');
    const rows = owner
      ? [...owner.querySelectorAll('[data-mpo-chart-datum-text]')].filter(
          (row) => row.tagName.toLowerCase() !== 'svg' && row.closest('[data-mpo-chart-owner]') === owner,
        )
      : [];
    const chromeLines: MatrixChartPaint[] = [];
    const unaccountedPaints: MatrixChartPaint[] = [];
    const completeRows = rows.filter((row, index) => {
      const name = row.querySelector('[data-mpo-chart-datum-label]');
      const value = row.querySelector('[data-mpo-chart-datum-value]');
      if (dataOf(row).mpoChartDatumText !== String(index) || name === null || value === null) {
        return false;
      }
      const nameText = name.textContent?.trim() ?? '';
      const valueText = value.textContent?.trim() ?? '';
      return visible(name) && visible(value) && nameText !== '' && valueText !== '';
    });
    const sample: MatrixChartSample = {
      key,
      kind: dataOf(el).mpoChart ?? '',
      context: accessibleName(el),
      label: (el.getAttribute('aria-label') ?? '').trim(),
      background: backdrop.hex,
      backgroundResolved: backdrop.resolved,
      marks: [],
      labels: [],
      chrome: chromeLines,
      unaccountedPaint: unaccountedPaints,
      separation: { declared: dataOf(el).mpoChartSeparated === 'true' },
      datumText: {
        viewId: dataOf(el).mpoChartDataView,
        expectedValues: dataOf(el).mpoChartDataExpected,
        declared: dataOf(el).mpoChartDatumText === 'true',
        expected,
        observed: completeRows.length,
        complete: expected > 0 && rows.length === expected && completeRows.length === expected,
      },
    };
    chartSamples.push(sample);
    if (!visible(el)) {
      sample.unmeasurable = 'hidden-chart';
    } else if (!backdrop.resolved) {
      sample.unmeasurable = UNRESOLVED_BACKDROP;
    } else if (el.querySelector('use')) {
      sample.unmeasurable = 'use-indirection';
    }

    const marks = [...el.querySelectorAll('[data-mpo-chart-mark]')];
    const certifiedMasks = new Set<Element>();
    if ((sample.kind === 'pie' || sample.kind === 'donut') && marks.length > 1) {
      // Certification checks the original partition as well as the mask. A
      // matching mask on arbitrary overlapping paths would not prove a gap.
      const point = (radius: number, angle: number) =>
        `${roundMilli(radius * Math.cos(angle - Math.PI / 2))},${roundMilli(radius * Math.sin(angle - Math.PI / 2))}`;
      // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one ordered list of geometry and style checks that must all hold for a mask to be certified
      const proofs = marks.map((mark) => {
        if (mark.tagName.toLowerCase() !== 'path' || dataOf(mark).mpoChartMask !== 'eroded-arc-v1') {
          return null;
        }
        const values = (dataOf(mark).mpoChartSlice ?? '').split(',').map(Number);
        if (values.length !== 4 || !values.every(Number.isFinite)) {
          return null;
        }
        const [start, end, inner, outer] = values;
        const span = end - start;
        const badSpan = start < 0 || end > Math.PI * 2 + 1e-9 || span <= 0 || span >= Math.PI * 2;
        if (badSpan || inner < 0 || outer <= inner) {
          return null;
        }
        const radius = (inner + outer) / 2;
        const projection = Math.min(outer, Math.max(inner, radius * Math.cos(span / 2)));
        const radialDistance = Math.sqrt(
          Math.max(0, radius ** 2 + projection ** 2 - 2 * radius * projection * Math.cos(span / 2)),
        );
        if (outer - radius <= 1.002 || radius - inner <= 1.002 || radialDistance <= 1.002) {
          return null;
        }
        const large = Number(span >= Math.PI);
        const d = `M${point(outer, start)}A${roundMilli(outer)},${roundMilli(outer)},0,${large},1,${point(outer, end)}${
          inner
            ? `L${point(inner, end)}A${roundMilli(inner)},${roundMilli(inner)},0,${large},0,${point(inner, start)}Z`
            : 'L0,0Z'
        }`;
        if (mark.getAttribute('d') !== d) {
          return null;
        }
        const markStyle = getComputedStyle(mark);
        // CSS can replace presentation attributes, including the actual path.
        const paintedD = markStyle.getPropertyValue('d');
        if (paintedD && pathTokens(paintedD) !== pathTokens(d)) {
          return null;
        }
        if (markStyle.stroke !== NONE) {
          return null;
        }
        const referenceId = /^url\(["']?#(?<id>[^"')]+)["']?\)$/u.exec(mark.getAttribute('mask') ?? '')?.groups?.id;
        if (referenceId === undefined) {
          return null;
        }
        const matches = [...document.querySelectorAll('[id]')].filter((node) => node.id === referenceId);
        const [mask] = matches;
        if (matches.length !== 1 || mask.tagName.toLowerCase() !== 'mask' || !el.contains(mask)) {
          return null;
        }
        const definitions = mask.parentElement;
        if (definitions?.tagName.toLowerCase() !== 'defs' || definitions.parentElement !== mark.parentElement) {
          return null;
        }
        const computedReference = /^url\(["']?(?<target>[^"')]+)["']?\)$/u.exec(markStyle.maskImage)?.groups?.target;
        if (computedReference === undefined || !['match-source', 'luminance'].includes(markStyle.maskMode)) {
          return null;
        }
        try {
          if (new URL(computedReference, document.baseURI).href !== new URL(`#${referenceId}`, document.URL).href) {
            return null;
          }
        } catch {
          return null;
        }
        if (
          mask.getAttribute('maskUnits') !== 'userSpaceOnUse' ||
          mask.getAttribute('maskContentUnits') !== 'userSpaceOnUse' ||
          getComputedStyle(mask).getPropertyValue('mask-type') !== 'luminance'
        ) {
          return null;
        }
        const bounds = {
          x: -outer - 2,
          y: -outer - 2,
          width: (outer + 2) * 2,
          height: (outer + 2) * 2,
        };
        if (Object.entries(bounds).some(([name, value]) => Number(mask.getAttribute(name)) !== value)) {
          return null;
        }
        if (mask.children.length !== 1) {
          return null;
        }
        const [boundary] = mask.children;
        if (boundary.tagName.toLowerCase() !== 'path' || boundary.getAttribute('d') !== d) {
          return null;
        }
        for (const node of [definitions, mask, boundary]) {
          const style = getComputedStyle(node);
          const transformed = style.transform !== NONE || style.filter !== NONE || style.maskImage !== NONE;
          const concealed = style.clipPath !== NONE || style.opacity !== '1' || style.visibility !== 'visible';
          if (transformed || concealed || style.display === NONE) {
            return null;
          }
          if ([style.markerStart, style.markerMid, style.markerEnd].some((value) => value !== '' && value !== NONE)) {
            return null;
          }
        }
        if (unsupportedCompositing(boundary)) {
          return null;
        }
        const boundaryStyle = getComputedStyle(boundary);
        const paintMismatch =
          boundaryStyle.fill !== 'rgb(255, 255, 255)' ||
          boundaryStyle.stroke !== 'rgb(0, 0, 0)' ||
          boundaryStyle.fillOpacity !== '1' ||
          boundaryStyle.strokeOpacity !== '1';
        const strokeMismatch =
          toFloat(boundaryStyle.strokeWidth) !== 2 ||
          boundaryStyle.strokeLinejoin !== 'round' ||
          boundaryStyle.strokeLinecap !== 'round' ||
          boundaryStyle.paintOrder !== 'normal';
        const effectMismatch = boundaryStyle.vectorEffect !== NONE || boundaryStyle.strokeDasharray !== NONE;
        if (paintMismatch || strokeMismatch || effectMismatch) {
          return null;
        }
        const boundaryD = boundaryStyle.getPropertyValue('d');
        if (boundaryD && pathTokens(boundaryD) !== pathTokens(d)) {
          return null;
        }
        for (let node: Element | null = mark; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.transform.startsWith('matrix3d') || (style.perspective !== '' && style.perspective !== NONE)) {
            return null;
          }
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: only <path> marks with the eroded-arc attribute reach this point, and <path> is an SVGGraphicsElement
        const ctm = (mark as SVGGraphicsElement).getScreenCTM();
        if (!ctm) {
          return null;
        }
        const matrix = [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f];
        // This two-hypot form avoids the squared discriminant's cancellation
        // near rotations, where the singular values are equal.
        const firstScale = Math.hypot(ctm.a + ctm.d, ctm.b - ctm.c);
        const secondScale = Math.hypot(ctm.a - ctm.d, ctm.b + ctm.c);
        const smallest = Math.abs(firstScale - secondScale) / 2;
        if (!matrix.every(Number.isFinite) || !Number.isFinite(smallest) || smallest <= 0) {
          return null;
        }
        const measuredGap = 2 * smallest * window.devicePixelRatio;
        // Unit rotations can round one double below2. Only the bounded
        // arithmetic uncertainty at this boundary is snapped, never a visual
        // tolerance. A representable shrink remains below the floor.
        const gap = Math.abs(measuredGap - 2) <= 8 * Number.EPSILON ? 2 : measuredGap;
        return {
          mark,
          start,
          end,
          inner,
          outer,
          matrix,
          gap,
        };
      });
      const proven = proofs.filter((proof): proof is NonNullable<typeof proof> => proof !== null);
      const [first] = proven;
      const last = proven.at(-1);
      const contiguous = proven.every((proof, index) => {
        const previousEnd = index > 0 ? proven[index - 1].end : 0;
        const sameRing = proof.inner === first.inner && proof.outer === first.outer;
        const sameMatrix =
          proof.matrix.length === first.matrix.length &&
          proof.matrix.every((value, axis) => value === first.matrix[axis]);
        return sameRing && sameMatrix && Math.abs(proof.start - previousEnd) < 1e-9;
      });
      const hasBounds = first !== undefined && last !== undefined && proven.length === proofs.length;
      if (hasBounds && contiguous && Math.abs(first.start) < 1e-9 && Math.abs(last.end - Math.PI * 2) < 1e-9) {
        for (const proof of proven) {
          certifiedMasks.add(proof.mark);
        }
        sample.separation.method = 'eroded-arc';
        sample.separation.minimumGapPx = first.gap;
      }
    }

    // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one ordered list of unmeasurable-paint early exits before the paint is measured
    const paintSample = (drawable: Element, paintKey: string, label: string): MatrixChartPaint => {
      const item: MatrixChartPaint = { key: paintKey, label, background: backdrop.hex };
      if (drawable.closest('defs, clipPath, mask, pattern, marker, symbol')) {
        return { ...item, unmeasurable: 'no-paint' };
      }
      if (!visible(drawable)) {
        return { ...item, unmeasurable: 'no-paint' };
      }
      if (!backdrop.resolved) {
        return { ...item, unmeasurable: UNRESOLVED_BACKDROP };
      }
      for (let node: Element | null = drawable; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const filtered = style.filter !== '' && style.filter !== NONE;
        const masked =
          style.maskImage !== '' && style.maskImage !== NONE && !(node === drawable && certifiedMasks.has(drawable));
        if (filtered || masked) {
          return { ...item, unmeasurable: 'masked-or-filtered' };
        }
        // SVG clip paths and CSS clipping can hide portions of a mark. This
        // bounded model does not certify the remaining painted shape.
        if (style.clipPath !== '' && style.clipPath !== NONE) {
          return { ...item, unmeasurable: UNSUPPORTED_PAINT };
        }
      }
      if (unsupportedCompositing(drawable)) {
        return { ...item, unmeasurable: 'unsupported-compositing' };
      }
      const style = getComputedStyle(drawable);
      if ([style.markerStart, style.markerMid, style.markerEnd].some((value) => value !== '' && value !== NONE)) {
        return { ...item, unmeasurable: UNSUPPORTED_PAINT };
      }
      let bounds: DOMRect;
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: callers pass only SVG painting elements, which are SVGGraphicsElement; a non-graphics node would throw here and be reported unsupported
        bounds = (drawable as SVGGraphicsElement).getBBox();
      } catch {
        return { ...item, unmeasurable: UNSUPPORTED_PAINT };
      }
      const background: [number, number, number] = [
        Number.parseInt(backdrop.hex.slice(1, 3), 16),
        Number.parseInt(backdrop.hex.slice(3, 5), 16),
        Number.parseInt(backdrop.hex.slice(5, 7), 16),
      ];
      const paints = new Set<string>();
      const strokeWidth = toFloat(style.strokeWidth);
      const noStroke = Number.isNaN(strokeWidth) || strokeWidth <= 0;
      const noFill = drawable.tagName.toLowerCase() === 'line' || bounds.width === 0 || bounds.height === 0;
      // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard-clause continues keep this paint walk flat
      for (const kind of ['fill', 'stroke'] as const) {
        if ((kind === 'fill' && noFill) || (kind === 'stroke' && noStroke)) {
          continue;
        }
        const raw = style[kind].trim().toLowerCase();
        if (raw === NONE) {
          continue;
        }
        const ink = parseCssColor(raw === 'currentcolor' ? style.color : raw);
        if (!ink) {
          return { ...item, unmeasurable: UNSUPPORTED_PAINT };
        }
        const alpha = alphaValue(kind === 'fill' ? style.fillOpacity : style.strokeOpacity);
        ink[3] *= (Number.isFinite(alpha) ? alpha : 1) * effectiveOpacity(drawable);
        if (ink[3] > 0) {
          paints.add(toHex(blend(ink, background)));
        }
      }
      if (paints.size !== 1) {
        return { ...item, unmeasurable: paints.size ? 'multicolor' : 'no-paint' };
      }
      return { ...item, paint: [...paints][0] };
    };

    for (const [index, mark] of marks.entries()) {
      const tag = mark.tagName.toLowerCase();
      const declaredLabel = dataOf(mark).mpoChartMark;
      const markLabel = declaredLabel === undefined || declaredLabel === '' ? `mark ${index + 1}` : declaredLabel;
      const item = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)
        ? paintSample(mark, `${key}/mark:${index}`, markLabel)
        : {
            key: `${key}/mark:${index}`,
            label: dataOf(mark).mpoChartMark ?? '',
            background: backdrop.hex,
            unmeasurable: UNSUPPORTED_PAINT,
          };
      sample.marks.push(item);
    }
    for (const [index, node] of [...el.querySelectorAll('text, tspan')].entries()) {
      // A text parent with tspan children owns no direct ink. Measure each
      // actual text run once, including non-default SVG fill and alpha.
      const text = [...node.childNodes]
        .flatMap((child) => (child.nodeType === 3 ? [child.textContent ?? ''] : []))
        .join('')
        .trim();
      if (text) {
        sample.labels.push(paintSample(node, `${key}/label:${index}`, text));
      }
    }
    const drawables = el.querySelectorAll(
      'path, rect, circle, ellipse, line, polyline, polygon, image, foreignObject, use',
    );
    // oxlint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard-clause continues keep this classification flat
    for (const [index, drawable] of [...drawables].entries()) {
      if (dataOf(drawable).mpoChartMark !== undefined) {
        continue;
      }
      const tag = drawable.tagName.toLowerCase();
      const item = paintSample(drawable, `${key}/drawable:${index}`, `unaccounted ${tag}`);
      // Transparent hit targets and definition geometry contribute no paint.
      if (item.unmeasurable === 'no-paint') {
        continue;
      }
      const chrome = dataOf(drawable).mpoChartChrome;
      const style = getComputedStyle(drawable);
      const rect = drawable.getBoundingClientRect();
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the selector yields SVG drawing elements; the optional call tolerates the ones (image, foreignObject, use) that lack getScreenCTM in this DOM
      const ctm = (drawable as SVGGraphicsElement).getScreenCTM?.();
      const squareSum = ctm ? ctm.a ** 2 + ctm.b ** 2 + ctm.c ** 2 + ctm.d ** 2 : Number.NaN;
      const determinant = ctm ? ctm.a * ctm.d - ctm.b * ctm.c : Number.NaN;
      // Largest singular scale bounds stroke expansion under the complete
      // screen transform, including skew and nonuniform ancestor scaling.
      const largestScale = Math.sqrt((squareSum + Math.sqrt(Math.max(0, squareSum ** 2 - 4 * determinant ** 2))) / 2);
      const screenStrokeWidth = toFloat(style.strokeWidth) * largestScale;
      const isChromeLine = (chrome === 'axis' || chrome === 'grid') && tag === 'line';
      const flat = rect.width === 0 || rect.height === 0;
      const thinStroke = Number.isFinite(screenStrokeWidth) && screenStrokeWidth <= 1 && screenStrokeWidth > 0;
      const thinAxisLine = isChromeLine && flat && thinStroke && !item.unmeasurable;
      if (thinAxisLine) {
        chromeLines.push({ ...item, label: `${chrome} line` });
      } else {
        unaccountedPaints.push({ ...item, unmeasurable: UNSUPPORTED_PAINT });
      }
    }
    if (
      sample.kind === 'bar' &&
      marks.length > 0 &&
      marks.every((mark, index) => {
        const markTag = mark.tagName.toLowerCase();
        // A bar path that declares its box (value-end rounding)
        // paints inside that box just as a rect does.
        const boxed = markTag === 'rect' || (markTag === 'path' && dataOf(mark).mpoChartBar !== undefined);
        return boxed && getComputedStyle(mark).stroke === NONE && !sample.marks[index].unmeasurable;
      })
    ) {
      // AABB distance is a conservative lower bound on actual fill distance.
      // All pairs, not only neighbors, must have the physical-pixel gap.
      let minimumGapPx = Infinity;
      const bounds = marks.map((mark) => mark.getBoundingClientRect());
      for (let i = 0; i < bounds.length; i += 1) {
        for (let j = i + 1; j < bounds.length; j += 1) {
          const a = bounds[i];
          const b = bounds[j];
          const dx = Math.max(0, a.left - b.right, b.left - a.right);
          const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
          minimumGapPx = Math.min(minimumGapPx, Math.hypot(dx, dy) * window.devicePixelRatio);
        }
      }
      sample.separation.method = 'rect-bounds';
      // With one mark there is no adjacent boundary to separate.
      sample.separation.minimumGapPx = Number.isFinite(minimumGapPx) ? minimumGapPx : 2;
    }
    // Area fill sits behind the series stroke. A DOM ancestor backdrop walk
    // cannot measure that composition, so no clean verdict is invented.
    if (sample.kind === 'area') {
      sample.unmeasurable ??= 'unsupported-overlap';
    }
  };

  /**
   * The element's own painted text, if any: the Range-measured rect of its
   * DIRECT text nodes plus the composited ink/backdrop sample. Returns the
   * rect so a boxed element can carry it as `textRect`.
   *
   * Split out of `visit` so a boxless (`display: contents`) wrapper that
   * happens to hold text still contributes its sample — dropping a text
   * measurement would read as a pass.
   */
  const collectText = (el: Element, key: string, cs: CSSStyleDeclaration): MatrixRect | undefined => {
    const directText: Text[] = [];
    for (const child of el.childNodes) {
      if (child instanceof Text && (child.textContent ?? '').trim().length > 0) {
        directText.push(child);
      }
    }
    const [firstText] = directText;
    if (firstText === undefined) {
      return undefined;
    }
    const range = document.createRange();
    range.setStartBefore(firstText);
    range.setEndAfter(directText.at(-1) ?? firstText);
    const textRect = range.getBoundingClientRect();
    if (!(textRect.width > 0 && textRect.height > 0)) {
      return undefined;
    }
    const opacity = effectiveOpacity(el);
    if (opacity > 0.05 && cs.visibility !== 'hidden') {
      const ink = parseCssColor(cs.color);
      const backdrop = effectiveBackground(el);
      if (ink) {
        const baseParsed = parseCssColor(backdrop.hex) ?? [255, 255, 255, 1];
        const inkOpaque = toHex(
          ink[3] >= 0.999 ? [ink[0], ink[1], ink[2]] : blend(ink, [baseParsed[0], baseParsed[1], baseParsed[2]]),
        );
        textSamples.push({
          key,
          text: (firstText.textContent ?? '').trim().slice(0, 60),
          color: inkOpaque,
          background: backdrop.hex,
          backgroundResolved: backdrop.resolved,
          overImage: backdrop.overImage,
          fontSizePx: toFloat(cs.fontSize) || 0,
          fontWeightNum: toFloat(cs.fontWeight) || 400,
          rect: toRect(textRect),
        });
      }
    }
    return toRect(textRect);
  };

  /**
   * The children that actually generate a BOX, hoisting straight through
   * `display: contents`.
   *
   * This is what makes the structural key survive the colour axis. Tamagui's
   * `<Theme>` emits a boxless passthrough span when the requested theme is
   * already the active one and a real theme host when it differs, so the
   * number of wrapper spans is a function of the colour global itself.
   * Counting them made every coloured cell report `+N/-M elements` with ZERO
   * moves — a keying artefact wearing the costume of a geometry failure.
   * Measured on dogfood--settings at scheme:light: 158 nodes at the default
   * colour, 151 with `color:blue`, 142 with `color:gray`; hoisting through
   * the boxless wrappers gives 130 in every cell, light and dark, default and
   * bold. Nothing an invariance gate can assert is lost, because an element
   * with no box has no geometry to move.
   */
  const boxedChildren = (el: Element, path: string): Element[] => {
    const out: Element[] = [];
    const counts: Record<string, number> = {};
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      // SVG internals: the <svg> box is geometry enough; paths repaint per theme.
      const svgInternal = child.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'svg';
      const cs = getComputedStyle(child);
      if (SKIP_TAGS.has(tag) || svgInternal || cs.display === NONE) {
        continue;
      }
      if (cs.display === 'contents') {
        const index = counts[tag] ?? 0;
        counts[tag] = index + 1;
        collectText(child, `${path}/${tag}:${index}~contents`, cs);
        for (const grandchild of boxedChildren(child, path)) {
          out.push(grandchild);
        }
      } else {
        out.push(child);
      }
    }
    return out;
  };

  const visit = (el: Element, path: string): void => {
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);

    const rect = el.getBoundingClientRect();
    const props: Record<string, string> = {};
    for (const prop of GEOMETRY_PROPS) {
      props[prop] = cs[prop];
    }

    const entry: MatrixElementGeometry = {
      key: path,
      tag,
      rect: toRect(rect),
      props,
    };

    // Direct text nodes — the painted text, measured via Range (never the frame).
    const textRect = collectText(el, path, cs);
    if (textRect) {
      entry.textRect = textRect;
    }
    if (tag === 'svg' && !el.parentElement?.closest('svg')) {
      capturedSvgRoots.add(el);
      if (dataOf(el).mpoChart === undefined) {
        collectIcon(el, path, cs);
      } else {
        collectChart(el, path);
      }
    }

    geometry.push(entry);

    // Children keyed by tag-scoped sibling index so the path is stable when
    // only class names change between theme cells.
    const counts: Record<string, number> = {};
    for (const child of boxedChildren(el, path)) {
      const childTag = child.tagName.toLowerCase();
      const index = counts[childTag] ?? 0;
      counts[childTag] = index + 1;
      visit(child, `${path}/${childTag}:${index}`);
    }
  };

  if (root != null) {
    const counts: Record<string, number> = {};
    for (const child of boxedChildren(root, '')) {
      const childTag = child.tagName.toLowerCase();
      const index = counts[childTag] ?? 0;
      counts[childTag] = index + 1;
      visit(child, `${childTag}:${index}`);
    }
    const svgRoots = [...root.querySelectorAll('svg')].filter((svg) => !svg.parentElement?.closest('svg'));
    svgRootCount = svgRoots.length;
    // The geometry walk skips display:none subtrees. Those SVGs still need
    // a channel outcome: hidden icons are excluded, hidden charts unverified.
    for (const [index, svg] of svgRoots.entries()) {
      if (capturedSvgRoots.has(svg)) {
        continue;
      }
      const key = `unpainted-svg:${index}`;
      if (dataOf(svg).mpoChart === undefined) {
        collectIcon(svg, key, getComputedStyle(svg));
      } else {
        collectChart(svg, key);
      }
    }
  }

  return { storyRendered, geometry, textSamples, iconSamples, chartSamples, svgRootCount };
};

// ── Node-side comparators (pure, vitest-covered) ─────────────────────────────

const formatRect = (rect: MatrixRect) => `${rect.x},${rect.y} ${rect.w}x${rect.h}`;

const describeRect = (rect: MatrixRect | undefined) => (rect ? formatRect(rect) : '(none)');

/**
 * Geometry invariance diff for the THEME axis: every element must keep its
 * rect, its text rect, and every geometry-bearing computed property.
 * `epsilonPx` absorbs sub-pixel raster jitter in rect measurements only —
 * computed properties compare exactly.
 */
export const diffGeometry = (
  before: MatrixSnapshot,
  after: MatrixSnapshot,
  options: { epsilonPx?: number } = {},
): GeometryDiff => {
  const epsilon = options.epsilonPx ?? 0;
  const byKey = new Map(before.geometry.map((g) => [g.key, g]));
  const seen = new Set<string>();
  const moves: GeometryMove[] = [];
  const addedKeys: string[] = [];

  const rectDiffers = (a: MatrixRect, b: MatrixRect) =>
    Math.abs(a.x - b.x) > epsilon ||
    Math.abs(a.y - b.y) > epsilon ||
    Math.abs(a.w - b.w) > epsilon ||
    Math.abs(a.h - b.h) > epsilon;

  for (const curr of after.geometry) {
    const prev = byKey.get(curr.key);
    if (!prev) {
      addedKeys.push(curr.key);
      continue;
    }
    seen.add(curr.key);
    if (rectDiffers(prev.rect, curr.rect)) {
      moves.push({
        key: curr.key,
        property: 'rect',
        before: formatRect(prev.rect),
        after: formatRect(curr.rect),
      });
    }
    if (prev.textRect && curr.textRect && rectDiffers(prev.textRect, curr.textRect)) {
      moves.push({
        key: curr.key,
        property: 'textRect',
        before: formatRect(prev.textRect),
        after: formatRect(curr.textRect),
      });
    } else if (!!prev.textRect !== !!curr.textRect) {
      moves.push({
        key: curr.key,
        property: 'textRect',
        before: describeRect(prev.textRect),
        after: describeRect(curr.textRect),
      });
    }
    for (const prop of Object.keys(prev.props)) {
      if (prev.props[prop] !== curr.props[prop]) {
        moves.push({
          key: curr.key,
          property: prop,
          before: prev.props[prop],
          after: curr.props[prop] ?? '(missing)',
        });
      }
    }
  }

  const removedKeys: string[] = [];
  for (const g of before.geometry) {
    if (!seen.has(g.key)) {
      removedKeys.push(g.key);
    }
  }

  return {
    identical: moves.length === 0 && addedKeys.length === 0 && removedKeys.length === 0,
    removedKeys,
    addedKeys,
    moves,
  };
};

/**
 * The contrast assertion for the matrix (and for downstream repos — call
 * this instead of keeping a local contrast spec): WCAG AA floors from
 * `colorRules`, large text (≥24px, or ≥18.66px at ≥700) takes the 3:1
 * floor, everything else 4.5:1. Samples whose backdrop could not be
 * resolved (gradient/image/never-opaque chain) are counted, never
 * silently dropped.
 */
export const evaluateTextContrast = (samples: MatrixTextSample[]): TextContrastResult => {
  let measured = 0;
  let unmeasurable = 0;
  const violations: TextContrastViolation[] = [];
  for (const sample of samples) {
    if (!sample.backgroundResolved) {
      unmeasurable += 1;
      continue;
    }
    const large = sample.fontSizePx >= 24 || (sample.fontSizePx >= 18.66 && sample.fontWeightNum >= 700);
    const required = large ? minContrastRatio : aaTextContrastRatio;
    // Same arithmetic as assertContrast — one floor, one report.
    try {
      const report = measureContrast({
        foreground: sample.color,
        background: sample.background,
        floor: required,
        label: sample.key,
      });
      measured += 1;
      if (!report.pass) {
        violations.push({
          key: sample.key,
          text: sample.text,
          color: report.foreground,
          background: report.background,
          ratio: report.ratio,
          required: report.floor,
        });
      }
    } catch {
      unmeasurable += 1;
    }
  }
  return { measured, unmeasurable, violations };
};

const REASON_UNRESOLVED_BACKDROP = 'unresolved-backdrop' as const;
const REASON_UNSUPPORTED_PAINT = 'unsupported-paint' as const;

const ICON_EXCLUSION_COUNTERS = {
  'disabled-control': 'excludedDisabled',
  'decorative-standalone': 'excludedDecorative',
  hidden: 'excludedHidden',
} as const satisfies Record<IconExclusion, keyof IconContrastResult>;

const iconUnverifiedReason = (sample: MatrixIconSample): IconUnmeasurableReason | undefined => {
  if (sample.unmeasurable !== undefined) {
    return sample.unmeasurable;
  }
  if (!sample.backgroundResolved) {
    return REASON_UNRESOLVED_BACKDROP;
  }
  return sample.paint === undefined || sample.paint === '' ? 'no-paint' : undefined;
};

const measureIconSample = (sample: MatrixIconSample, result: IconContrastResult): void => {
  const reason = iconUnverifiedReason(sample);
  if (reason !== undefined || sample.paint === undefined) {
    result.unverified.push({ key: sample.key, context: sample.context, reason: reason ?? 'no-paint' });
    return;
  }
  try {
    const contrast = measureContrast({
      foreground: sample.paint,
      background: sample.background,
      floor: minContrastRatio,
      label: sample.key,
    });
    result.measured += 1;
    if (!contrast.pass) {
      result.violations.push({
        key: sample.key,
        context: sample.context,
        paint: contrast.foreground,
        background: contrast.background,
        ratio: contrast.ratio,
        required: contrast.floor,
      });
    }
  } catch {
    result.unverified.push({
      key: sample.key,
      context: sample.context,
      reason: REASON_UNSUPPORTED_PAINT,
    });
  }
};

/** A bounded single-ink SVG assertion. Unsupported compositions stay unverified. */
export const evaluateIconContrast = (samples: MatrixIconSample[]): IconContrastResult => {
  const result: IconContrastResult = {
    ok: true,
    candidates: 0,
    measured: 0,
    violations: [],
    unverified: [],
    excludedDisabled: 0,
    excludedDecorative: 0,
    excludedHidden: 0,
  };
  for (const sample of samples) {
    if (sample.status === 'conveying') {
      result.candidates += 1;
      measureIconSample(sample, result);
    } else {
      result[ICON_EXCLUSION_COUNTERS[sample.status]] += 1;
    }
  }
  result.ok = result.violations.length === 0 && result.unverified.length === 0;
  return result;
};

/** Stable named findings for both absolute cell failures and preset attribution. */
export const iconContrastSignatures = (result: IconContrastResult): string[] => [
  ...result.violations.map(
    (item) =>
      `${item.key} (${item.context}) icon ${item.paint} on ${item.background} = ${item.ratio}:1 (floor ${item.required})`,
  ),
  ...result.unverified.map((item) => `${item.key} (${item.context}) icon UNVERIFIED: ${item.reason}`),
];

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

/** Bounded chart proof. Declarations route samples; measured paint decides. */
// oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one ordered pass of per-sample proof rules sharing the result being built
export const evaluateChartProof = (samples: MatrixChartSample[]): ChartProofResult => {
  const result: ChartProofResult = {
    ok: true,
    candidates: samples.length,
    measured: 0,
    marksMeasured: 0,
    labelsMeasured: 0,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Object.create(null) is an empty prototype-free object, valid as an empty Record<string, number> counter map
    byKind: Object.create(null) as Record<string, number>,
    violations: [],
    unverified: [],
  };
  for (const sample of samples) {
    result.byKind[sample.kind] = (result.byKind[sample.kind] ?? 0) + 1;
    const unverified = (reason: ChartUnmeasurableReason, key = sample.key, context = sample.context) =>
      result.unverified.push({ key, context, reason });
    if (!['bar', 'pie', 'donut', 'line', 'area'].includes(sample.kind)) {
      unverified('unknown-kind');
      continue;
    }
    if (sample.label.trim() === '') {
      result.violations.push({ key: sample.key, context: sample.context, rule: 'missing-label' });
    }
    if (sample.unmeasurable !== undefined) {
      unverified(sample.unmeasurable);
    } else if (!sample.backgroundResolved) {
      unverified(REASON_UNRESOLVED_BACKDROP);
    }
    if (!sample.marks.length) {
      unverified('no-marks');
    }
    for (const item of sample.unaccountedPaint ?? []) {
      unverified(REASON_UNSUPPORTED_PAINT, item.key, `${sample.context}: ${item.label}`);
    }
    if (
      !sample.datumText.declared ||
      !sample.datumText.complete ||
      sample.datumText.expected <= 0 ||
      sample.datumText.observed !== sample.datumText.expected
    ) {
      unverified(
        'incomplete-datum-text',
        sample.key,
        hasText(sample.datumText.failure) ? `${sample.context}: ${sample.datumText.failure}` : sample.context,
      );
    }
    const compare = (
      paint: string,
      background: string,
      key: string,
      context: string,
      rule: ChartProofViolation['rule'],
      floor: number,
    ): boolean => {
      try {
        const measured = measureContrast({ foreground: paint, background, floor, label: key });
        if (!measured.pass) {
          result.violations.push({
            key,
            context,
            rule,
            paint: measured.foreground,
            background: measured.background,
            ratio: measured.ratio,
            required: measured.floor,
          });
        }
        return true;
      } catch {
        unverified(REASON_UNSUPPORTED_PAINT, key, context);
        return false;
      }
    };
    for (const mark of sample.marks) {
      const context = `${sample.context}: ${mark.label}`;
      if (mark.unmeasurable !== undefined || !hasText(mark.paint)) {
        unverified(mark.unmeasurable ?? 'no-paint', mark.key, context);
      } else if (compare(mark.paint, mark.background, mark.key, context, 'mark-backdrop', minContrastRatio)) {
        result.marksMeasured += 1;
      }
    }
    for (const label of sample.labels) {
      const context = `${sample.context}: ${label.label}`;
      if (label.unmeasurable !== undefined || !hasText(label.paint)) {
        unverified(label.unmeasurable ?? 'no-paint', label.key, context);
      } else if (compare(label.paint, label.background, label.key, context, 'axis-text', aaTextContrastRatio)) {
        result.labelsMeasured += 1;
      }
    }
    const gapPx = sample.separation.minimumGapPx;
    const separatedByBounds = sample.kind === 'bar' && sample.separation.method === 'rect-bounds';
    const separatedByArcs =
      (sample.kind === 'pie' || sample.kind === 'donut') && sample.separation.method === 'eroded-arc';
    const gapMeasured = gapPx !== undefined && Number.isFinite(gapPx) && gapPx >= 2;
    const separated = (separatedByBounds || separatedByArcs) && gapMeasured;
    if (sample.kind === 'bar' && !separated) {
      unverified('unverified-separation');
    }
    if (sample.kind === 'pie' || sample.kind === 'donut') {
      if (sample.separation.declared && !separated) {
        unverified('unverified-separation');
      }
      if (sample.marks.length > 1 && !separated) {
        for (let i = 0; i < sample.marks.length; i += 1) {
          const first = sample.marks[i];
          const second = sample.marks[(i + 1) % sample.marks.length];
          // A two-mark chart has one unordered pair; larger pies also need
          // the cyclic final-to-first boundary.
          if (sample.marks.length === 2 && i === 1) {
            continue;
          }
          if (
            hasText(first.paint) &&
            hasText(second.paint) &&
            first.unmeasurable === undefined &&
            second.unmeasurable === undefined
          ) {
            compare(
              first.paint,
              second.paint,
              `${first.key}~${second.key}`,
              `${sample.context}: ${first.label} / ${second.label}`,
              'adjacent-pair',
              minContrastRatio,
            );
          }
        }
      }
    }
    if (
      !sample.unmeasurable &&
      sample.backgroundResolved &&
      sample.marks.length > 0 &&
      sample.marks.every((mark) => hasText(mark.paint) && mark.unmeasurable === undefined)
    ) {
      result.measured += 1;
    }
  }
  result.ok = result.violations.length === 0 && result.unverified.length === 0;
  return result;
};

const chartViolationDetail = (item: ChartProofViolation): string =>
  item.ratio === undefined ? '' : ` ${item.paint} on ${item.background} = ${item.ratio}:1 (floor ${item.required})`;

export const chartProofSignatures = (result: ChartProofResult): string[] => [
  ...result.violations.map((item) => `${item.key} (${item.context}) chart ${item.rule}${chartViolationDetail(item)}`),
  ...result.unverified.map((item) => `${item.key} (${item.context}) chart UNVERIFIED: ${item.reason}`),
];

/** One matrix cell's no-breakage inputs (preset axis). */
export interface NoBreakageInput {
  storyRendered: boolean;
  /** Off-scale violation count from `runConstraintAudit` in this cell. */
  offScaleViolations: number;
  /** Off-scale count in the same story+scheme at the DEFAULT preset. */
  baselineOffScaleViolations: number;
  /**
   * Per-violation signatures in this cell — see {@link auditSignatures}. A
   * gate that reports "32 violations where the default cell had 31" names
   * nothing a person can go and fix; with these it names the elements.
   */
  offScaleSignatures?: string[];
  /** The same signatures in the DEFAULT-preset cell. */
  baselineOffScaleSignatures?: string[];
  /** Contrast result of this cell. */
  contrast: TextContrastResult;
  /** Contrast violation count in the same story+scheme at the DEFAULT preset. */
  baselineContrastViolations: number;
  /** The DEFAULT-preset cell's contrast result, for naming the new misses. */
  baselineContrast?: TextContrastResult;
  /**
   * Supply both for icon attribution. Existing text-only callers may omit both;
   * their verdict does not assert icon contrast. The matrix runner supplies both.
   */
  icons?: IconContrastResult;
  baselineIcons?: IconContrastResult;
  charts?: ChartProofResult;
  baselineCharts?: ChartProofResult;
}

/**
 * Flattens a `runConstraintAudit` report into one signature per violation,
 * `"<element label> :: <violation>"`, so two cells can be compared by what
 * broke rather than by how many things broke.
 */
export const auditSignatures = (violations: { key?: string; label: string; violations: string[] }[]): string[] => {
  const out: string[] = [];
  for (const element of violations) {
    for (const violation of element.violations) {
      const keyPrefix = hasText(element.key) ? `[${element.key}] ` : '';
      out.push(`${keyPrefix}${element.label} :: ${violation}`);
    }
  }
  return out;
};

/** Multiset difference: entries in `after` beyond what `before` already had. */
const newEntries = (before: string[], after: string[]): string[] => {
  const remaining = new Map<string, number>();
  for (const entry of before) {
    remaining.set(entry, (remaining.get(entry) ?? 0) + 1);
  }
  const added: string[] = [];
  for (const entry of after) {
    const count = remaining.get(entry) ?? 0;
    if (count > 0) {
      remaining.set(entry, count - 1);
    } else {
      added.push(entry);
    }
  }
  return added;
};

const namedList = (entries: string[], limit = 6): string => {
  if (entries.length === 0) {
    return '';
  }
  const shown = entries.slice(0, limit).join('; ');
  return entries.length > limit ? ` — new: ${shown}; … ${entries.length - limit} more` : ` — new: ${shown}`;
};

const textViolationSignature = (violation: TextContrastViolation) =>
  `${violation.key} "${violation.text}" ${violation.color} on ${violation.background} = ` +
  `${violation.ratio}:1 (floor ${violation.required})`;

export interface NoBreakageResult {
  ok: boolean;
  failures: string[];
}

/**
 * NO-BREAKAGE evaluation for the preset axis. Geometry equality is
 * deliberately NOT part of this: presets are expected to move pixels.
 * Breakage means: the story failed to render, structural values fell off
 * the knob scales beyond the default cell's standing debt, or text ink
 * lost contrast the default cell still had.
 */
export const evaluateNoBreakage = (input: NoBreakageInput): NoBreakageResult => {
  const failures: string[] = [];
  if (!input.storyRendered) {
    failures.push('story did not render (empty story root)');
  }
  const structuralAdded =
    input.offScaleSignatures && input.baselineOffScaleSignatures
      ? newEntries(input.baselineOffScaleSignatures, input.offScaleSignatures)
      : [];
  if (structuralAdded.length || input.offScaleViolations > input.baselineOffScaleViolations) {
    failures.push(
      `constraint audit: ${input.offScaleViolations} off-scale violations ` +
        `(default cell has ${input.baselineOffScaleViolations})${namedList(structuralAdded)}`,
    );
  }
  const contrastAdded = input.baselineContrast
    ? newEntries(
        input.baselineContrast.violations.map(textViolationSignature),
        input.contrast.violations.map(textViolationSignature),
      )
    : [];
  if (contrastAdded.length || input.contrast.violations.length > input.baselineContrastViolations) {
    failures.push(
      `text contrast: ${input.contrast.violations.length} below-floor text nodes ` +
        `(default cell has ${input.baselineContrastViolations})${namedList(contrastAdded)}`,
    );
  }
  // Compare actual identities, including a replacement miss at equal counts.
  // Every cell also receives the absolute icons.ok gate in the matrix runner.
  if ((input.icons === undefined) !== (input.baselineIcons === undefined)) {
    failures.push('icon contrast: icons and baselineIcons must be supplied together');
  } else if (input.icons && input.baselineIcons) {
    const newIconFindings = newEntries(
      iconContrastSignatures(input.baselineIcons),
      iconContrastSignatures(input.icons),
    );
    if (newIconFindings.length > 0) {
      failures.push(`icon contrast: ${newIconFindings.length} new findings${namedList(newIconFindings)}`);
    }
  }
  if ((input.charts === undefined) !== (input.baselineCharts === undefined)) {
    failures.push('chart proof: charts and baselineCharts must be supplied together');
  } else if (input.charts && input.baselineCharts) {
    const added = newEntries(chartProofSignatures(input.baselineCharts), chartProofSignatures(input.charts));
    if (added.length) {
      failures.push(`chart proof: ${added.length} new findings${namedList(added)}`);
    }
  }
  return { ok: failures.length === 0, failures };
};
