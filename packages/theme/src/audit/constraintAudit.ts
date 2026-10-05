/**
 * Constraint Audit System
 *
 * Audits the rendered DOM to verify all structural CSS values land on valid
 * Tamagui token steps defined by the knob system. Off-scale values indicate
 * styles that bypassed the constraint system.
 *
 * Token values are from @tamagui/themes v5 + resolveKnobs.ts mappings.
 * Run this in-browser via Playwright's page.evaluate(runConstraintAudit).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PropertyAudit {
  value: number;
  unit: string;
  knob: string;
  offScale: boolean;
}

export interface TextPropertyAudit {
  value: string;
  knob: string;
  offScale: boolean;
}

export interface ElementAudit {
  /** Human-readable element descriptor */
  label: string;
  /** Stable DOM position within the audited surface, distinct for sibling controls. */
  key?: string;
  /** Tag name */
  tag: string;
  /** id attribute if present */
  id: string;
  /** Non-hash class names (for readability) */
  classes: string[];
  /** Audited properties (only populated when value is non-default/non-zero) */
  borderRadius?: PropertyAudit;
  borderTopLeftRadius?: PropertyAudit;
  borderTopRightRadius?: PropertyAudit;
  borderBottomRightRadius?: PropertyAudit;
  borderBottomLeftRadius?: PropertyAudit;
  borderWidth?: PropertyAudit;
  gap?: PropertyAudit;
  rowGap?: PropertyAudit;
  columnGap?: PropertyAudit;
  paddingTop?: PropertyAudit;
  paddingRight?: PropertyAudit;
  paddingBottom?: PropertyAudit;
  paddingLeft?: PropertyAudit;
  fontWeight?: PropertyAudit;
  fontFamily?: TextPropertyAudit;
  /** Inline color bypasses (hardcoded color/backgroundColor not from theme) */
  inlineColor?: TextPropertyAudit;
  /** Violations found on this element */
  violations: string[];
}

export interface AuditSummary {
  totalElements: number;
  auditedElements: number;
  totalViolations: number;
  byProperty: {
    borderRadius: number;
    borderWidth: number;
    gap: number;
    padding: number;
    fontWeight: number;
    fontFamily: number;
    inlineColor: number;
  };
}

export interface AuditReport {
  url: string;
  timestamp: string;
  preset: string;
  scheme: string;
  summary: AuditSummary;
  violations: ElementAudit[];
  /** All audited elements (including compliant ones) */
  elements: ElementAudit[];
}

// ── Token scale definitions ───────────────────────────────────────────────────
// These match @tamagui/themes v5 tokens + resolveKnobs.ts mapping tables.

/** Radius token values: token key → px (from @tamagui/themes v5 radius tokens) */
const RADIUS_TOKENS: Record<number, number> = {
  0: 0,
  1: 3,
  2: 5,
  3: 7,
  4: 9,
  5: 10,
  6: 16,
  7: 19,
  8: 22,
  9: 26,
  10: 34,
  11: 42,
  12: 50,
};

/** Space token values: token key → px (from @tamagui/themes v5 space tokens) */
const SPACE_TOKENS: Record<number, number> = {
  0: 0,
  0.25: 0.5,
  0.5: 1,
  0.75: 1.5,
  1: 2,
  1.5: 4,
  2: 7,
  2.5: 10,
  3: 13,
  3.5: 16,
  4: 18,
  4.5: 21,
  5: 24,
  6: 32,
  7: 39,
  8: 46,
};

/**
 * Inner border radius knob → pixel value
 * Source: borderRadiusMap in resolveKnobs.ts
 */
const BORDER_RADIUS_KNOB: Record<string, number> = {
  none: RADIUS_TOKENS[0], // 0px
  small: RADIUS_TOKENS[2], // 5px
  medium: RADIUS_TOKENS[4], // 9px
  large: RADIUS_TOKENS[6], // 16px
  full: RADIUS_TOKENS[12], // 50px
};

/**
 * Outer border radius knob → pixel value
 * Source: outerRadiusMap in resolveKnobs.ts
 */
const OUTER_RADIUS_KNOB: Record<string, number> = {
  none: RADIUS_TOKENS[0], // 0px
  small: RADIUS_TOKENS[2], // 5px
  medium: RADIUS_TOKENS[3], // 7px
  large: RADIUS_TOKENS[4], // 9px
  full: RADIUS_TOKENS[5], // 10px
};

/**
 * Border width knob → raw pixel value (not token-based)
 * Source: borderWidthMap in resolveKnobs.ts
 */
const BORDER_WIDTH_KNOB: Record<string, number> = {
  none: 0,
  small: 0.5,
  medium: 1,
  large: 2,
};

/**
 * Gap (inner spacing) knob → pixel value
 * Source: gapMap in resolveKnobs.ts ($2, $4, $5 space tokens)
 */
export const GAP_KNOB: Record<string, number> = {
  small: SPACE_TOKENS[2], // 7px
  medium: SPACE_TOKENS[4], // 18px
  large: SPACE_TOKENS[5], // 24px
};

/**
 * Gap large (gapLg) knob → pixel value
 * Source: gapLgMap in resolveKnobs.ts ($3, $5, $6 space tokens)
 */
export const GAP_LG_KNOB: Record<string, number> = {
  small: SPACE_TOKENS[3], // 13px
  medium: SPACE_TOKENS[5], // 24px
  large: SPACE_TOKENS[6], // 32px
};

/**
 * Panel padding knob → pixel value
 * Source: panelPaddingMap in resolveKnobs.ts ($3, $4, $6 space tokens)
 */
const PANEL_PADDING_KNOB: Record<string, number> = {
  small: SPACE_TOKENS[3], // 13px
  medium: SPACE_TOKENS[4], // 18px
  large: SPACE_TOKENS[6], // 32px
};

/**
 * Font weight knob → value string
 * Source: fontWeightMap in resolveKnobs.ts
 */
const FONT_WEIGHT_KNOB: Record<string, number> = {
  regular: 400,
  bold: 700,
};

// ── Valid value sets ──────────────────────────────────────────────────────────

/** All valid border-radius px values (inner + outer scales combined) */
const VALID_BORDER_RADIUS_PX = new Set([...Object.values(BORDER_RADIUS_KNOB), ...Object.values(OUTER_RADIUS_KNOB)]);

/** All valid border-width values */
const VALID_BORDER_WIDTH = new Set(Object.values(BORDER_WIDTH_KNOB));

/** All valid gap px values (gap + gapLg scales combined, plus 0) */
const VALID_GAP_PX = new Set([0, ...Object.values(GAP_KNOB), ...Object.values(GAP_LG_KNOB)]);

/** All valid padding px values (panel padding + 0) */
const VALID_PADDING_PX = new Set([0, ...Object.values(PANEL_PADDING_KNOB)]);

/** All valid font-weight values */
const VALID_FONT_WEIGHT = new Set(Object.values(FONT_WEIGHT_KNOB));

/**
 * Valid primary font families (first font in the computed stack).
 * Source: packages/config/fonts.ts fontFamilies + Tamagui Inter stack.
 * Keys are lowercase for case-insensitive matching.
 */
const FONT_FAMILY_KNOB: Record<string, string> = {
  inter: 'sans-serif ($body/$heading)',
  georgia: 'serif',
  monospace: 'mono',
  'roboto slab': 'slab',
  rockwell: 'slab (fallback)',
  nunito: 'rounded',
  'varela round': 'rounded (fallback)',
  'roboto condensed': 'condensed',
  'arial narrow': 'condensed (fallback)',
  'dancing script': 'cursive',
  pacifico: 'cursive (fallback)',
  caveat: 'handwriting',
  'patrick hand': 'handwriting (fallback)',
  silkscreen: 'pixel',
  'press start 2p': 'pixel (fallback)',
  unifrakturcook: 'blackletter',
  fraktur: 'blackletter (fallback)',
  futura: 'geometric',
  poppins: 'geometric (fallback)',
  'century gothic': 'geometric (fallback)',
};

/** System/generic fonts that are valid as part of fallback stacks */
const SYSTEM_FONTS = new Set([
  '-apple-system',
  'system-ui',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'helvetica',
  'arial',
  'sans-serif',
  'serif',
  'cursive',
  'comic sans ms',
  'courier new',
  'times new roman',
  'times',
]);

// ── Reverse-map helpers ───────────────────────────────────────────────────────

function reverseMapRadius(px: number): string {
  for (const [knob, val] of Object.entries(BORDER_RADIUS_KNOB)) {
    if (val === px) {
      return knob;
    }
  }
  for (const [knob, val] of Object.entries(OUTER_RADIUS_KNOB)) {
    if (val === px) {
      return `${knob} (outer)`;
    }
  }
  return 'off-scale';
}

function reverseMapBorderWidth(px: number): string {
  for (const [knob, val] of Object.entries(BORDER_WIDTH_KNOB)) {
    if (val === px) {
      return knob;
    }
  }
  return 'off-scale';
}

function reverseMapGap(px: number): string {
  for (const [knob, val] of Object.entries(GAP_KNOB)) {
    if (val === px) {
      return knob;
    }
  }
  for (const [knob, val] of Object.entries(GAP_LG_KNOB)) {
    if (val === px) {
      return `${knob} (lg)`;
    }
  }
  if (px === 0) {
    return 'none';
  }
  return 'off-scale';
}

function reverseMapPadding(px: number): string {
  for (const [knob, val] of Object.entries(PANEL_PADDING_KNOB)) {
    if (val === px) {
      return knob;
    }
  }
  if (px === 0) {
    return 'none';
  }
  return 'off-scale';
}

function reverseMapFontWeight(weight: number): string {
  for (const [knob, val] of Object.entries(FONT_WEIGHT_KNOB)) {
    if (val === weight) {
      return knob;
    }
  }
  return 'off-scale';
}

function reverseMapFontFamily(computed: string): { knob: string; offScale: boolean } {
  const first = computed
    .split(',')[0]
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
  if (!first) {
    return { knob: 'empty', offScale: true };
  }
  const knob = FONT_FAMILY_KNOB[first];
  if (knob) {
    return { knob, offScale: false };
  }
  if (SYSTEM_FONTS.has(first)) {
    return { knob: `system (${first})`, offScale: false };
  }
  return { knob: 'off-scale', offScale: true };
}

// ── Core audit function ───────────────────────────────────────────────────────

/**
 * Runs the constraint audit in the browser.
 *
 * This function is completely self-contained — no imports or external refs.
 * Pass it directly to Playwright's page.evaluate():
 *
 *   const report = await page.evaluate(runConstraintAudit);
 *
 * Returns an AuditReport object describing all structural CSS violations.
 */
export function runConstraintAudit(rootSelector?: string): AuditReport {
  // ── Inline token definitions (must be self-contained for page.evaluate) ──

  const _RADIUS_TOKENS: Record<number, number> = {
    0: 0,
    2: 5,
    3: 7,
    4: 9,
    5: 10,
    6: 16,
    12: 50,
  };
  const _SPACE_TOKENS: Record<number, number> = {
    0: 0,
    2: 7,
    3: 13,
    4: 18,
    5: 24,
    6: 32,
  };
  const _BORDER_RADIUS_KNOB: Record<string, number> = {
    none: 0,
    small: 5,
    medium: 9,
    large: 16,
    full: 50,
  };
  const _OUTER_RADIUS_KNOB: Record<string, number> = {
    none: 0,
    small: 5,
    medium: 7,
    large: 9,
    full: 10,
  };
  const _BORDER_WIDTH_KNOB: Record<string, number> = {
    none: 0,
    small: 0.5,
    medium: 1,
    large: 2,
  };
  const _GAP_KNOB: Record<string, number> = {
    small: 7,
    medium: 18,
    large: 24,
  };
  const _GAP_LG_KNOB: Record<string, number> = {
    small: 13,
    medium: 24,
    large: 32,
  };
  const _PANEL_PADDING_KNOB: Record<string, number> = {
    small: 13,
    medium: 18,
    large: 32,
  };
  const _FONT_WEIGHT_KNOB: Record<string, number> = {
    light: 300, // Inter body default weight
    regular: 400,
    bold: 700,
  };

  const _VALID_RADIUS = new Set([
    ...Object.values(_BORDER_RADIUS_KNOB),
    ...Object.values(_OUTER_RADIUS_KNOB),
    1000, // Tamagui pill radius (Switch, RadioGroup.Item)
    100000, // Tamagui circular button radius (Button circular variant)
  ]);
  const _VALID_BORDER_WIDTH = new Set(Object.values(_BORDER_WIDTH_KNOB));
  const _VALID_GAP = new Set([
    0,
    2, // $space.1 Tamagui space token
    3.9, // Tamagui InputContainerFrame size-proportional gap
    4, // $size.$0.5 sub-token used by Tamagui button internals
    5, // $size.$1
    9, // $size.$2
    ...Object.values(_GAP_KNOB),
    ...Object.values(_GAP_LG_KNOB),
  ]);
  const _VALID_PADDING = new Set([
    0,
    2, // $space.1 Tamagui space token
    7, // $size.$1.5 sub-token (button padding at $size.$2)
    ...Object.values(_PANEL_PADDING_KNOB),
  ]);
  const _VALID_FONT_WEIGHT = new Set(Object.values(_FONT_WEIGHT_KNOB));

  const _FONT_FAMILY_KNOB: Record<string, string> = {
    inter: 'sans-serif ($body/$heading)',
    georgia: 'serif',
    monospace: 'mono',
    'roboto slab': 'slab',
    rockwell: 'slab (fallback)',
    nunito: 'rounded',
    'varela round': 'rounded (fallback)',
    'roboto condensed': 'condensed',
    'arial narrow': 'condensed (fallback)',
    'dancing script': 'cursive',
    pacifico: 'cursive (fallback)',
    caveat: 'handwriting',
    'patrick hand': 'handwriting (fallback)',
    silkscreen: 'pixel',
    'press start 2p': 'pixel (fallback)',
    unifrakturcook: 'blackletter',
    fraktur: 'blackletter (fallback)',
    futura: 'geometric',
    poppins: 'geometric (fallback)',
    'century gothic': 'geometric (fallback)',
  };

  const _SYSTEM_FONTS = new Set([
    '-apple-system',
    'system-ui',
    'blinkmacsystemfont',
    'segoe ui',
    'roboto',
    'helvetica',
    'arial',
    'sans-serif',
    'serif',
    'cursive',
    'comic sans ms',
    'courier new',
    'times new roman',
    'times',
  ]);

  // ── Reverse-map helpers (inline) ──────────────────────────────────────────

  function _reverseRadius(px: number): string {
    if (px === 1000) {
      return 'pill';
    }
    if (px === 100000) {
      return 'circular';
    }
    for (const [k, v] of Object.entries(_BORDER_RADIUS_KNOB)) {
      if (v === px) {
        return k;
      }
    }
    for (const [k, v] of Object.entries(_OUTER_RADIUS_KNOB)) {
      if (v === px) {
        return `${k} (outer)`;
      }
    }
    return 'off-scale';
  }

  function _reverseBorderWidth(px: number): string {
    for (const [k, v] of Object.entries(_BORDER_WIDTH_KNOB)) {
      if (v === px) {
        return k;
      }
    }
    return 'off-scale';
  }

  function _reverseGap(px: number): string {
    if (px === 0) {
      return 'none';
    }
    for (const [k, v] of Object.entries(_GAP_KNOB)) {
      if (v === px) {
        return k;
      }
    }
    for (const [k, v] of Object.entries(_GAP_LG_KNOB)) {
      if (v === px) {
        return `${k} (lg)`;
      }
    }
    // Tamagui space/size sub-tokens used internally by components
    if (px === 2) {
      return 'space-token(2px)';
    }
    if (px === 3.9) {
      return 'input-internal(3.9px)';
    }
    if (px === 4 || px === 5 || px === 9) {
      return `size-token(${px}px)`;
    }
    return 'off-scale';
  }

  function _reversePadding(px: number): string {
    if (px === 0) {
      return 'none';
    }
    for (const [k, v] of Object.entries(_PANEL_PADDING_KNOB)) {
      if (v === px) {
        return k;
      }
    }
    // Tamagui space/size sub-tokens
    if (px === 2) {
      return 'space-token(2px)';
    }
    if (px === 7) {
      return 'size-token(7px)';
    }
    return 'off-scale';
  }

  function _reverseFontWeight(w: number): string {
    for (const [k, v] of Object.entries(_FONT_WEIGHT_KNOB)) {
      if (v === w) {
        return k;
      }
    }
    return 'off-scale';
  }

  function _reverseFontFamily(computed: string): { knob: string; offScale: boolean } {
    const first = computed
      .split(',')[0]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase();
    if (!first) {
      return { knob: 'empty', offScale: true };
    }
    const knob = _FONT_FAMILY_KNOB[first];
    if (knob) {
      return { knob, offScale: false };
    }
    if (_SYSTEM_FONTS.has(first)) {
      return { knob: `system (${first})`, offScale: false };
    }
    return { knob: 'off-scale', offScale: true };
  }

  /**
   * Check inline style for hardcoded color values that bypass theme tokens.
   * Returns the offending property and value, or null if clean.
   */
  function _checkInlineColors(el: Element): { property: string; value: string } | null {
    const htmlEl = el as HTMLElement;
    if (!htmlEl.style) {
      return null;
    }
    const colorProps = ['color', 'backgroundColor', 'borderColor'] as const;
    for (const prop of colorProps) {
      const val = htmlEl.style[prop];
      if (!val || val === 'inherit' || val === 'transparent' || val === 'currentColor') {
        continue;
      }
      if (val.startsWith('var(')) {
        continue;
      }
      return { property: prop, value: val };
    }
    return null;
  }

  // ── Helper: parse a single px value from computed style ──────────────────

  function parsePx(raw: string): number | null {
    if (!raw || raw === '' || raw === 'normal' || raw === 'auto') {
      return null;
    }
    // Handle "9px 9px 9px 9px" form — take first value
    const first = raw.split(' ')[0];
    const n = parseFloat(first);
    if (isNaN(n)) {
      return null;
    }
    return Math.round(n * 100) / 100; // round to 2 decimal places
  }

  // ── Helper: check if border-radius is percentage-based ────────────────────

  function isPercentageBorderRadius(el: Element): boolean {
    // getComputedStyle resolves percentages to px, so check inline style
    // or CSS text for percentages. This is a best-effort check.
    const inline = (el as HTMLElement).style?.borderRadius ?? '';
    if (inline.includes('%')) {
      return true;
    }
    return false;
  }

  // ── Helper: build a human-readable element label ──────────────────────────

  function elementLabel(el: Element): string {
    const tag = el.tagName.toLowerCase();
    // Labels are part of the no-breakage signature, so nothing a knob or a
    // render order writes may reach them: React useId ids renumber per mount,
    // and Tamagui atomic classes (always `_`-prefixed) spell resolved values.
    const generatedId = /^(?:_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»)$/.test(el.id);
    const id = el.id && !generatedId ? `#${el.id}` : '';
    const classes = Array.from(el.classList)
      .filter((c) => c.length > 3 && !c.startsWith('_') && !/^[_a-z0-9]{1,8}-/.test(c) && !/^\d/.test(c))
      .slice(0, 3)
      .join('.');
    const cls = classes ? `.${classes}` : '';
    const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
    const testId = el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : '';
    return `${tag}${id}${cls}${role}${testId}` || tag;
  }

  function elementKey(el: Element, scope: Element | Document): string {
    const path: string[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter((sibling) => sibling.tagName === node.tagName)
        : [node];
      path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      if (node === scope) {
        break;
      }
    }
    return path.join(' > ');
  }

  function isPainted(el: Element): boolean {
    const ownStyle = getComputedStyle(el);
    // Visibility can be restored by a child, unlike display or opacity.
    if (ownStyle.visibility === 'hidden' || ownStyle.visibility === 'collapse') {
      return false;
    }
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        style.display === 'none' ||
        (node !== el && style.contentVisibility === 'hidden') ||
        Number.parseFloat(style.opacity) === 0
      ) {
        return false;
      }
    }
    return true;
  }

  // ── Helper: audit a single numeric property ───────────────────────────────

  function auditProp(
    value: number | null,
    validSet: Set<number>,
    reverseFn: (v: number) => string,
    propName: string,
    violations: string[],
  ): PropertyAudit | undefined {
    if (value === null || value === 0) {
      return undefined;
    }
    const knob = reverseFn(value);
    const offScale = !validSet.has(value);
    if (offScale) {
      violations.push(`${propName}: ${value}px is off-scale (no matching token)`);
    }
    return { value, unit: 'px', knob, offScale };
  }

  // ── Read active preset and scheme from DOM ────────────────────────────────

  function readPreset(): string {
    const root = document.documentElement;
    // Try data attributes set by ThemeProvider
    return (
      root.dataset.preset ??
      document.cookie
        .split('; ')
        .find((c) => c.startsWith('mp.preset='))
        ?.split('=')[1] ??
      'unknown'
    );
  }

  function readScheme(): string {
    const root = document.documentElement;
    if (root.classList.contains('t_dark')) {
      return 'dark';
    }
    if (root.classList.contains('t_light')) {
      return 'light';
    }
    return root.style.colorScheme || 'unknown';
  }

  // ── Element selection ─────────────────────────────────────────────────────

  // Query all block/interactive elements. Skip purely semantic/structural ones.
  const SKIP_TAGS = new Set([
    'script',
    'style',
    'link',
    'meta',
    'head',
    'html',
    'title',
    'noscript',
    'br',
    'hr',
    'col',
    'colgroup',
    'caption',
    'source',
    'track',
    'wbr',
    'area',
    'map',
    'param',
    'embed',
    'object',
    'base',
    'canvas',
    'audio',
    'video',
    'picture',
    'figure',
  ]);

  // Third-party devtools root containers — skip their entire subtree
  const DEVTOOLS_SELECTORS = ['#tanstack_devtools', '[data-testid=tanstack_devtools]'];
  const devtoolsRoots = DEVTOOLS_SELECTORS.flatMap((s) => Array.from(document.querySelectorAll(s)));

  const scope = rootSelector ? document.querySelector(rootSelector) : document;
  if (!scope) {
    throw new Error(`Constraint audit scope not found: ${rootSelector}`);
  }
  const allElements = [...(scope instanceof Element ? [scope] : []), ...Array.from(scope.querySelectorAll('*'))];
  const candidates = allElements.filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) {
      return false;
    }
    // Skip SVG internals
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'svg') {
      return false;
    }
    // A hidden error panel can carry arbitrary framework styles without painting.
    if (!isPainted(el)) {
      return false;
    }
    // Skip third-party devtools overlays
    if (devtoolsRoots.some((root) => root.contains(el))) {
      return false;
    }
    return true;
  });

  // ── Run the audit ─────────────────────────────────────────────────────────

  const auditedElements: ElementAudit[] = [];
  const violationElements: ElementAudit[] = [];

  for (const el of candidates) {
    const style = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();

    const entry: ElementAudit = {
      label: elementLabel(el),
      key: elementKey(el, scope),
      tag,
      id: el.id || '',
      classes: Array.from(el.classList)
        .filter((c) => c.length > 3 && !/^[_a-z][a-z0-9]{0,6}-/.test(c))
        .slice(0, 5),
      violations: [],
    };

    let hasAnyProp = false;

    // Axiom 1: only a declared padded container owns the cap.
    // Provenance is declarative; every corner is still measured, and so is the
    // inset of the containers whose own padding IS the panelPadding knob.
    const containerName = el.getAttribute('data-constraint-container');
    const ownsInset = containerName === 'Card' || containerName === 'PageSection';
    const stackedRow = containerName === 'StackedRow';
    // A container padded with a fixed token rather than the panelPadding knob
    // caps at the padding it actually has.
    const ownInset = containerName === 'OwnInset';
    const capContainer =
      containerName === 'Card'
        ? ['content', 'elevated'].includes(el.getAttribute('data-tier') ?? '')
        : containerName === 'PageSection' || containerName === 'TextArea' || stackedRow || ownInset;
    if (containerName !== null && containerName !== 'Card' && !capContainer) {
      entry.violations.push(`data-constraint-container: "${containerName}" is not a container the cap audit knows`);
    }
    const binaryPart = el.getAttribute('data-radius-resolution') === 'BINARY';
    const corners = [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomRightRadius',
      'borderBottomLeftRadius',
    ] as const;
    // A row in a vertical stack caps its OUTER corners and squares
    // the inner ones, so the cap applies per corner by position.
    const stackPosition = el.getAttribute('data-stack-position') ?? '';
    const outerCorners: Record<string, readonly (typeof corners)[number][]> = {
      only: corners,
      first: ['borderTopLeftRadius', 'borderTopRightRadius'],
      middle: [],
      last: ['borderBottomRightRadius', 'borderBottomLeftRadius'],
    };
    const stackOuter = Object.hasOwn(outerCorners, stackPosition) ? outerCorners[stackPosition] : undefined;
    if (stackedRow && !stackOuter) {
      entry.violations.push(
        `data-stack-position: "${stackPosition}" is not a StackedRow position (only, first, middle, last)`,
      );
    }
    if (capContainer) {
      const radiusKnob = el.getAttribute('data-radius-knob') ?? '';
      const spaceKnob = el.getAttribute('data-space-knob') ?? '';
      const radiusStop = Object.hasOwn(_BORDER_RADIUS_KNOB, radiusKnob) ? _BORDER_RADIUS_KNOB[radiusKnob] : undefined;
      const paddingSides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
      const measuredInsets = paddingSides.map((prop) => parsePx(style[prop]));
      const inset = ownInset
        ? measuredInsets.some((v) => v === null)
          ? undefined
          : Math.min(...(measuredInsets as number[]))
        : Object.hasOwn(_PANEL_PADDING_KNOB, spaceKnob)
          ? _PANEL_PADDING_KNOB[spaceKnob]
          : undefined;
      if (ownsInset) {
        for (const [index, prop] of paddingSides.entries()) {
          const value = measuredInsets[index];
          const offScale = inset === undefined || value !== inset;
          entry[prop] = {
            value: value ?? 0,
            unit: 'px',
            knob: `${containerName} panelPadding:${spaceKnob}`,
            offScale,
          };
          if (offScale) {
            entry.violations.push(
              `${prop}: ${style[prop]} does not match ${containerName} panelPadding:${spaceKnob} (${inset ?? 'unknown'}px)`,
            );
          }
        }
      }
      const cap =
        radiusStop === undefined ||
        inset === undefined ||
        (stackedRow && !stackOuter) ||
        (ownsInset && measuredInsets.some((v) => v === null))
          ? undefined
          : Math.min(radiusStop, inset, ...(ownsInset ? (measuredInsets as number[]) : []));
      for (const prop of corners) {
        const raw = style[prop];
        const inner = stackedRow && stackOuter !== undefined && !stackOuter.includes(prop);
        const expected = inner ? 0 : cap;
        // A corner may have two elliptical axes. Percentages are not px caps.
        const axes = raw.trim().split(/\s+/);
        const offScale =
          expected === undefined ||
          axes.some((axis) => !/^\d+(?:\.\d+)?(?:px)?$/.test(axis) || parsePx(axis) !== expected);
        const result = {
          value: parsePx(raw) ?? 0,
          unit: 'px',
          knob: inner
            ? `${containerName} ${stackPosition} inner corner 0`
            : ownInset
              ? `${containerName} min(radius:${radiusKnob}, own padding)`
              : `${containerName} min(radius:${radiusKnob}, panelPadding:${spaceKnob})`,
          offScale,
        };
        entry[prop] = result;
        if (offScale) {
          entry.violations.push(
            inner
              ? `${prop}: ${raw} is an inner corner of a ${stackPosition} StackedRow (0px)`
              : `${prop}: ${raw} does not match ${containerName} cap (${expected ?? 'unknown'}px)`,
          );
        }
      }
      entry.borderRadius = {
        ...entry.borderTopLeftRadius!,
        offScale: corners.some((prop) => entry[prop]?.offScale),
      };
      hasAnyProp = true;
    } else if (binaryPart) {
      // Square, or a pill/circle of the part's own shorter edge,
      // at every stop and in every state. Layout size, not the transformed
      // box, so a translated thumb measures the same as a resting one.
      const box = el as HTMLElement;
      const half = Math.min(box.offsetWidth, box.offsetHeight) / 2;
      const measuredCorners = corners.map((prop) => style[prop].trim().split(/\s+/));
      if (measuredCorners.some((axes) => axes.some((axis) => parsePx(axis) !== 0))) {
        for (const [index, prop] of corners.entries()) {
          const raw = style[prop];
          const offScale = measuredCorners[index].some((axis) => {
            if (!/^\d+(?:\.\d+)?(?:px)?$/.test(axis)) {
              return true;
            }
            const value = parsePx(axis) ?? 0;
            // offsetWidth/offsetHeight round to whole px; the painted h/2 does not.
            return value !== 0 && Math.abs(value - half) > 0.5;
          });
          entry[prop] = { value: parsePx(raw) ?? 0, unit: 'px', knob: 'BINARY 0 | h/2', offScale };
          if (offScale) {
            entry.violations.push(`${prop}: ${raw} is neither 0 nor BINARY h/2 (${half}px)`);
          }
        }
        entry.borderRadius = {
          ...entry.borderTopLeftRadius!,
          offScale: corners.some((prop) => entry[prop]?.offScale),
        };
        hasAnyProp = true;
      }
    } else if (!isPercentageBorderRadius(el)) {
      // Ordinary controls and identity recipes retain their existing scales.
      const br = parsePx(style.borderTopLeftRadius || style.borderRadius);
      if (br !== null && br > 0) {
        entry.borderRadius = auditProp(br, _VALID_RADIUS, _reverseRadius, 'borderRadius', entry.violations);
        if (entry.borderRadius) {
          hasAnyProp = true;
        }
      }
    }

    // ── Border Width ────────────────────────────────────────────────────────
    const bwRaw = style.borderTopWidth; // check top; knobs set all sides equally
    const bw = parsePx(bwRaw);
    if (bw !== null && bw > 0) {
      entry.borderWidth = auditProp(bw, _VALID_BORDER_WIDTH, _reverseBorderWidth, 'borderWidth', entry.violations);
      if (entry.borderWidth) {
        hasAnyProp = true;
      }
    }

    // ── Gap ─────────────────────────────────────────────────────────────────
    const rowGap = parsePx(style.rowGap);
    const colGap = parsePx(style.columnGap);

    if (rowGap !== null && rowGap > 0) {
      entry.rowGap = auditProp(rowGap, _VALID_GAP, _reverseGap, 'rowGap', entry.violations);
      if (entry.rowGap) {
        hasAnyProp = true;
      }
    }
    if (colGap !== null && colGap > 0 && colGap !== rowGap) {
      entry.columnGap = auditProp(colGap, _VALID_GAP, _reverseGap, 'columnGap', entry.violations);
      if (entry.columnGap) {
        hasAnyProp = true;
      }
    }

    // ── Padding ─────────────────────────────────────────────────────────────
    // Only check padding on elements that look like surfaces (have border-radius
    // or border-width already audited). Padding on all elements creates too many
    // false positives from browser defaults and third-party components.
    if (!(capContainer && ownsInset) && (entry.borderRadius || entry.borderWidth)) {
      const sides = [
        ['paddingTop', style.paddingTop],
        ['paddingRight', style.paddingRight],
        ['paddingBottom', style.paddingBottom],
        ['paddingLeft', style.paddingLeft],
      ] as const;

      for (const [prop, raw] of sides) {
        const val = parsePx(raw);
        if (val !== null && val > 0) {
          const result = auditProp(val, _VALID_PADDING, _reversePadding, prop, entry.violations);
          if (result) {
            (entry as unknown as Record<string, unknown>)[prop] = result;
            hasAnyProp = true;
          }
        }
      }
    }

    // ── Font Weight ─────────────────────────────────────────────────────────
    const fw = parsePx(style.fontWeight);
    const weightKnob = el.getAttribute('data-font-weight-knob');
    if (fw !== null && (fw !== 400 || weightKnob !== null)) {
      // defaults/fonts.ts takes heading.weight from @tamagui/config/v5:
      // $0–$5 = 600, $6–$8 = 700, $9+ = 800. FontKnobStyles preserves
      // font_heading while changing its family. These are typography defaults,
      // not alternatives to an explicitly declared regular/bold recipe.
      const configuredHeading = el.classList.contains('font_heading') && [600, 700, 800].includes(fw);
      const expected =
        weightKnob !== null && ['regular', 'bold'].includes(weightKnob) ? _FONT_WEIGHT_KNOB[weightKnob] : undefined;
      const offScale =
        weightKnob !== null
          ? expected === undefined || fw !== expected
          : !_VALID_FONT_WEIGHT.has(fw) && !configuredHeading;
      const knob =
        weightKnob !== null
          ? `fontWeight:${weightKnob}`
          : configuredHeading
            ? 'configured heading (@tamagui/config/v5)'
            : _reverseFontWeight(fw);
      entry.fontWeight = { value: fw, unit: '', knob, offScale };
      if (offScale) {
        entry.violations.push(
          `fontWeight: ${fw} does not match ${weightKnob !== null ? knob : 'a configured typography weight'}`,
        );
      }
      hasAnyProp = true;
    }

    // ── Font Family ──────────────────────────────────────────────────────────
    // Only check elements with text content and where font-family differs from parent
    const TEXT_TAGS = new Set([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'span',
      'a',
      'button',
      'input',
      'textarea',
      'label',
      'select',
      'li',
      'td',
      'th',
      'dt',
      'dd',
      'figcaption',
      'blockquote',
      'pre',
      'code',
    ]);
    if (TEXT_TAGS.has(tag) || (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3)) {
      const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const elFontFamily = style.fontFamily;
      if (elFontFamily && (!parentStyle || elFontFamily !== parentStyle.fontFamily)) {
        const ffResult = _reverseFontFamily(elFontFamily);
        if (ffResult.offScale) {
          entry.fontFamily = { value: elFontFamily, knob: ffResult.knob, offScale: true };
          entry.violations.push(`fontFamily: "${elFontFamily.split(',')[0].trim()}" is not a registered font token`);
          hasAnyProp = true;
        } else {
          entry.fontFamily = { value: elFontFamily, knob: ffResult.knob, offScale: false };
          hasAnyProp = true;
        }
      }
    }

    // ── Inline Color Bypass ──────────────────────────────────────────────────
    const colorBypass = _checkInlineColors(el);
    if (colorBypass) {
      entry.inlineColor = {
        value: `${colorBypass.property}: ${colorBypass.value}`,
        knob: 'off-scale (hardcoded)',
        offScale: true,
      };
      entry.violations.push(`inlineColor: ${colorBypass.property}="${colorBypass.value}" bypasses theme tokens`);
      hasAnyProp = true;
    }

    if (hasAnyProp || entry.violations.length > 0) {
      auditedElements.push(entry);
      if (entry.violations.length > 0) {
        violationElements.push(entry);
      }
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────

  const summary: AuditSummary = {
    totalElements: candidates.length,
    auditedElements: auditedElements.length,
    totalViolations: violationElements.length,
    byProperty: {
      borderRadius: violationElements.filter((e) => e.borderRadius?.offScale).length,
      borderWidth: violationElements.filter((e) => e.borderWidth?.offScale).length,
      gap: violationElements.filter((e) => e.rowGap?.offScale || e.columnGap?.offScale).length,
      padding: violationElements.filter(
        (e) =>
          e.paddingTop?.offScale || e.paddingRight?.offScale || e.paddingBottom?.offScale || e.paddingLeft?.offScale,
      ).length,
      fontWeight: violationElements.filter((e) => e.fontWeight?.offScale).length,
      fontFamily: violationElements.filter((e) => e.fontFamily?.offScale).length,
      inlineColor: violationElements.filter((e) => e.inlineColor?.offScale).length,
    },
  };

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    preset: readPreset(),
    scheme: readScheme(),
    summary,
    violations: violationElements,
    elements: auditedElements,
  };
}
