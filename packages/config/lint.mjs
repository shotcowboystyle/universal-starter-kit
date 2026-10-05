#!/usr/bin/env node
/**
 * Structural convention checks that oxlint cannot express as file lints.
 *
 * 1. Fail on `.css` files under apps/* (vendor/bench trees ignored)
 * 2. Fail if apps/<name> lacks features/<name> (tooling shells exempt)
 * 3. Fail on SILENT NO-OP TOKENS — a string literal handed to a design-system
 *    prop that names nothing in the corresponding registry. Tamagui does not
 *    type-check these (the workspace only augments `TamaguiCustomConfig` with
 *    shorthands, so theme/token names stay open strings) and it does not throw
 *    or warn at the call site either: `getTokenForKey` returns `undefined` and
 *    the prop is dropped, so the styling simply never happens. Each check
 *    reads its vocabulary from the registry's own source so it cannot drift.
 * 4. Fail on SIZE-RECIPE ESCAPE — JSX numeric literals that set
 *    control chrome by hand (`height={N}`, `minHeight={N}`,
 *    `paddingHorizontal={N}`, `fontSize={N}`). Identifiers
 *    (`MIN_PRESS_TARGET`, `pressTargetHitSlop`, `recipe.height`,
 *    `knobProps.control.height`) are fine. Escape with `sizeRecipeEscape` or
 *    `size-recipe-escape:` on the previous line or same statement. Pilot:
 *    Button/, InputParts/, fields/Select/ only.
 * 5. Fail on a STORY FILE THE CSF INDEXER CANNOT READ — a
 *    `*.stories.*` file that exports a named `meta` beside `export default`
 *    (`meta` is reserved for CSF Factories, so the indexer reports "missing
 *    default export"), or one with no default export at all. One such file
 *    kills the whole gallery and no package build ever sees it.
 * 6. Fail on an UNDECLARED DRAWING FILE — a `// mpo-drawing` pragma
 *    whose path is not a DRAWING member in docs/theme-propagation-spec.md.
 *    The oxlint rule skips registered drawings; this check is what makes
 *    adding an undeclared drawing file still fail.
 * 7. Fail on a METRO SUBPATH WITHOUT A FALLBACK — a package.json
 *    subpath export in a source-consumed package whose Metro condition points
 *    into `dist/` with no `<pkg>/<subpath>.*` file on disk. Metro never
 *    reconsiders the map's `source` condition after the dist miss, so the
 *    first import of that subpath fails the whole bundle.
 * 8. Fail on a REACT-NATIVE NAMED IMPORT WITH NO REACT-NATIVE-WEB EXPORT
 *    — a `import { X } from "react-native"` in a file the web
 *    target resolves, where react-native-web exports no X. The alias makes
 *    that a module-evaluation SyntaxError, which takes the whole preview
 *    bundle down rather than one component.
 * 9. Fail on a `.react-flow__` SELECTOR outside the token bridge —
 *    React Flow paints through `var(--xy-thing, var(--xy-thing-default))`, so
 *    every colour, width and shadow is settable without touching its
 *    stylesheet. A hand-written `.react-flow__` rule anywhere else forks that
 *    paint: it wins or loses on specificity rather than on the knob, and the
 *    next library upgrade silently changes which. The whole point of the
 *    bridge is that a designer never touches React Flow CSS — including us —
 *    so the rule is mechanical. `theme/graphVars.ts` (the map) and the
 *    package's own `css/` tree (outside `src`) are the two places it may live.
 *    Comments and specs are exempt; strings are not, because a hand-written
 *    rule lives in a template literal.
 * 10. Fail on an `import.meta` TOKEN in packages/<pkg>/src — in a
 *    classic script it is a PARSE-time SyntaxError, and two bundles execute
 *    mpo as one (the vxrn/rolldown Hermes bundle, and any Metro bundle for
 *    platform=web, i.e. an Expo DOM component). Node-only build tooling is
 *    exempt by construction: a file that imports a `node:` builtin cannot run
 *    in a browser or on Hermes anyway.
 * 11. Fail on an UNDECLARED SIZE-RECIPE ESCAPE — a
 *    `sizeRecipeEscape` prop, key or call, or a `size-recipe-escape:` comment,
 *    whose file and reason are not a row in the spec's `## Size-recipe
 *    escapes` table, or a row whose site is gone.
 * 12. Fail on an UNLABELED FOREIGN CONTROL SPECIMEN — a `*.stories.tsx`
 *    that value-imports a raw control primitive
 *    (`Input`, `Button`, `Checkbox`, …) from `tamagui` without carrying
 *    `parameters.foreignContrastSpecimen: true`. A raw primitive consumes no
 *    knobs, so a knob sweep that trusts the story scores the primitive and
 *    marks the component checked. Layout and text primitives (XStack,
 *    Paragraph, …) are out of scope by rule.
 * 13. Fail on an UNDECLARED COLOUR-LITERAL ESCAPE — a
 *    `hex-escape:` comment, which exempts its file from
 *    `mpo-conventions/no-hex-literals`, whose file and reason are not a row
 *    in the spec's `## Colour-literal escapes` table, or a row whose comment
 *    is gone.
 *
 * Usage:
 *   import { runConventionChecks } from "@repo/config/lint";
 *   runConventionChecks({ roots: { root, apps, features, public } });
 *
 * CLI: node lint.mjs   (roots default to process.cwd())
 * Exit 1 on any violation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DRAWING_PRAGMA, isDrawingFile, readDrawingRegistry } from './drawingRegistry.mjs';
import { findHexEscapes } from './oxlint.mjs';
import { readHexEscapeRegistry, readSizeRecipeEscapeRegistry } from './specRegistry.mjs';

/**
 * @typedef {{ root?: string, apps?: string, features?: string, public?: string, packages?: string }} ConventionRoots
 * @typedef {{ roots?: ConventionRoots }} RunConventionChecksOptions
 */

/** @type {string} */
let ROOT = process.cwd();
/** @type {string} */
let APPS_DIR = join(ROOT, 'apps');
/** @type {string} */
let FEATURES_DIR = join(ROOT, 'features');
/** @type {string} */
let PUBLIC_DIR = join(ROOT, 'packages');
/** @type {string} */
let PACKAGES_DIR = join(ROOT, 'packages');

/**
 * @param {ConventionRoots} [roots]
 */
export function resolveRoots(roots = {}) {
  const root = roots.root ?? process.cwd();
  return {
    root,
    apps: roots.apps ?? join(root, 'apps'),
    features: roots.features ?? join(root, 'features'),
    public: roots.public ?? join(root, 'packages'),
    packages: roots.packages ?? join(root, 'packages'),
  };
}

/**
 * @param {ConventionRoots} [roots]
 */
function applyRoots(roots) {
  const resolved = resolveRoots(roots);
  ROOT = resolved.root;
  APPS_DIR = resolved.apps;
  FEATURES_DIR = resolved.features;
  PUBLIC_DIR = resolved.public;
  PACKAGES_DIR = resolved.packages;
  sourceFileCache = undefined;
  requireFromRoot = createRequire(join(ROOT, 'package.json'));
}

/** Shared platform / docs / chain shells — not product apps from
 *  mpo init --app. Extension targets (vscode, webext) are no longer shells:
 *  they live INSIDE the product app (apps/<name>/vscode, apps/<name>/webext)
 *  alongside the gnome/tauri targets. */
const FEATURES_TWIN_EXEMPT = new Set([
  'frappe',
  'keycloak',
  'storybook',
  'storybook-expo',
  'uxpin',
  'vocs',
  'ethereum',
  'solana',
  'sui',
]);

const CSS_IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.dist',
  '.tamagui',
  'build',
  'coverage',
  'env', // frappe bench python env
  'sites',
  'logs',
  'storybook-static', // storybook build output
  'playwright-report', // playwright html report (regenerated per e2e run)
  'test-results', // playwright traces/attachments
]);

/** Build-output dirs are prefix-matched so variants like dist-spa-e2e are covered. */
const CSS_IGNORE_DIR_PREFIXES = ['dist-', 'dist_'];

/** Path prefixes under apps/ that are never scanned for .css */
const CSS_IGNORE_PREFIXES = [
  join('frappe', 'apps'), // upstream frappe apps tree
  join('frappe', 'env'),
  join('frappe', 'sites'),
  // Keycloakify vendored theme resources (not app-authored styles)
  join('keycloak', 'public', 'keycloakify-dev-resources'),
];

/**
 * Paths inside ANY product app that are never scanned for .css: `mpo init`
 * renames the template app to each product app, so these cannot be pinned to
 * its name. Platform-forced: vscode webviews rewrite <link href> to
 * vscode-resource URIs and url() resolves relative to the emitted stylesheet —
 * inline <style> would resolve against vscode-webview:// instead.
 */
const CSS_IGNORE_APP_FILES = new Set(['vscode/webview/fonts.css']);

/** Generated Tamagui CSS extract filenames (not hand-authored app styles). */
const GENERATED_CSS_NAMES = new Set(['tamagui.css', 'tamagui.content.css']);

/**
 * @param {string} dir
 * @param {(filePath: string) => void} onFile
 */
function walkFiles(dir, onFile) {
  if (!existsSync(dir)) {return;}
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') {
      // skip VCS / cache dirs; allow .storybook
      if (entry.isDirectory()) {continue;}
    }
    if (CSS_IGNORE_DIR_NAMES.has(entry.name)) {continue;}
    if (entry.isDirectory() && CSS_IGNORE_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function isCssIgnored(absPath) {
  const rel = relative(APPS_DIR, absPath);
  if (CSS_IGNORE_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix + '/'))) {
    return true;
  }
  const parts = rel.split(/[/\\]/);
  if (CSS_IGNORE_APP_FILES.has(parts.slice(1).join('/'))) {return true;}
  return GENERATED_CSS_NAMES.has(parts.at(-1) ?? '');
}

function listAppNames() {
  if (!existsSync(APPS_DIR)) {return [];}
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => d.name)
    .sort();
}

function checkCssInApps() {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(APPS_DIR)) {return violations;}

  walkFiles(APPS_DIR, (filePath) => {
    if (!filePath.endsWith('.css')) {return;}
    if (isCssIgnored(filePath)) {return;}
    violations.push(relative(ROOT, filePath));
  });
  return violations;
}

// ── Silent no-op token registries ─────────────────────────────────────────

/** Bound to the consumer root so SHC/Lookout resolve their own Tamagui copies. */
let requireFromRoot = createRequire(join(process.cwd(), 'package.json'));

/**
 * Resolve a registry package. A package that cannot be resolved disables its
 * check (reported by `runConventionChecks`) instead of crashing the run — a
 * fresh clone with a partial install must still get the structural checks.
 * @param {string} name
 */
function tryRequire(name) {
  try {
    return requireFromRoot(name);
  } catch {
    return undefined;
  }
}

/**
 * A registry source under packages/<pkg>/, or, when the tree has no
 * packages/<pkg> (every project `mpo init` scaffolds), the same path inside the
 * installed @repo/<pkg>, which publishes its src/.
 * @param {string} relPath
 */
function readPublicSource(relPath) {
  const [pkg, ...rest] = relPath.split('/');
  let full = join(PUBLIC_DIR, relPath);
  if (!existsSync(join(PUBLIC_DIR, pkg))) {
    try {
      full = join(dirname(requireFromRoot.resolve(`@repo/${pkg}/package.json`)), ...rest);
    } catch {
      return '';
    }
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

/**
 * Body of an object/interface literal that starts at `marker`, from its first
 * `{` to the first line-anchored closing brace. Used to read a registry's keys
 * out of the source that declares them.
 * @param {string} src
 * @param {string} marker
 * @param {string} end
 */
function sliceBlock(src, marker, end) {
  const start = src.indexOf(marker);
  if (start === -1) {return '';}
  const open = src.indexOf('{', start);
  if (open === -1) {return '';}
  const close = src.indexOf(end, open);
  return close === -1 ? '' : src.slice(open, close);
}

/**
 * Top-level keys declared in an object/interface literal body. Numeric keys
 * count — scale registries like the font-size table are keyed `1:`…`16:`.
 * @param {string} body
 * @param {number} indent
 */
function keysOfBlock(body, indent) {
  /** @type {string[]} */
  const keys = [];
  const re = new RegExp(`^ {${indent}}([A-Za-z0-9][A-Za-z0-9]*)\\s*:`, 'gm');
  for (const m of body.matchAll(re)) {keys.push(m[1]);}
  return keys;
}

/** Source files every token check scans, read once and shared. */
let sourceFileCache;
function sourceFiles() {
  if (sourceFileCache) {return sourceFileCache;}
  /** @type {{ abs: string, rel: string, src: string }[]} */
  const files = [];
  const collect = (filePath) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath)) {return;}
    if (/\.(spec|test)\./.test(filePath)) {return;}
    files.push({
      abs: filePath,
      rel: relative(ROOT, filePath),
      src: readFileSync(filePath, 'utf8'),
    });
  };
  for (const dir of [PUBLIC_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, collect);}
  sourceFileCache = files;
  return files;
}

/**
 * 1-based line of a match offset.
 * @param {string} src
 * @param {number} index
 */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {if (src.charCodeAt(i) === 10) line += 1;}
  return line;
}

/**
 * Run one prop-literal regex over every scanned file.
 * @param {RegExp} re
 * @param {(match: RegExpMatchArray) => string | undefined} check returns the violation text, or undefined when valid
 */
function scanLiterals(re, check) {
  /** @type {string[]} */
  const violations = [];
  for (const { rel, src } of sourceFiles()) {
    for (const m of src.matchAll(re)) {
      const message = check(m);
      if (message) {violations.push(`${rel}:${lineAt(src, m.index ?? 0)} — ${message}`);}
    }
  }
  return violations;
}

/**
 * The animation vocabulary is a CLOSED set (css.ts / reactNative.ts register
 * exactly these keys). A `transition="X"` with an X outside the set is not a
 * type error — Tamagui silently ignores the unknown animation name, so the
 * element renders with NO animation. That is invisible until someone notices
 * "this doesn't animate" (e.g. DatePicker's `transition="quicker"` typo, which
 * killed the selected-date enter animation across all five pickers). Read the
 * registry from source so this check can never drift from the tokens.
 * @returns {Set<string>}
 */
function readAnimationTokens() {
  /** @type {Set<string>} */
  const tokens = new Set();
  const src = readPublicSource('theme/src/theme/animations/css.ts');
  if (!src) {return tokens;}
  tokens.add('none'); // valid non-animating value
  for (const key of keysOfBlock(sliceBlock(src, 'animationConfig =', '} as const'), 2)) {
    tokens.add(key);
  }
  return tokens;
}

/** Flag `transition="literal"` / `transition={"literal"}` using an unregistered token. */
function checkTransitionTokens() {
  const valid = readAnimationTokens();
  if (!valid.size) {return { violations: [], valid: [], ok: false };}
  // Only string LITERALS directly on the prop — dynamic values (variables,
  // ternaries, knobProps.transition) resolve at runtime and are out of scope.
  const re = /\btransition=(?:"([a-zA-Z0-9]+)"|\{\s*"([a-zA-Z0-9]+)"\s*\})/g;
  const violations = scanLiterals(re, (m) => {
    const token = m[1] ?? m[2];
    return valid.has(token) ? undefined : `transition="${token}"`;
  });
  return { violations, valid: [...valid].filter((t) => t !== 'none').sort(), ok: true };
}

/**
 * Every registered Tamagui theme name, plus each sub-theme SEGMENT a `theme`
 * prop may name on its own (`theme="accent"` selects `light_accent` under the
 * light scheme). Rebuilt from the same three sources `createThemesBuilder`
 * composes: the theme-builder's generated names for this base/children/accent
 * shape, the stock `@tamagui/themes` names, and the gray aliases declared in
 * createThemes.ts. Palettes are irrelevant here — only the NAMES are.
 * @returns {Set<string>}
 */
function readThemeNames() {
  /** @type {Set<string>} */
  const names = new Set();
  const builder = tryRequire('@tamagui/theme-builder');
  const stock = tryRequire('@tamagui/themes');
  const src = readPublicSource('theme/src/theme/createThemes.ts');
  if (!builder?.createThemes || !stock?.themes || !src) {return names;}
  const ramp = Array.from({ length: 14 }, (_, i) => `hsl(0, 0%, ${i * 7}%)`);
  const palette = { palette: { dark: ramp, light: ramp } };
  /** @type {Record<string, unknown>} */
  const childrenThemes = {};
  for (const key of keysOfBlock(sliceBlock(src, 'const childrenThemes =', '\n  };'), 4)) {
    childrenThemes[key] = palette;
  }
  try {
    for (const name of Object.keys(builder.createThemes({ base: palette, childrenThemes, accent: palette }))) {
      names.add(name);
    }
  } catch {
    return new Set();
  }
  for (const name of Object.keys(stock.themes)) {names.add(name);}
  for (const m of sliceBlock(src, 'const grayTheme =', '\n};').matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm)) {
    names.add(m[1]);
  }
  /** @type {string[]} */
  const segments = [];
  for (const name of names) {for (const part of name.split('_').slice(1)) segments.push(part);}
  for (const segment of segments) {names.add(segment);}
  return names;
}

/**
 * Every key resolvable as `$value` on a color-bearing prop, composed exactly
 * the way `createThemesBuilder` composes the live themes: the structural keys
 * the theme-builder generates (colorN / background0N / accentN / …), the stock
 * base themes, the Radix ramps createThemes.ts splats into `extra`, the shadow
 * slots, and the project's semantic aliases from `getBaseTheme`.
 * @returns {Set<string>}
 */
function readThemeKeys() {
  /** @type {Set<string>} */
  const keys = new Set();
  const builder = tryRequire('@tamagui/theme-builder');
  const stock = tryRequire('@tamagui/themes');
  const colors = tryRequire('@tamagui/colors');
  const src = readPublicSource('theme/src/theme/createThemes.ts');
  const builderSrc = readPublicSource('theme/src/theme/defaults/builderOptions.ts');
  if (!builder?.createThemes || !stock?.themes || !colors || !src || !builderSrc) {return keys;}
  const ramp = Array.from({ length: 14 }, (_, i) => `hsl(0, 0%, ${i * 7}%)`);
  const palette = { palette: { dark: ramp, light: ramp } };
  try {
    const generated = builder.createThemes({
      base: palette,
      childrenThemes: { warning: palette },
      accent: palette,
    });
    for (const theme of Object.values(generated)) {for (const k of Object.keys(theme)) keys.add(k);}
  } catch {
    return new Set();
  }
  for (const name of ['light', 'dark']) {
    for (const k of Object.keys(stock.themes[name] ?? {})) {keys.add(k);}
  }
  for (const m of src.matchAll(/\.\.\.Colors\.([A-Za-z0-9]+)\s*,/g)) {
    for (const k of Object.keys(colors[m[1]] ?? {})) {keys.add(k);}
  }
  for (const k of keysOfBlock(sliceBlock(src, 'export interface Shadows', '\n}'), 2)) {keys.add(k);}
  keys.add('shadowColor');
  for (const k of keysOfBlock(sliceBlock(builderSrc, 'function getBaseTheme', '\n}'), 4)) {keys.add(k);}
  return keys;
}

/**
 * Font-size steps the house fonts register. The hand-mirrored
 * `interBaseSizes` table is retired — `defaults/fonts.ts` now READS its
 * size tables from `@tamagui/config/v5`'s `defaultConfig.fonts`, so this
 * registry reads the same source (the era pin is load-bearing). The source
 * parse survives as a fallback for consumer trees that still carry the
 * transcribed table.
 */
function readFontSizeSteps() {
  /** @type {Set<string>} */
  const steps = new Set();
  const cfg = tryRequire('@tamagui/config/v5');
  for (const font of Object.values(cfg?.defaultConfig?.fonts ?? {})) {
    // Bare keys (`1`…`16`, `true`) — checkStyleTokens compares the captured
    // token name without its `$`, same shape keysOfBlock returned.
    for (const k of Object.keys(font?.size ?? {})) {steps.add(k);}
  }
  if (steps.size) {return steps;}
  const src = readPublicSource('theme/src/theme/defaults/fonts.ts');
  if (!src) {return steps;}
  for (const k of keysOfBlock(sliceBlock(src, 'const interBaseSizes', '\n};'), 2)) {steps.add(k);}
  return steps;
}

/**
 * Flag a `$token` style literal that resolves to NOTHING.
 *
 * `getTokenForKey` looks a `$value` up in the active theme, then in the token
 * scale its prop belongs to (`tokenCategories`), then in `tokens.space` as a
 * universal fallback — and when all three miss it returns `undefined`, so the
 * prop is dropped from the style entirely. The only signal is a one-time,
 * collapsed dev console group that names neither the file nor the component
 * and which Tamagui itself documents as "sometimes harmless", so in practice
 * an unregistered token is invisible (e.g. `color="$colorSubtle"` in
 * GeolocationMap.native, a token no theme ever defined).
 *
 * Font props are the one exception to the space fallback: `fontSize` resolves
 * against the active font's own size scale and, on a miss, passes the RAW
 * "$n" string through as a CSS length — equally silent, equally dead.
 */
function checkStyleTokens() {
  const helpers = tryRequire('@tamagui/helpers');
  const themesPkg = tryRequire('@tamagui/themes');
  const shorthandsPkg = tryRequire('@tamagui/shorthands');
  const themeKeys = readThemeKeys();
  const fontSizeSteps = readFontSizeSteps();
  if (!helpers?.tokenCategories || !themesPkg?.tokens || !themeKeys.size || !fontSizeSteps.size) {
    return { violations: [], ok: false };
  }
  const tokens = themesPkg.tokens;
  const spaceScale = new Set(Object.keys(tokens.space ?? {}));
  /** @type {Map<string, Set<string>>} prop → every `$value` that resolves */
  const byProp = new Map();
  // Props with a scale of their own (radius / size / zIndex / color).
  for (const [category, props] of Object.entries(helpers.tokenCategories)) {
    const resolvable = new Set([...themeKeys, ...Object.keys(tokens[category] ?? {}), ...spaceScale]);
    for (const prop of Object.keys(props)) {byProp.set(prop, resolvable);}
  }
  // Every other view style prop lands on the space fallback (padding, margin,
  // gap, inset, border widths, …) — the biggest surface by call-site count.
  const spaceResolvable = new Set([...themeKeys, ...spaceScale]);
  for (const prop of Object.keys(helpers.stylePropsAll ?? {})) {
    if (byProp.has(prop)) {continue;}
    if (helpers.stylePropsTextOnly?.[prop]) {continue;}
    if (helpers.stylePropsTransform?.[prop]) {continue;}
    if (helpers.stylePropsUnitless?.[prop]) {continue;}
    byProp.set(prop, spaceResolvable);
  }
  byProp.set('fontSize', new Set([...themeKeys, ...fontSizeSteps]));
  // Shorthands are the same prop by another name (`bg`, `br`, `fos`, …).
  for (const [short, long] of Object.entries(shorthandsPkg?.shorthands ?? {})) {
    const resolvable = byProp.get(long);
    if (resolvable) {byProp.set(short, resolvable);}
  }
  const props = [...byProp.keys()].sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`\\b(${props})=(?:"\\$([A-Za-z0-9]+)"|\\{\\s*"\\$([A-Za-z0-9]+)"\\s*\\})`, 'g');
  const violations = scanLiterals(re, (m) => {
    const token = m[2] ?? m[3];
    return byProp.get(m[1])?.has(token) ? undefined : `${m[1]}="$${token}"`;
  });
  return { violations, ok: true };
}

/** Flag `theme="literal"` naming a theme that was never built. */
function checkThemeNames() {
  const valid = readThemeNames();
  if (!valid.size) {return { violations: [], ok: false };}
  const re = /\btheme=(?:"([A-Za-z][A-Za-z0-9_]*)"|\{\s*"([A-Za-z][A-Za-z0-9_]*)"\s*\})/g;
  const violations = scanLiterals(re, (m) => {
    const name = m[1] ?? m[2];
    return valid.has(name) ? undefined : `theme="${name}"`;
  });
  return { violations, ok: true };
}

/** Intent names registered in `defaultIntents`. */
function readIntentNames() {
  /** @type {Set<string>} */
  const names = new Set();
  const src = readPublicSource('theme/src/theme/intents.ts');
  if (!src) {return names;}
  for (const m of sliceBlock(src, 'export const defaultIntents', '\n};').matchAll(
    /^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*\{/gm,
  )) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Flag `useResolvedKnobs({ intent: "literal" })` naming an unregistered intent.
 * `UseResolvedKnobsOptions.intent` is a plain `string` (component-level intent
 * props are typed unions, this one is the open seam), and an unknown name just
 * misses `defaultIntents[intent]` — no overrides merge, so the component keeps
 * its base knobs and renders exactly as if no intent had been passed.
 */
function checkIntentTokens() {
  const valid = readIntentNames();
  if (!valid.size) {return { violations: [], valid: [], ok: false };}
  const call = /useResolvedKnobs\(/g;
  const intentArg = /\bintent:\s*"([A-Za-z0-9]+)"/g;
  /** @type {string[]} */
  const violations = [];
  for (const { rel, src } of sourceFiles()) {
    for (const m of src.matchAll(call)) {
      // Options object only — stop at the call's own closing paren.
      let depth = 0;
      let end = (m.index ?? 0) + m[0].length - 1;
      for (; end < src.length; end++) {
        const c = src[end];
        if (c === '(') {depth += 1;}
        else if (c === ')') {
          depth -= 1;
          if (depth === 0) {break;}
        }
      }
      const args = src.slice((m.index ?? 0) + m[0].length, end);
      for (const arg of args.matchAll(intentArg)) {
        if (!valid.has(arg[1])) {
          violations.push(`${rel}:${lineAt(src, m.index ?? 0)} — intent: "${arg[1]}"`);
        }
      }
    }
  }
  return { violations, valid: [...valid].sort(), ok: true };
}

/**
 * Two more silent-animation-death shapes, both found dead in the live sweep
 * and neither catchable by the token
 * guard above, because the token is valid — it is the PROP that is wrong.
 *
 * 1. `animation` is the tamagui 1.x spelling. On 2.x the prop is `transition`
 *    and `animation` is NOT an alias, so it is dropped and the node sits at
 *    `transition-duration: 0s`. It hides in two spellings: the JSX attribute,
 *    and an `animation:` key inside a conditional spread.
 * 2. `enterStyle`/`exitStyle` with no transition driver on the same
 *    element is dead code — the styles are declared and never interpolated
 *    (raw tamagui Popover/Dialog Content bypassing the house wrappers).
 */
function checkAnimationProps() {
  /** @type {string[]} */
  const legacyProp = [];
  /** @type {string[]} */
  const driverless = [];
  const scan = (filePath) => {
    if (!/\.(tsx|jsx)$/.test(filePath)) {return;}
    if (/\.(spec|test|stories)\./.test(filePath)) {return;}
    const src = readFileSync(filePath, 'utf8');
    const rel = relative(ROOT, filePath);
    // Any `…transition`-valued animation key, so prefixed spellings like
    // `ctx.knobProps.transition` are caught too. Deliberately NOT "any value":
    // that also matches TS annotations (`animation: any`), css-in-js, and
    // unrelated config objects that have nothing to do with the tamagui prop.
    // The lookbehind keeps `data-animation={…}` (probe attributes: Spinner,
    // Pagination) out: `\b` alone matches between `-` and `animation`.
    for (const m of src.matchAll(/(?<![\w-])animation=\{|(?<![\w-])animation:\s*[\w$.[\]?]*\btransition\b/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      legacyProp.push(`${rel}:${line} — \`${m[0]}\` (tamagui 1.x prop; use \`transition\`)`);
    }
    // Element-scoped: an enter/exitStyle needs a transition on the SAME tag.
    // `=>` is allowed through: a `>` inside an arrow-function prop otherwise
    // truncates the tag and hides everything after it from this check.
    for (const tag of src.matchAll(/<[A-Z][\w.]*(?:\s(?:=>|[^>])*)?>/gs)) {
      const t = tag[0];
      if (!/\b(enterStyle|exitStyle)=/.test(t)) {continue;}
      if (/\btransition(?:[=:]|Props\()/.test(t)) {continue;}
      const line = src.slice(0, tag.index).split('\n').length;
      driverless.push(`${rel}:${line} — enter/exitStyle with no \`transition\` driver (LC-24)`);
    }
  };
  for (const dir of [PUBLIC_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  return { legacyProp, driverless };
}

function checkFeaturesTwins() {
  /** @type {string[]} */
  const violations = [];
  for (const name of listAppNames()) {
    if (FEATURES_TWIN_EXEMPT.has(name)) {continue;}
    const twin = join(FEATURES_DIR, name);
    if (!existsSync(twin) || !statSync(twin).isDirectory()) {
      violations.push(`apps/${name} lacks features/${name} (app ↔ features twin required)`);
    }
  }
  return violations;
}

/**
 * SIZE-RECIPE ESCAPE — numeric JSX literals that paint control chrome
 * by hand, bypassing the size recipe. Pilot is narrow on purpose: only
 * Button/, InputParts/, and fields/Select/ under packages/forms/src. Widen
 * the prefix list when the rest of the catalog migrates.
 *
 * Flagged: height={N} / minHeight={N} / paddingHorizontal={N} / fontSize={N}
 * where N is a number. Token strings (`"$4"`) and identifiers
 * (`MIN_PRESS_TARGET`, `recipe.height`, `knobProps.control.height`) do not
 * match. Escape: `sizeRecipeEscape` or `size-recipe-escape:` on the previous
 * line or in the same statement (the prop, including a multiline `{…}`).
 */
function checkSizeRecipeEscape() {
  const formsSrc = join(PUBLIC_DIR, 'forms', 'src');
  const pilotPrefixes = [
    'packages/forms/src/Button/',
    'packages/forms/src/InputParts/',
    'packages/forms/src/fields/Select/',
    // Migrated onto generated recipe families 2026-08-14 (catalog wave):
    'packages/forms/src/Chip/',
    'packages/forms/src/Skeleton/',
    'packages/forms/src/fields/PhoneInput/',
    'packages/forms/src/fields/SearchInput/',
    'packages/forms/src/fields/Slider/',
    'packages/forms/src/fields/Stepper/',
    'packages/forms/src/fields/Switch/',
  ];
  const re = /\b(height|minHeight|paddingHorizontal|fontSize)=\{\s*(-?\d+(?:\.\d+)?)\s*\}/g;
  /** @type {string[]} */
  const violations = [];
  walkFiles(formsSrc, (filePath) => {
    if (!/\.(tsx|ts)$/.test(filePath)) {return;}
    const rel = relative(ROOT, filePath);
    if (/\.(spec|test|stories)\./.test(rel)) {return;}
    if (rel.includes('__snapshots__')) {return;}
    if (!pilotPrefixes.some((prefix) => rel.startsWith(prefix))) {return;}
    const src = readFileSync(filePath, 'utf8');
    const lines = src.split('\n');
    for (const m of src.matchAll(re)) {
      const line = lineAt(src, m.index ?? 0);
      const current = lines[line - 1] ?? '';
      const trimmed = current.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      const previous = lines[line - 2] ?? '';
      const window = `${previous}\n${current}\n${m[0]}`;
      if (/sizeRecipeEscape|size-recipe-escape:/.test(window)) {continue;}
      violations.push(`${rel}:${line} — ${m[1]}={${m[2]}}`);
    }
  });
  return violations;
}

const ESCAPE_REASON = String.raw`(?:"([^"\n]*)"|'([^'\n]*)'|\x60([^\x60$\n]*)\x60)`;
/** `sizeRecipeEscape="…"`, `sizeRecipeEscape={"…"}`, `sizeRecipeEscape: "…"`. */
const ESCAPE_PROP_RE = new RegExp(String.raw`\bsizeRecipeEscape(?:=\{?\s*|\s*:\s*)${ESCAPE_REASON}`, 'g');
const ESCAPE_ATTR_RE = /\bsizeRecipeEscape=\{/g;
const ESCAPE_CALL_RE = /(?<!function\s+)\bsizeRecipeEscape\s*\(/g;
const ESCAPE_COMMENT_RE = /(?<!`)(?:\/\/|\/\*)\s*size-recipe-escape:\s*(.*?)\s*(?:\*\/.*)?$/;
const ESCAPE_REASON_RE = new RegExp(ESCAPE_REASON, 'g');

/** @param {string} line */
function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * Every size-recipe escape the code writes, with the reason it gives. A call
 * with no string argument, or a JSX prop whose value is not a string literal
 * (`sizeRecipeEscape={reason}`), is returned with `reason: undefined`: the
 * registry can only match a reason it can read.
 * @param {string} src
 * @returns {{ line: number, form: string, reason: string | undefined }[]}
 */
export function findSizeRecipeEscapes(src) {
  /** @type {{ line: number, form: string, reason: string | undefined }[]} */
  const sites = [];
  const lines = src.split('\n');
  const literalProps = new Set();
  for (const m of src.matchAll(ESCAPE_PROP_RE)) {
    literalProps.add(m.index);
    const line = lineAt(src, m.index ?? 0);
    if (isCommentLine(lines[line - 1] ?? '')) {continue;}
    sites.push({ line, form: 'prop', reason: (m[1] ?? m[2] ?? m[3] ?? '').trim() });
  }
  for (const m of src.matchAll(ESCAPE_ATTR_RE)) {
    if (literalProps.has(m.index)) {continue;}
    const line = lineAt(src, m.index ?? 0);
    if (isCommentLine(lines[line - 1] ?? '')) {continue;}
    sites.push({ line, form: 'prop', reason: undefined });
  }
  for (const m of src.matchAll(ESCAPE_CALL_RE)) {
    const line = lineAt(src, m.index ?? 0);
    if (isCommentLine(lines[line - 1] ?? '')) {continue;}
    let depth = 0;
    let end = (m.index ?? 0) + m[0].length - 1;
    for (; end < src.length; end++) {
      if (src[end] === '(') {depth += 1;}
      else if (src[end] === ')') {
        depth -= 1;
        if (depth === 0) {break;}
      }
    }
    const args = src.slice((m.index ?? 0) + m[0].length, end);
    const literals = [...args.matchAll(ESCAPE_REASON_RE)];
    const last = literals[literals.length - 1];
    sites.push({
      line,
      form: 'call',
      reason: last ? (last[1] ?? last[2] ?? last[3] ?? '').trim() : undefined,
    });
  }
  lines.forEach((text, index) => {
    if (text.trim().startsWith('*')) {return;}
    const m = text.match(ESCAPE_COMMENT_RE);
    if (m) {sites.push({ line: index + 1, form: 'comment', reason: m[1].trim() });}
  });
  return sites.sort((a, b) => a.line - b.line);
}

/**
 * `sizeRecipeEscape` is the weakest escape and it had no
 * registry, so it grew silently: any file could write the marker and both the
 * SIZE-RECIPE ESCAPE check above and `no-raw-geometry` skipped it. Every escape site now
 * has to be declared in the spec's `## Size-recipe escapes` table by file and
 * by the exact reason it gives, and a declared row whose site is gone fails
 * too, so the table cannot rot into a blanket pass. The allowlist is read from
 * the spec, never from the code (the radius-identity-registry shape).
 *
 * Missing spec or missing section → skip, the same as the drawing registry.
 */
function checkUndeclaredSizeRecipeEscapes() {
  let registry;
  try {
    registry = readSizeRecipeEscapeRegistry(join(ROOT, 'docs/theme-propagation-spec.md'));
  } catch (error) {
    return [`size-recipe escape registry: ${error instanceof Error ? error.message : error}`];
  }
  if (!registry.present) {return [];}
  const declared = new Map();
  for (const { file, reason } of registry.escapes) {declared.set(`${file}\n${reason}`, false);}
  /** @type {string[]} */
  const violations = [];
  const scan = (filePath) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath) || filePath.endsWith('.d.ts')) {return;}
    if (/\.(spec|test)\./.test(filePath)) {return;}
    const src = readFileSync(filePath, 'utf8');
    if (!src.includes('sizeRecipeEscape') && !src.includes('size-recipe-escape:')) {return;}
    const rel = relative(ROOT, filePath).replaceAll('\\', '/');
    for (const site of findSizeRecipeEscapes(src)) {
      if (site.reason === undefined || site.reason === '') {
        violations.push(`${rel}:${site.line} — sizeRecipeEscape with no written reason`);
        continue;
      }
      const key = `${rel}\n${site.reason}`;
      if (declared.has(key)) {
        declared.set(key, true);
        continue;
      }
      violations.push(`${rel}:${site.line} — undeclared escape "${site.reason}"`);
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  for (const [key, seen] of declared) {
    if (seen) {continue;}
    const [file, reason] = key.split('\n');
    violations.push(`${file} — declared escape "${reason}" has no site in the code (stale row)`);
  }
  return violations;
}

/**
 * `no-hex-literals` covers apps/, packages/ and features/, and a
 * surface no theme token reaches (GTK widget CSS outside the provider, a
 * content script on third-party pages, the badge API, Expo build config)
 * opts its file out with a `hex-escape: <reason>` comment. The comment alone
 * would let any file opt out, so every one must be a row in the spec's
 * `## Colour-literal escapes` table by file and exact reason, and a row whose
 * comment is gone fails too (the size-recipe registry shape).
 *
 * Missing spec or missing section → skip, the same as the drawing registry.
 */
function checkUndeclaredHexEscapes() {
  let registry;
  try {
    registry = readHexEscapeRegistry(join(ROOT, 'docs/theme-propagation-spec.md'));
  } catch (error) {
    return [`colour-literal escape registry: ${error instanceof Error ? error.message : error}`];
  }
  if (!registry.present) {return [];}
  const declared = new Map();
  for (const { file, reason } of registry.escapes) {declared.set(`${file}\n${reason}`, false);}
  /** @type {string[]} */
  const violations = [];
  const scan = (filePath) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath) || filePath.endsWith('.d.ts')) {return;}
    if (/\.(spec|test)\./.test(filePath)) {return;}
    const src = readFileSync(filePath, 'utf8');
    const rel = relative(ROOT, filePath).replaceAll('\\', '/');
    for (const site of findHexEscapes(src)) {
      if (!site.reason) {
        violations.push(`${rel}:${site.line} — hex-escape with no written reason`);
        continue;
      }
      const key = `${rel}\n${site.reason}`;
      if (declared.has(key)) {
        declared.set(key, true);
        continue;
      }
      violations.push(`${rel}:${site.line} — undeclared escape "${site.reason}"`);
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  for (const [key, seen] of declared) {
    if (seen) {continue;}
    const [file, reason] = key.split('\n');
    violations.push(`${file} — declared escape "${reason}" has no comment in the code (stale row)`);
  }
  return violations;
}

// ── Story file shape ──────────────────────────────────────────────────────

const STORY_FILE_RE = /\.(stories|story)\.(js|jsx|mjs|ts|tsx)$/;

/**
 * Names exported through `export { a, b as c }` statements.
 * @param {string} src
 * @returns {Set<string>}
 */
function braceExportNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const item of m[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      const name = (parts[1] ?? parts[0] ?? '').trim();
      if (name) {names.add(name);}
    }
  }
  return names;
}

/**
 * Storybook's CSF indexer accepts a story file in exactly two shapes: classic
 * CSF (`const meta = {...}; export default meta`) or CSF Factories
 * (`export const meta = preview.meta({...})`, no default export). A file that
 * exports a NAMED `meta` next to `export default` is neither — the indexer
 * takes the named export as the factory shape, finds no factory call, and
 * reports "CSF: missing default export (line 1, col 0)". One such file fails
 * the whole index, the preview build, and `storybook dev` exits non-zero.
 * Nothing else catches it: package builds exclude `.stories.` files, so the
 * pipeline stays green. Three files did exactly this on main.
 */
function checkStoryFileShape() {
  /** @type {string[]} */
  const violations = [];
  const scan = (filePath) => {
    if (!STORY_FILE_RE.test(filePath)) {return;}
    const rel = relative(ROOT, filePath);
    const src = readFileSync(filePath, 'utf8');
    const braced = braceExportNames(src);
    const namedMeta =
      src.match(/^export\s+(?:const|let|var|function|class)\s+meta\b/m) ??
      (braced.has('meta') ? src.match(/^export\s*\{[^}]*\bmeta\b[^}]*\}/m) : null);
    const hasDefault = /^export\s+default\b/m.test(src) || braced.has('default');
    const isFactory = /^export\s+(?:const|let|var)\s+meta\b[^=\n]*=\s*[\w$.]+\.meta\s*\(/m.test(src);
    if (namedMeta && hasDefault) {
      violations.push(
        `${rel}:${lineAt(src, namedMeta.index ?? 0)} — exports a named \`meta\` beside \`export default\`; drop the \`export\` (\`meta\` is reserved for CSF Factories)`,
      );
    } else if (namedMeta && !isFactory) {
      violations.push(
        `${rel}:${lineAt(src, namedMeta.index ?? 0)} — exports a named \`meta\` that is not a CSF factory call (\`preview.meta(...)\`) and has no default export`,
      );
    } else if (!namedMeta && !hasDefault) {
      violations.push(`${rel} — no default export (classic CSF needs \`export default meta\`)`);
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  return violations;
}

/**
 * A `// mpo-drawing` pragma is not itself an exemption. The file
 * must also be a DRAWING member in the spec table. Missing spec → skip
 * (shc can run the oxlint rules before it copies the table).
 */
function checkUndeclaredDrawings() {
  const specPath = join(ROOT, 'docs/theme-propagation-spec.md');
  let registry;
  try {
    registry = readDrawingRegistry(specPath);
  } catch (error) {
    return {
      violations: [`drawing registry: ${error instanceof Error ? error.message : String(error)}`],
      ok: false,
    };
  }
  if (!registry.present) {return { violations: [], ok: true };}
  /** @type {string[]} */
  const violations = [];
  const scan = (filePath) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath)) {return;}
    const src = readFileSync(filePath, 'utf8');
    if (!DRAWING_PRAGMA.test(src)) {return;}
    const rel = relative(ROOT, filePath);
    if (isDrawingFile(rel, registry.files) || isDrawingFile(filePath, registry.files)) {return;}
    violations.push(`${rel} — // mpo-drawing without a DRAWING Members row in ## Drawing files`);
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  return { violations, ok: true };
}

/**
 * WORKSPACE PATHS SHADOW — `compilerOptions.paths` REPLACES the
 * inherited map, it never merges with it. `tsconfig.base.json` extends the
 * generated `tamagui-workspace-paths.generated.json`, so one local entry in a
 * package tsconfig hides every `@repo/*` mapping from that
 * program and the whole package fails to resolve its own workspace. That is
 * how a single app once collected 578 typecheck errors, while several other
 * packages carried the same override.
 *
 * The fix for a deep-import alias is the package's own `exports` map, which the
 * generator reads. Escape (rare, for a program that deliberately does not
 * extend the base): `// workspace-paths-escape:` with a reason on the line
 * above `"paths"`.
 */
function checkTsconfigWorkspacePaths() {
  /** @type {string[]} */
  const violations = [];
  /** @type {string[]} */
  const files = [];
  const featuresTsconfig = join(FEATURES_DIR, 'tsconfig.json');
  if (existsSync(featuresTsconfig)) {files.push(featuresTsconfig);}
  for (const dir of [APPS_DIR, PACKAGES_DIR, PUBLIC_DIR]) {
    if (!existsSync(dir)) {continue;}
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {continue;}
      const candidate = join(dir, entry.name, 'tsconfig.json');
      if (existsSync(candidate)) {files.push(candidate);}
    }
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Whole-line comments only: a `//` inside a string (the $schema URL) must
    // survive, and these files are JSONC, not JSON5.
    const stripped = src.replace(/^[ \t]*\/\/.*$/gm, '');
    let doc;
    try {
      doc = JSON.parse(stripped);
    } catch {
      continue;
    }
    const paths = doc?.compilerOptions?.paths;
    if (!paths || typeof paths !== 'object') {continue;}
    const extendsField = doc.extends;
    const extendsBase = Array.isArray(extendsField)
      ? extendsField.some((e) => typeof e === 'string' && e.includes('tsconfig.base'))
      : typeof extendsField === 'string' && extendsField.includes('tsconfig.base');
    if (!extendsBase) {continue;}
    const decl = src.match(/^[ \t]*"paths"\s*:/m);
    const index = decl?.index ?? 0;
    const before = src.slice(0, index);
    if (/workspace-paths-escape:/.test(before.split('\n').slice(-3).join('\n'))) {continue;}
    violations.push(
      `${relative(ROOT, file)}:${lineAt(src, index)} — declares \`compilerOptions.paths\` (${Object.keys(paths).join(', ')}) while extending tsconfig.base`,
    );
  }
  return violations;
}

/**
 * Metro: the condition names Metro matches, per platform, when
 * `resolver.unstable_enablePackageExports` is on. `require`/`import` are
 * Metro's own defaults; Expo's metro-config adds `react-native` for ios and
 * android and `browser` for web. `default` always matches. Keys are matched
 * in the ORDER the exports map declares them, first hit wins, and neither
 * `source` nor `types` is ever in the set.
 */
const METRO_PLATFORM_CONDITIONS = {
  ios: new Set(['react-native', 'import', 'require', 'default']),
  web: new Set(['browser', 'import', 'require', 'default']),
};
/** What Metro's file-based fallback will accept at `<pkg>/<subpath>`. */
const METRO_FALLBACK_EXTS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];

/**
 * First target Metro would pick from an exports-map entry for one condition
 * set, walking nested condition objects in declaration order.
 * @param {unknown} target
 * @param {Set<string>} conditions
 * @returns {string | null}
 */
function metroExportTarget(target, conditions) {
  if (typeof target === 'string') {return target;}
  if (Array.isArray(target)) {
    for (const item of target) {
      const hit = metroExportTarget(item, conditions);
      if (hit) {return hit;}
    }
    return null;
  }
  if (!target || typeof target !== 'object') {return null;}
  for (const [key, value] of Object.entries(target)) {
    if (!conditions.has(key)) {continue;}
    const hit = metroExportTarget(value, conditions);
    if (hit) {return hit;}
  }
  return null;
}

/**
 * @param {unknown} target
 * @returns {boolean} true when any condition in the entry is `source`
 */
function declaresSourceCondition(target) {
  if (!target || typeof target !== 'object') {return false;}
  if (Array.isArray(target)) {return target.some(declaresSourceCondition);}
  return Object.entries(target).some(([key, value]) => key === 'source' || declaresSourceCondition(value));
}

/**
 * @param {string} pkgRoot
 * @param {string} subpath an exports key such as `./seam`
 */
function hasMetroFallback(pkgRoot, subpath) {
  const base = join(pkgRoot, subpath.replace(/^\.\//, ''));
  if (METRO_FALLBACK_EXTS.some((ext) => existsSync(`${base}.${ext}`))) {return true;}
  if (existsSync(join(base, 'package.json'))) {return true;}
  return METRO_FALLBACK_EXTS.some((ext) => existsSync(join(base, `index.${ext}`)));
}

/**
 * Metro subpath fallback.
 *
 * Metro reads the exports map, picks the first condition it recognises, and
 * if that file is missing it does NOT reconsider `source` or `default`: it
 * warns and retries as a plain file lookup for `<pkg>/<subpath>.*`. The
 * packages under packages/ are consumed from source and never
 * built, so a subpath whose Metro condition points into `dist/` fails the
 * whole bundle the first time anything in a Metro graph imports it. The `.`
 * export is exempt because its file fallback lands on the package root, where
 * `main`/`module` point at src.
 *
 * A package is source-consumed when the entry or the package declares a
 * `source` condition, or `main` points into src/. A genuinely built package
 * (keycloak-js: no `source`, `main` in dist, `prepare` builds it) is skipped.
 */
function checkMetroSubpathFallbacks() {
  /** @type {string[]} */
  const violations = [];
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR]) {
    if (!existsSync(dir)) {continue;}
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {continue;}
      const pkgRoot = join(dir, entry.name);
      const pkgJsonPath = join(pkgRoot, 'package.json');
      if (!existsSync(pkgJsonPath)) {continue;}
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      } catch {
        continue;
      }
      const exportsMap = pkg?.exports;
      if (!exportsMap || typeof exportsMap !== 'object' || Array.isArray(exportsMap)) {continue;}
      const packageFromSource =
        typeof pkg.source === 'string' ||
        (typeof pkg.main === 'string' && /^(\.\/)?src\//.test(pkg.main)) ||
        declaresSourceCondition(exportsMap['.']);
      for (const [subpath, target] of Object.entries(exportsMap)) {
        if (!subpath.startsWith('./') || subpath.includes('*')) {continue;}
        if (!packageFromSource && !declaresSourceCondition(target)) {continue;}
        if (hasMetroFallback(pkgRoot, subpath)) {continue;}
        for (const [platform, conditions] of Object.entries(METRO_PLATFORM_CONDITIONS)) {
          const resolved = metroExportTarget(target, conditions);
          if (!resolved || !resolved.startsWith('./dist/')) {continue;}
          violations.push(
            `${relative(ROOT, pkgJsonPath)} — "${subpath}" resolves to ${resolved} on ${platform}, which is unbuilt; add ${relative(ROOT, join(pkgRoot, `${subpath.replace(/^\.\//, '')}.ts`))} re-exporting the source entry`,
          );
          break;
        }
      }
    }
  }
  return violations;
}

/**
 * react-native-web's export list, read from the copy installed under ROOT.
 *
 * `dist/index.js` is the file the web target evaluates — it is RNW's `module`
 * entry and what the storybook alias resolves `react-native` to — so its
 * `export { … }` clauses ARE the vocabulary. Reading them is what keeps this
 * check from drifting when RNW is upgraded; a hand-kept list would go stale
 * the first time upstream adds or drops an export.
 *
 * @returns {Set<string> | undefined} undefined when RNW is not installed, which
 * disables the check rather than failing a partial install.
 */
function readReactNativeWebExports() {
  const entry = join(ROOT, 'node_modules', 'react-native-web', 'dist', 'index.js');
  if (!existsSync(entry)) {return undefined;}
  /** @type {Set<string>} */
  const names = new Set();
  for (const clause of readFileSync(entry, 'utf8').matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const specifier of clause[1].split(',')) {
      const name = specifier
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) {names.add(name);}
    }
  }
  return names.size ? names : undefined;
}

/** Platform-suffixed files the web resolver never reaches. */
const NATIVE_ONLY_FILE_RE = /\.(native|ios|android)\.(tsx|ts|jsx|js)$/;

/**
 * `import … from "react-native"`, including the multi-line brace form.
 *
 * The body may contain no quote and no `;`, which is what stops the non-greedy
 * match from swallowing an earlier `import … from "react"` and attributing
 * ITS names to react-native.
 */
const REACT_NATIVE_IMPORT_RE = /import\s+([^;'"]*?)from\s*["']react-native["']/g;

/** @param {string} absPath @param {string} dir */
function isUnder(absPath, dir) {
  const rel = relative(dir, absPath);
  return rel !== '' && !rel.startsWith('..');
}

/**
 * react-native named import with no react-native-web counterpart.
 *
 * Every web build aliases `react-native` to `react-native-web`
 * (apps/storybook/.storybook/main.ts, createStorybookViteConfig, the app vite
 * config). RNW does not implement all of react-native, so a NAMED import of
 * something it never exports is not a missing feature at runtime — it is a
 * module-evaluation SyntaxError, and one failing module takes the WHOLE bundle
 * with it. That is how `import { ActionSheetIOS } from "react-native"` in
 * Select (2b94d9eeb) made every story in the gallery render blank, not just
 * Select's.
 *
 * A `Platform.OS` guard inside the file cannot save it: the import fails
 * before any code runs. The two legal shapes are a namespace import, which
 * lands on `undefined` for a missing name (8c62c2a6f, the fix), and a
 * `.native.tsx` / `.ios.tsx` sibling the web resolver never reaches.
 *
 * Scope is packages/ and features/ — the trees the preview bundle is built from.
 * Type-only specifiers are erased before any bundler sees them, so
 * `import type { GestureResponderEvent }` is fine and stays fine.
 */
function checkReactNativeWebExports() {
  const exported = readReactNativeWebExports();
  if (!exported) {return { ok: false, violations: /** @type {string[]} */ ([]) };}
  /** @type {string[]} */
  const violations = [];
  for (const { abs, rel, src } of sourceFiles()) {
    if (!isUnder(abs, PUBLIC_DIR) && !isUnder(abs, FEATURES_DIR)) {continue;}
    if (NATIVE_ONLY_FILE_RE.test(abs)) {continue;}
    if (!src.includes('react-native')) {continue;}
    for (const statement of src.matchAll(REACT_NATIVE_IMPORT_RE)) {
      const clause = statement[1].trim();
      if (/^type\b/.test(clause)) {continue;}
      const named = clause.match(/\{([\s\S]*)\}/);
      // No brace group means a default or `* as ns` import, and a namespace
      // read of a missing name is `undefined`, never a SyntaxError.
      if (!named) {continue;}
      for (const specifier of named[1].split(',')) {
        const entry = specifier.trim();
        if (!entry || /^type\b/.test(entry)) {continue;}
        const name = entry.split(/\s+as\s+/)[0].trim();
        if (!name || exported.has(name)) {continue;}
        violations.push(`${rel}:${lineAt(src, statement.index ?? 0)} — ${name} (react-native-web exports no ${name})`);
      }
    }
  }
  return { ok: true, violations };
}

/**
 * Offsets in `src` that are live CODE — not inside a comment, a string or a
 * template literal. One left-to-right pass. Regex literals are treated as
 * code, and a `${…}` interpolation is treated as string, which can only ever
 * make this check miss something, never invent a violation.
 *
 * @param {string} src
 * @returns {Uint8Array} 1 at every code offset
 */
function codeOffsets(src) {
  const mask = new Uint8Array(src.length);
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    const next = src[i + 1];
    if (char === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {i++;}
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {i++;}
      i += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    mask[i] = 1;
    i++;
  }
  return mask;
}

const IMPORT_META_RE = /\bimport\s*\.\s*meta\b/g;
const IMPORT_META_SCANNED_RE = /\.(tsx|ts|jsx|js|mjs|cjs|mts|cts)$/;

/**
 * A VALUE import of a node: builtin. `import type { … } from "node:fs"` is
 * erased, so it proves nothing about where the file runs and does not count.
 */
const NODE_BUILTIN_IMPORT_RE =
  /(?:^|\n)\s*import\s+(?!type\s)[^;'"]*from\s*["']node:[^"']+["']|require\(\s*["']node:[^"']+["']\s*\)|import\(\s*["']node:[^"']+["']\s*\)/;

/**
 * `import.meta` in a public package's runtime source.
 *
 * `import.meta` is legal only in an ES module;
 * in a CLASSIC script it is a PARSE-time SyntaxError, so no `typeof
 * import.meta` guard and no try/catch around it ever gets to run — the file
 * simply never parses and takes its consumers down with it, silently. Two
 * bundles execute mpo as a classic script: the vxrn/rolldown native bundle for
 * Hermes, and any Metro bundle built for platform=web, which is exactly what
 * an Expo DOM component (`'use dom'`) is. A `.web.ts` twin is not an escape
 * either: One's web build and tamagui-build resolve `.web.ts` the way Metro
 * does, so a twin lands in the Vite build too.
 *
 * The replacement is a static `process.env.<KEY>` member read inside a
 * try/catch (packages/platform/src/config/runtimeConfig.ts), or, for an SSR
 * flag, `isServer` from @repo/platform, which is split at the
 * FILE level rather than by a bundler define.
 *
 * Exempt, by construction rather than by allowlist: a file that imports a
 * `node:` builtin as a value is Node-only build tooling
 * (@repo/config's vite/vitest configs, the CLI,
 * @repo/utils/dev) and could not run in a browser or on Hermes
 * whatever it did with import.meta. Specs are exempt for the same reason —
 * vitest runs them in Node and provides `import.meta.env` itself.
 */
function checkImportMetaInPublicSource() {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(PUBLIC_DIR)) {return violations;}
  for (const pkg of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (!pkg.isDirectory() || pkg.name.startsWith('.') || pkg.name === 'node_modules') {continue;}
    walkFiles(join(PUBLIC_DIR, pkg.name, 'src'), (filePath) => {
      if (!IMPORT_META_SCANNED_RE.test(filePath)) {return;}
      if (/\.(spec|test)\./.test(filePath)) {return;}
      const src = readFileSync(filePath, 'utf8');
      if (!IMPORT_META_RE.test(src)) {
        IMPORT_META_RE.lastIndex = 0;
        return;
      }
      IMPORT_META_RE.lastIndex = 0;
      if (NODE_BUILTIN_IMPORT_RE.test(src)) {return;}
      const mask = codeOffsets(src);
      for (const match of src.matchAll(IMPORT_META_RE)) {
        const index = match.index ?? 0;
        if (mask[index] !== 1) {continue;}
        violations.push(`${relative(ROOT, filePath)}:${lineAt(src, index)}`);
      }
    });
  }
  return violations;
}

// ── React Flow selectors outside the token bridge ─────────────────────────

const REACT_FLOW_SELECTOR_RE = /\.react-flow__[\w-]+/g;
/**
 * The two files a `.react-flow__` string may live in, both DECLARED boundaries.
 *
 * `theme/graphVars.ts` owns the paint: every React Flow surface is set through
 * its own `--xy-*` variable there, never through a rule.
 *
 * `react-flow/xy.ts` owns the @xyflow DOM contract — it is already the one file
 * allowed to import the library at all (oxlint `no-restricted-imports`), and a
 * class NAME is part of that contract the same way an exported symbol is. The
 * long press has to find the pane to listen on it, which is a DOM lookup and
 * not a paint rule; putting the string at the call site would mean a library
 * rename lands in a `querySelector` that returns null in silence.
 */
const GRAPH_VARS_EXEMPT = ['theme/graphVars.ts', 'react-flow/xy.ts'];
const REACT_FLOW_SCANNED_RE = /\.(tsx|ts|jsx|js|mjs|cjs|css)$/;

/**
 * Offsets that are NOT inside a comment.
 *
 * `codeOffsets` masks strings as well, which is the opposite of what this needs:
 * a hand-written React Flow rule lives in a template literal or a `className`,
 * so strings are exactly the interesting part. Comments are not — the map's own
 * allowlist explains itself by naming `.react-flow__node-input`, and that
 * explanation must not be the thing that fails the build.
 * @param {string} src
 */
function nonCommentOffsets(src) {
  const mask = new Uint8Array(src.length).fill(1);
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    const next = src[i + 1];
    if (char === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {mask[i++] = 0;}
      continue;
    }
    if (char === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {mask[i++] = 0;}
      mask[i] = 0;
      mask[i + 1] = 0;
      i += 2;
      continue;
    }
    i++;
  }
  return mask;
}

/**
 * A `.react-flow__` selector under packages/<pkg>/src, outside the one
 * file that owns the mapping.
 */
function checkGraphVarsCoverage() {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(PUBLIC_DIR)) {return violations;}
  for (const pkg of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (!pkg.isDirectory() || pkg.name.startsWith('.') || pkg.name === 'node_modules') {continue;}
    walkFiles(join(PUBLIC_DIR, pkg.name, 'src'), (filePath) => {
      if (!REACT_FLOW_SCANNED_RE.test(filePath)) {return;}
      const posix = filePath.replace(/\\/g, '/');
      if (GRAPH_VARS_EXEMPT.some((exempt) => posix.endsWith(exempt))) {return;}
      // Specs are exempt for the reason check 10 exempts them: a spec that
      // asserts WHICH classes a variable binds to has to name those classes,
      // and it ships no paint. Nothing else is exempt, including stories.
      if (/\.(spec|test)\./.test(filePath)) {return;}
      const src = readFileSync(filePath, 'utf8');
      if (!src.includes('.react-flow__')) {return;}
      const mask = nonCommentOffsets(src);
      for (const match of src.matchAll(REACT_FLOW_SELECTOR_RE)) {
        const index = match.index ?? 0;
        if (mask[index] !== 1) {continue;}
        violations.push(`${relative(ROOT, filePath)}:${lineAt(src, index)} — ${match[0]}`);
      }
    });
  }
  return violations;
}

// ── Story honesty: foreign control specimens ──────────────────────────────

/**
 * The raw `tamagui` control primitives a story may not mount unlabeled: the
 * pressables and controls @repo/forms owns a house equivalent
 * for. Layout and text primitives (XStack, YStack, Stack, Paragraph, Text,
 * View, SizableText, Label) are out of scope BY RULE: roughly 250 story files
 * import them and they carry no control anatomy to bypass.
 */
const STORY_FOREIGN_CONTROL_PRIMITIVES = new Set([
  'Button',
  'Checkbox',
  'Input',
  'Progress',
  'RadioGroup',
  'Select',
  'Slider',
  'Switch',
  'TextArea',
  'ToggleGroup',
]);

/**
 * The exemption this check introduced and the radius sweep already reads
 * off the running story, so a specimen is declared in exactly one place for both
 * arms.
 */
const STORY_HONESTY_MARKER_RE = /\bforeignContrastSpecimen\s*:\s*true\b/;

/**
 * The frappe package is the data client, not a catalog package: its
 * stories demo hooks, and the buttons in them
 * drive the hook, not a knob probe. It also cannot import a house control:
 * forms reaches frappe through its @repo/storybook devDependency,
 * so the import would close a workspace cycle.
 */
const STORY_HONESTY_EXEMPT_PREFIXES = ['packages/frappe/'];

const TAMAGUI_IMPORT_RE = /import\s+([^;'"]*?)from\s*["']tamagui["']/g;

/**
 * Stories are the verify substrate for the knob rules, and a raw
 * tamagui control consumes no knobs. FieldLayout, FieldGroup, Fieldset and
 * FormGrid measured 9px radius at every `borderRadius` stop because their
 * stories mounted `Input as TamaguiInput`. A sweep that trusts such a story
 * manufactures a pass.
 *
 * File granularity is deliberate: attributing a JSX usage to one story export
 * is not a regex job, and the knob probes stay the live arm for a labeled
 * file. `import type` is erased and never counts.
 */
function checkStoryForeignControls() {
  /** @type {string[]} */
  const violations = [];
  const scan = (filePath) => {
    if (!STORY_FILE_RE.test(filePath)) {return;}
    const rel = relative(ROOT, filePath).replaceAll('\\', '/');
    if (STORY_HONESTY_EXEMPT_PREFIXES.some((prefix) => rel.startsWith(prefix))) {return;}
    const src = readFileSync(filePath, 'utf8');
    if (!src.includes('tamagui')) {return;}
    /** @type {{ imported: string, alias: string, line: number }[]} */
    const controls = [];
    for (const statement of src.matchAll(TAMAGUI_IMPORT_RE)) {
      const clause = statement[1].trim();
      if (/^type\b/.test(clause)) {continue;}
      const named = clause.match(/\{([\s\S]*)\}/);
      if (!named) {continue;}
      for (const specifier of named[1].split(',')) {
        const entry = specifier.trim();
        if (!entry || /^type\b/.test(entry)) {continue;}
        const [imported, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
        if (!STORY_FOREIGN_CONTROL_PRIMITIVES.has(imported)) {continue;}
        controls.push({
          imported,
          alias: alias || imported,
          line: lineAt(src, statement.index ?? 0),
        });
      }
    }
    if (!controls.length || STORY_HONESTY_MARKER_RE.test(src)) {return;}
    for (const { imported, alias, line } of controls) {
      const shown = alias === imported ? imported : `${imported} as ${alias}`;
      violations.push(
        `${rel}:${line} — \`${shown}\` from "tamagui" with no \`parameters.foreignContrastSpecimen: true\``,
      );
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {walkFiles(dir, scan);}
  return violations;
}

/**
 * Run structural convention checks over a consumer tree.
 *
 * @param {RunConventionChecksOptions} [options]
 * @returns {number} 0 when clean, 1 when any check failed
 */
export function runConventionChecks(options = {}) {
  applyRoots(options.roots);
  const css = checkCssInApps();
  const twins = checkFeaturesTwins();
  const sizeRecipeEscape = checkSizeRecipeEscape();
  const undeclaredEscapes = checkUndeclaredSizeRecipeEscapes();
  const undeclaredHexEscapes = checkUndeclaredHexEscapes();
  const storyShape = checkStoryFileShape();
  const storyForeignControls = checkStoryForeignControls();
  const undeclaredDrawings = checkUndeclaredDrawings();
  const tsconfigPaths = checkTsconfigWorkspacePaths();
  const metroFallbacks = checkMetroSubpathFallbacks();
  const rnWebExports = checkReactNativeWebExports();
  const importMeta = checkImportMetaInPublicSource();
  const graphVars = checkGraphVarsCoverage();
  const tokens = checkTransitionTokens();
  const styleTokens = checkStyleTokens();
  const themeNames = checkThemeNames();
  const intents = checkIntentTokens();
  const animProps = checkAnimationProps();
  let failed = false;

  if (animProps.legacyProp.length) {
    failed = true;
    console.error(
      'Convention: `animation` is the tamagui 1.x prop — on 2.x it is silently dropped (no animation at all). Use `transition`.\n',
    );
    for (const msg of animProps.legacyProp) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (animProps.driverless.length) {
    failed = true;
    console.error(
      'Convention (LC-24): enterStyle/exitStyle without a `transition` on the same element never interpolates — the styles are dead code.\n',
    );
    for (const msg of animProps.driverless) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (css.length) {
    failed = true;
    console.error('Convention: .css files are banned under apps/*\n');
    for (const file of css) {console.error(`  ${file}`);}
    console.error('');
  }

  if (twins.length) {
    failed = true;
    console.error('Convention: each product app must have a features/<name> twin\n');
    for (const msg of twins) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (sizeRecipeEscape.length) {
    failed = true;
    console.error(
      "Convention (SIZE-RECIPE ESCAPE): control chrome (height / minHeight / paddingHorizontal / fontSize) must come from the size recipe, not a numeric literal. Escape with `sizeRecipeEscape` or `// size-recipe-escape: <reason>` on the previous line or same statement, and declare the reason in the spec's `## Size-recipe escapes` table. Pilot: Button/, InputParts/, fields/Select/.\n",
    );
    for (const msg of sizeRecipeEscape) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (undeclaredEscapes.length) {
    failed = true;
    console.error(
      'Convention (SIZE-RECIPE ESCAPE REGISTRY): every sizeRecipeEscape site must be a row in docs/theme-propagation-spec.md `## Size-recipe escapes`, by file and by the exact reason the code writes. The table is the allowlist; writing another escape cannot widen it. A row whose site is gone fails too.\n',
    );
    for (const msg of undeclaredEscapes) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (undeclaredHexEscapes.length) {
    failed = true;
    console.error(
      'Convention (COLOUR-LITERAL ESCAPE REGISTRY): a `hex-escape: <reason>` comment exempts its file from mpo-conventions/no-hex-literals, so every one must be a row in docs/theme-propagation-spec.md `## Colour-literal escapes`, by file and by the exact reason the comment writes. Reach for a theme token first; the escape is for surfaces no token reaches. A row whose comment is gone fails too.\n',
    );
    for (const msg of undeclaredHexEscapes) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (storyShape.length) {
    failed = true;
    console.error(
      'Convention (STORY FILE SHAPE): a story file must be classic CSF (`export default meta`, no named `meta` export) or a CSF factory (`export const meta = preview.meta(...)`). Anything else makes Storybook\'s indexer fail the WHOLE gallery with "CSF: missing default export", and no package build ever sees it.\n',
    );
    for (const msg of storyShape) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (storyForeignControls.length) {
    failed = true;
    console.error(
      'Convention (FOREIGN CONTROL SPECIMEN): a story composes catalog components. A raw control primitive imported from "tamagui" (Input, Button, Checkbox, Switch, Slider, Select, RadioGroup, ToggleGroup, Progress, TextArea) consumes no knobs, so a knob sweep that trusts the story scores the primitive and marks the component checked. Mount the house control from @repo/forms (inside a layout: `<Input><Input.Box><Input.Area /></Input.Box></Input>`), or, when the raw primitive is there on purpose to show the contrast, label that story `parameters: { foreignContrastSpecimen: true }` so the probes skip it. Layout and text primitives (XStack, YStack, Paragraph, Text) are out of scope.\n',
    );
    for (const msg of storyForeignControls) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (undeclaredDrawings.violations.length) {
    failed = true;
    console.error(
      'Convention (DRAWING REGISTRY): `// mpo-drawing` is only legal on a file listed as a DRAWING member in docs/theme-propagation-spec.md. Adding an undeclared drawing file still fails.\n',
    );
    for (const msg of undeclaredDrawings.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (tsconfigPaths.length) {
    failed = true;
    console.error(
      "Convention (WORKSPACE PATHS SHADOW): `compilerOptions.paths` REPLACES the map tsconfig.base.json inherits from tamagui-workspace-paths.generated.json, so one local entry hides every `@multiplatform.one/*` mapping from that program. Declare the alias in the target package's `exports` (the generator reads it) instead. Escape with `// workspace-paths-escape: <reason>` above the key.\n",
    );
    for (const msg of tsconfigPaths) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (metroFallbacks.length) {
    failed = true;
    console.error(
      'Convention (METRO SUBPATH FALLBACK): a subpath export in a source-consumed package must have a `<pkg>/<subpath>.ts` file re-exporting its source entry. Metro resolves the exports map to dist/, finds nothing (public/ is never built), and falls back to a FILE lookup at that path — it never reconsiders `source`, so the first import of the subpath fails the whole bundle. A genuinely built package carries no `source` condition and is skipped.\n',
    );
    for (const msg of metroFallbacks) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (rnWebExports.violations.length) {
    failed = true;
    console.error(
      'Convention (REACT-NATIVE-WEB EXPORT): a NAMED import from "react-native" must name something react-native-web exports. Every web build aliases react-native to react-native-web, so a name it does not export is a module-evaluation SyntaxError that takes the WHOLE bundle down — every story in the gallery, not just the importing component — and a Platform.OS guard cannot help, because the import fails before any code runs. Read it off a namespace import (`import * as ReactNative from "react-native"`) or move the call into a .native.tsx sibling. `import type { … }` is erased and never counts.\n',
    );
    for (const msg of rnWebExports.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (graphVars.length) {
    failed = true;
    console.error(
      "Convention (GRAPH VARS COVERAGE): a `.react-flow__` selector belongs in the token bridge, nowhere else. React Flow reads every paint through `var(--xy-thing, var(--xy-thing-default))`, so the whole surface is settable without touching its stylesheet; a rule written anywhere else wins or loses on specificity instead of on the knob, and the next @xyflow/react upgrade silently changes which. Set the variable in `theme/graphVars.ts`, or put the rule in the package's own `css/` tree (outside `src`) where a reviewer reads it whole. A DOM LOOKUP is the one other legitimate use, and it belongs in `react-flow/xy.ts` beside the rest of the @xyflow contract. A mention inside a comment is fine and is not flagged.\n",
    );
    for (const msg of graphVars) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (importMeta.length) {
    failed = true;
    console.error(
      "Convention (NO import.meta IN public/*/src): `import.meta` is legal only in an ES module. In a CLASSIC script it is a PARSE-time SyntaxError, so no `typeof import.meta` guard and no try/catch around it ever runs — the file never parses and takes its consumers with it, silently. Two bundles execute mpo as a classic script: the vxrn/rolldown native bundle for Hermes, and any Metro bundle for platform=web, which is what an Expo DOM component (`'use dom'`) is. Read a static `process.env.<KEY>` member expression inside try/catch instead (public/platform/src/config/runtimeConfig.ts), or take an SSR flag from `isServer` in @repo/platform. A .web.ts twin is not an escape — One's web build and tamagui-build resolve it like Metro. Node-only build tooling (a file importing a `node:` builtin) and specs are exempt.\n",
    );
    for (const msg of importMeta) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (tokens.violations.length) {
    failed = true;
    console.error(
      `Convention: transition="…" must use a registered animation token (${tokens.valid.join(', ')}, or "none"). An unknown token silently disables the animation.\n`,
    );
    for (const msg of tokens.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (styleTokens.violations.length) {
    failed = true;
    console.error(
      "Convention: a `$token` style literal must resolve — as a theme key ($color11, $borderColor, $accentBackground, a Radix ramp step), as a token in the prop's own scale (radius/size/zIndex/color), or as a space token. None of those matched, so Tamagui drops the prop and the style never applies.\n",
    );
    for (const msg of styleTokens.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (themeNames.violations.length) {
    failed = true;
    console.error(
      'Convention: theme="…" must name a built theme or sub-theme (a scheme like light/dark, a hue like blue/red/green, a semantic child like error/warning/success, accent, or a state like active/alt1/alt2). An unbuilt name silently inherits the PARENT theme, so the element renders untinted.\n',
    );
    for (const msg of themeNames.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  if (intents.violations.length) {
    failed = true;
    console.error(
      `Convention: useResolvedKnobs({ intent }) must name a registered intent (${intents.valid.join(', ')}). An unknown name merges no overrides, so the component silently renders with its base knobs.\n`,
    );
    for (const msg of intents.violations) {console.error(`  ${msg}`);}
    console.error('');
  }

  for (const [name, ok] of [
    ['animation token', tokens.ok],
    ['style token', styleTokens.ok],
    ['theme name', themeNames.ok],
    ['intent', intents.ok],
    ['react-native-web export', rnWebExports.ok],
  ]) {
    if (!ok) {
      console.warn(
        `lint-conventions: skipped the ${name} check — its registry could not be read (incomplete install?).`,
      );
    }
  }

  if (failed) {
    console.error('See AGENTS.md (package boundaries / import rules). Structural checks: @repo/config/lint');
    return 1;
  }

  console.log('lint-conventions: ok');
  return 0;
}

const invokedDirectly = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(runConventionChecks());
}
