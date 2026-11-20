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
 *    every color, width and shadow is settable without touching its
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
 * 13. Fail on an UNDECLARED COLOR-LITERAL ESCAPE — a
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
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DRAWING_PRAGMA, isDrawingFile, readDrawingRegistry } from './drawing-registry.mjs';
import { findHexEscapes } from './oxlint.mjs';
import { readHexEscapeRegistry, readSizeRecipeEscapeRegistry } from './spec-registry.mjs';

const PACKAGE_JSON = 'package.json';
const SPEC_PATH = 'docs/theme-propagation-spec.md';
const THEME_BUILDER = '@tamagui/theme-builder';
const TAMAGUI_THEMES = '@tamagui/themes';

/**
 * @typedef {{ root?: string, apps?: string, features?: string, public?: string, packages?: string }} ConventionRoots
 * @typedef {{ roots?: ConventionRoots }} RunConventionChecksOptions
 */

/** @type {string} */
let ROOT = process.cwd();
/** @type {string} */
let APPS_DIR = path.join(ROOT, 'apps');
/** @type {string} */
let FEATURES_DIR = path.join(ROOT, 'features');
/** @type {string} */
let PUBLIC_DIR = path.join(ROOT, 'packages');
/** @type {string} */
let PACKAGES_DIR = path.join(ROOT, 'packages');

/**
 * @param {ConventionRoots} [roots] directory overrides; each defaults to its conventional place under `root`
 * @returns {{ root: string, apps: string, features: string, public: string, packages: string }} the resolved absolute directories
 */
export const resolveRoots = (roots = {}) => {
  const root = roots.root ?? process.cwd();
  return {
    root,
    apps: roots.apps ?? path.join(root, 'apps'),
    features: roots.features ?? path.join(root, 'features'),
    public: roots.public ?? path.join(root, 'packages'),
    packages: roots.packages ?? path.join(root, 'packages'),
  };
};

/** Shared platform / docs / chain shells — not product apps from
 *  mpo init --app. The webext target is not a shell: it lives INSIDE the
 *  product app (apps/<name>/webext) alongside the tauri target. */
const FEATURES_TWIN_EXEMPT = new Set([
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
  // storybook build output
  'storybook-static',
  // playwright html report (regenerated per e2e run)
  'playwright-report',
  // playwright traces/attachments
  'test-results',
]);

/** Build-output dirs are prefix-matched so variants like dist-spa-e2e are covered. */
const CSS_IGNORE_DIR_PREFIXES = ['dist-', 'dist_'];

/** Path prefixes under apps/ that are never scanned for .css */
const CSS_IGNORE_PREFIXES = [
  // Keycloakify vendored theme resources (not app-authored styles)
  path.join('keycloak', 'public', 'keycloakify-dev-resources'),
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

/** @typedef {(filePath: string) => void} FileVisitor */

/**
 * A sorted copy; `Array#toSorted` is not in the lib the JS program is checked against.
 * @template T
 * @param {Iterable<T>} items values to sort
 * @param {(a: T, b: T) => number} [compare] ordering; defaults to the code-unit order of `Array#sort`
 * @returns {T[]} a new sorted array
 */
const sortedCopy = (items, compare) => {
  const copy = [...items];
  copy.sort(compare);
  return copy;
};

/**
 * @param {unknown} value parsed JSON value
 * @returns {value is string} true for a string
 */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- this guard IS the boundary check for untyped JSON
const isString = (value) => typeof value === 'string';

/**
 * @param {unknown} value parsed JSON value
 * @returns {value is Record<string, unknown>} true for a non-null, non-array object
 */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- this guard IS the boundary check for untyped JSON
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `Foo as Bar` → ['Foo', 'Bar'], whatever whitespace separates the words.
 * @param {string} specifier an import or export specifier
 * @returns {string[]} the trimmed parts either side of `as`
 */
const splitAlias = (specifier) =>
  specifier
    .replaceAll(/\s+/gu, ' ')
    .split(' as ')
    .map((part) => part.trim());

/**
 * @param {Record<string, unknown> | null} object parsed JSON object
 * @param {string} key property to read
 * @returns {Record<string, unknown> | null} the property when it is itself an object
 */
const objectField = (object, key) => {
  const value = object?.[key];
  return isRecord(value) ? value : null;
};

/**
 * @param {string} text JSON text
 * @returns {Record<string, unknown> | null} the parsed object, or null when the text is not a JSON object
 */
const parseJsonObject = (text) => {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    // Safe to continue: unparseable JSON is skipped by every caller, same as a missing file.
    return null;
  }
};

/**
 * Skip VCS / cache dirs (but allow .storybook), ignored build-output names and prefixed build dirs.
 * @param {import('node:fs').Dirent} entry directory entry under inspection
 * @returns {boolean} true when the walk must not descend into or visit the entry
 */
const isSkippedEntry = (entry) => {
  const isDirectory = entry.isDirectory();
  if (isDirectory && entry.name.startsWith('.') && entry.name !== '.storybook') {
    return true;
  }
  if (CSS_IGNORE_DIR_NAMES.has(entry.name)) {
    return true;
  }
  return isDirectory && CSS_IGNORE_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix));
};

/**
 * @param {string} dir directory to walk recursively
 * @param {FileVisitor} onFile called with the absolute path of every visited file
 */
const walkFiles = (dir, onFile) => {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!isSkippedEntry(entry)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkFiles(full, onFile);
      } else if (entry.isFile()) {
        onFile(full);
      }
    }
  }
};

/**
 * @param {string} absPath absolute path of a file under the apps directory
 * @returns {boolean} true when the file is exempt from the no-.css rule
 */
const isCssIgnored = (absPath) => {
  const rel = path.relative(APPS_DIR, absPath);
  if (CSS_IGNORE_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) {
    return true;
  }
  const parts = rel.split(/[/\\]/u);
  if (CSS_IGNORE_APP_FILES.has(parts.slice(1).join('/'))) {
    return true;
  }
  return GENERATED_CSS_NAMES.has(parts.at(-1) ?? '');
};

const listAppNames = () => {
  if (!existsSync(APPS_DIR)) {
    return [];
  }
  return sortedCopy(
    readdirSync(APPS_DIR, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules' ? [d.name] : [],
    ),
  );
};

const checkCssInApps = () => {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(APPS_DIR)) {
    return violations;
  }

  walkFiles(APPS_DIR, (filePath) => {
    if (filePath.endsWith('.css') && !isCssIgnored(filePath)) {
      violations.push(path.relative(ROOT, filePath));
    }
  });
  return violations;
};

// ── Silent no-op token registries ─────────────────────────────────────────

/**
 * The members of each registry package this file reads, and nothing more.
 * @typedef {{
 *   '@tamagui/theme-builder': { createThemes?: (options: object) => Record<string, object> },
 *   '@tamagui/themes': { themes?: Record<string, object>, tokens?: Record<string, Record<string, unknown>> },
 *   '@tamagui/colors': Record<string, object>,
 *   '@tamagui/config/v5': { defaultConfig?: { fonts?: Record<string, { size?: object }> } },
 *   '@tamagui/helpers': {
 *     tokenCategories?: Record<string, object>,
 *     stylePropsAll?: object,
 *     stylePropsTextOnly?: Record<string, boolean>,
 *     stylePropsTransform?: Record<string, boolean>,
 *     stylePropsUnitless?: Record<string, boolean>,
 *   },
 *   '@tamagui/shorthands': { shorthands?: Record<string, string> },
 * }} RegistryModules
 */

/**
 * Bound to the consumer root so SHC/Lookout resolve their own Tamagui copies.
 * @type {{ <K extends keyof RegistryModules>(id: K): RegistryModules[K], resolve: NodeJS.RequireResolve }}
 */
let requireFromRoot = createRequire(path.join(process.cwd(), PACKAGE_JSON));

/**
 * Resolve a registry package. A package that cannot be resolved disables its
 * check (reported by `runConventionChecks`) instead of crashing the run — a
 * fresh clone with a partial install must still get the structural checks.
 * @template {keyof RegistryModules} K
 * @param {K} name registry package specifier
 * @returns {RegistryModules[K] | null} the loaded module, or null when it cannot be resolved
 */
const tryRequire = (name) => {
  try {
    return requireFromRoot(name);
  } catch {
    // Safe to continue: an unresolvable registry package disables its check (reported by runConventionChecks).
    return null;
  }
};

/**
 * A registry source under packages/<pkg>/, or, when the tree has no
 * packages/<pkg> (every project `mpo init` scaffolds), the same path inside the
 * installed @repo/<pkg>, which publishes its src/.
 * @param {string} relPath path of the source file relative to the packages directory
 * @returns {string} the file contents, or '' when it cannot be found
 */
const readPublicSource = (relPath) => {
  const [pkg, ...rest] = relPath.split('/');
  let full = path.join(PUBLIC_DIR, relPath);
  if (!existsSync(path.join(PUBLIC_DIR, pkg))) {
    try {
      full = path.join(path.dirname(requireFromRoot.resolve(`@repo/${pkg}/${PACKAGE_JSON}`)), ...rest);
    } catch {
      return '';
    }
  }
  return existsSync(full) ? readFileSync(full, 'utf-8') : '';
};

/**
 * Body of an object/interface literal that starts at `marker`, from its first
 * `{` to the first line-anchored closing brace. Used to read a registry's keys
 * out of the source that declares them.
 * @param {string} src source text to search
 * @param {string} marker text that introduces the literal
 * @param {string} end text that closes the literal
 * @returns {string} the literal's body, or '' when the marker or its braces are missing
 */
const sliceBlock = (src, marker, end) => {
  const start = src.indexOf(marker);
  if (start === -1) {
    return '';
  }
  const open = src.indexOf('{', start);
  if (open === -1) {
    return '';
  }
  const close = src.indexOf(end, open);
  return close === -1 ? '' : src.slice(open, close);
};

/**
 * Top-level keys declared in an object/interface literal body. Numeric keys
 * count — scale registries like the font-size table are keyed `1:`…`16:`.
 * @param {string} body literal body as returned by `sliceBlock`
 * @param {number} indent column at which the keys sit
 * @returns {string[]} the declared keys in source order
 */
const keysOfBlock = (body, indent) => {
  /** @type {string[]} */
  const keys = [];
  const re = new RegExp(`^ {${indent}}(?<key>[A-Za-z0-9][A-Za-z0-9]*)\\s*:`, 'gmu');
  for (const m of body.matchAll(re)) {
    keys.push(m.groups?.key ?? '');
  }
  return keys;
};

/**
 * Source files every token check scans, read once and shared.
 * @type {{ abs: string, rel: string, src: string }[] | null}
 */
let sourceFileCache = null;

/**
 * @returns {{ abs: string, rel: string, src: string }[]} every non-test source file under the scanned roots
 */
const sourceFiles = () => {
  if (sourceFileCache !== null) {
    return sourceFileCache;
  }
  /** @type {{ abs: string, rel: string, src: string }[]} */
  const files = [];
  /** @type {FileVisitor} */
  const collect = (filePath) => {
    if (/\.(?:tsx|ts|jsx|js)$/u.test(filePath) && !/\.(?:spec|test)\./u.test(filePath)) {
      files.push({
        abs: filePath,
        rel: path.relative(ROOT, filePath),
        src: readFileSync(filePath, 'utf-8'),
      });
    }
  };
  for (const dir of [PUBLIC_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, collect);
  }
  sourceFileCache = files;
  return files;
};

/**
 * 1-based line of a match offset.
 * @param {string} src source text
 * @param {number} index character offset into `src`
 * @returns {number} the 1-based line number containing `index`
 */
const lineAt = (src, index) => {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (src.codePointAt(i) === 10) {
      line += 1;
    }
  }
  return line;
};

/**
 * Offset of the `)` that closes the `(` at `open`.
 * @param {string} src source text
 * @param {number} open offset of the opening paren
 * @returns {number} offset of the matching close paren, or `src.length` when the call is unbalanced
 */
const matchingParen = (src, open) => {
  let depth = 0;
  for (let end = open; end < src.length; end += 1) {
    if (src[end] === '(') {
      depth += 1;
    } else if (src[end] === ')') {
      depth -= 1;
      if (depth === 0) {
        return end;
      }
    }
  }
  return src.length;
};

/**
 * Run one prop-literal regex over every scanned file.
 * @param {RegExp} re global regex whose matches are checked
 * @param {(match: RegExpMatchArray) => string | undefined} check returns the violation text, or undefined when valid
 * @returns {string[]} `file:line — message` for every violation
 */
const scanLiterals = (re, check) => {
  /** @type {string[]} */
  const violations = [];
  for (const { rel, src } of sourceFiles()) {
    for (const m of src.matchAll(re)) {
      const message = check(m);
      if (message !== undefined && message !== '') {
        violations.push(`${rel}:${lineAt(src, m.index ?? 0)} — ${message}`);
      }
    }
  }
  return violations;
};

/**
 * The animation vocabulary is a CLOSED set (css.ts / reactNative.ts register
 * exactly these keys). A `transition="X"` with an X outside the set is not a
 * type error — Tamagui silently ignores the unknown animation name, so the
 * element renders with NO animation. That is invisible until someone notices
 * "this doesn't animate" (e.g. DatePicker's `transition="quicker"` typo, which
 * killed the selected-date enter animation across all five pickers). Read the
 * registry from source so this check can never drift from the tokens.
 * @returns {Set<string>} the registered animation names, or an empty set when the registry source is unreadable
 */
const readAnimationTokens = () => {
  /** @type {Set<string>} */
  const tokens = new Set();
  const src = readPublicSource('theme/src/theme/animations/css.ts');
  if (!src) {
    return tokens;
  }
  // valid non-animating value
  tokens.add('none');
  for (const key of keysOfBlock(sliceBlock(src, 'animationConfig =', '} as const'), 2)) {
    tokens.add(key);
  }
  return tokens;
};

/** Flag `transition="literal"` / `transition={"literal"}` using an unregistered token. */
const checkTransitionTokens = () => {
  const valid = readAnimationTokens();
  if (!valid.size) {
    return { violations: [], valid: [], ok: false };
  }
  // Only string LITERALS directly on the prop — dynamic values (variables,
  // ternaries, knobProps.transition) resolve at runtime and are out of scope.
  const re = /\btransition=(?:"(?<quoted>[a-zA-Z0-9]+)"|\{\s*"(?<braced>[a-zA-Z0-9]+)"\s*\})/gu;
  const violations = scanLiterals(re, (m) => {
    const token = m.groups?.quoted ?? m.groups?.braced ?? '';
    return valid.has(token) ? undefined : `transition="${token}"`;
  });
  return { violations, valid: sortedCopy([...valid].filter((t) => t !== 'none')), ok: true };
};

/**
 * A gray ramp palette: only the theme NAMES and keys the builder emits matter to
 * the registry checks, not the colors.
 * @returns {{ palette: { dark: string[], light: string[] } }} a palette accepted by `createThemes`
 */
const neutralPalette = () => {
  const ramp = Array.from({ length: 14 }, (_, i) => `hsl(0, 0%, ${i * 7}%)`);
  return { palette: { dark: ramp, light: ramp } };
};

/**
 * Compose themes with the theme-builder for a base/accent/children shape.
 * @param {(options: object) => Record<string, object>} createThemes the builder's entry point
 * @param {string[]} childKeys names of the child themes to generate
 * @returns {Record<string, object> | null} the generated themes, or null when the builder throws
 */
const buildThemes = (createThemes, childKeys) => {
  const palette = neutralPalette();
  try {
    return createThemes({
      base: palette,
      childrenThemes: Object.fromEntries(childKeys.map((key) => [key, palette])),
      accent: palette,
    });
  } catch {
    // Safe to continue: a builder that rejects this shape disables the check (reported as skipped) instead of crashing the run.
    return null;
  }
};

/**
 * Every registered Tamagui theme name, plus each sub-theme SEGMENT a `theme`
 * prop may name on its own (`theme="accent"` selects `light_accent` under the
 * light scheme). Rebuilt from the same three sources `createThemesBuilder`
 * composes: the theme-builder's generated names for this base/children/accent
 * shape, the stock `@tamagui/themes` names, and the gray aliases declared in
 * createThemes.ts. Palettes are irrelevant here — only the NAMES are.
 * @returns {Set<string>} every theme name and sub-theme segment; empty when the registry cannot be read
 */
const readThemeNames = () => {
  /** @type {Set<string>} */
  const names = new Set();
  const builder = tryRequire(THEME_BUILDER);
  const stock = tryRequire(TAMAGUI_THEMES);
  const src = readPublicSource('theme/src/theme/create-themes.ts');
  if (!builder?.createThemes || !stock?.themes || !src) {
    return names;
  }
  const childKeys = keysOfBlock(sliceBlock(src, 'const childrenThemes =', '\n  };'), 4);
  const generated = buildThemes(builder.createThemes, childKeys);
  if (generated === null) {
    return new Set();
  }
  for (const name of [...Object.keys(generated), ...Object.keys(stock.themes)]) {
    names.add(name);
  }
  for (const m of sliceBlock(src, 'const grayTheme =', '\n};').matchAll(/^ {2}(?<name>[a-zA-Z][a-zA-Z0-9_]*)\s*:/gmu)) {
    names.add(m.groups?.name ?? '');
  }
  const segments = [...names].flatMap((name) => name.split('_').slice(1));
  for (const segment of segments) {
    names.add(segment);
  }
  return names;
};

/**
 * Every key resolvable as `$value` on a color-bearing prop, composed exactly
 * the way `createThemesBuilder` composes the live themes: the structural keys
 * the theme-builder generates (colorN / background0N / accentN / …), the stock
 * base themes, the Radix ramps createThemes.ts splats into `extra`, the shadow
 * slots, and the project's semantic aliases from `getBaseTheme`.
 * @returns {Set<string>} the resolvable keys; empty when the registry cannot be read
 */
const readThemeKeys = () => {
  const builder = tryRequire(THEME_BUILDER);
  const stock = tryRequire(TAMAGUI_THEMES);
  const colors = tryRequire('@tamagui/colors');
  const src = readPublicSource('theme/src/theme/create-themes.ts');
  const builderSrc = readPublicSource('theme/src/theme/defaults/builder-options.ts');
  if (!builder?.createThemes || !stock?.themes) {
    return new Set();
  }
  if (!colors || !src || !builderSrc) {
    return new Set();
  }
  const generated = buildThemes(builder.createThemes, ['warning']);
  if (generated === null) {
    return new Set();
  }
  return new Set([
    ...Object.values(generated).flatMap((theme) => Object.keys(theme)),
    ...['light', 'dark'].flatMap((name) => Object.keys(stock.themes?.[name] ?? {})),
    ...[...src.matchAll(/\.\.\.Colors\.(?<ramp>[A-Za-z0-9]+)\s*,/gu)].flatMap((m) =>
      Object.keys(colors[m.groups?.ramp ?? ''] ?? {}),
    ),
    ...keysOfBlock(sliceBlock(src, 'export interface Shadows', '\n}'), 2),
    'shadowColor',
    ...keysOfBlock(sliceBlock(builderSrc, 'function getBaseTheme', '\n}'), 4),
  ]);
};

/**
 * Font-size steps the house fonts register. The hand-mirrored
 * `interBaseSizes` table is retired — `defaults/fonts.ts` now READS its
 * size tables from `@tamagui/config/v5`'s `defaultConfig.fonts`, so this
 * registry reads the same source (the era pin is load-bearing). The source
 * parse survives as a fallback for consumer trees that still carry the
 * transcribed table.
 */
const readFontSizeSteps = () => {
  /** @type {Set<string>} */
  const steps = new Set();
  const cfg = tryRequire('@tamagui/config/v5');
  for (const font of Object.values(cfg?.defaultConfig?.fonts ?? {})) {
    // Bare keys (`1`…`16`, `true`) — checkStyleTokens compares the captured
    // token name without its `$`, same shape keysOfBlock returned.
    for (const k of Object.keys(font?.size ?? {})) {
      steps.add(k);
    }
  }
  if (steps.size) {
    return steps;
  }
  const src = readPublicSource('theme/src/theme/defaults/fonts.ts');
  if (!src) {
    return steps;
  }
  for (const k of keysOfBlock(sliceBlock(src, 'const interBaseSizes', '\n};'), 2)) {
    steps.add(k);
  }
  return steps;
};

/**
 * Every `$value` each style prop (and its shorthands) can resolve.
 * @param {{
 *   helpers: RegistryModules['@tamagui/helpers'],
 *   categories: Record<string, object>,
 *   tokens: Record<string, Record<string, unknown>>,
 *   shorthands: Record<string, string>,
 *   themeKeys: Set<string>,
 *   fontSizeSteps: Set<string>,
 * }} registries the Tamagui registries and the theme-derived key sets
 * @returns {Map<string, Set<string>>} prop name → every `$value` that resolves
 */
const resolvableByProp = ({ helpers, categories, tokens, shorthands, themeKeys, fontSizeSteps }) => {
  const spaceScale = new Set(Object.keys(tokens.space ?? {}));
  /** @type {Map<string, Set<string>>} */
  const byProp = new Map();
  // Props with a scale of their own (radius / size / zIndex / color).
  for (const [category, props] of Object.entries(categories)) {
    const resolvable = new Set([...themeKeys, ...Object.keys(tokens[category] ?? {}), ...spaceScale]);
    for (const prop of Object.keys(props)) {
      byProp.set(prop, resolvable);
    }
  }
  // Every other view style prop lands on the space fallback (padding, margin,
  // gap, inset, border widths, …) — the biggest surface by call-site count.
  const spaceResolvable = new Set([...themeKeys, ...spaceScale]);
  for (const prop of Object.keys(helpers.stylePropsAll ?? {})) {
    const isExcluded =
      byProp.has(prop) ||
      helpers.stylePropsTextOnly?.[prop] === true ||
      helpers.stylePropsTransform?.[prop] === true ||
      helpers.stylePropsUnitless?.[prop] === true;
    if (!isExcluded) {
      byProp.set(prop, spaceResolvable);
    }
  }
  byProp.set('fontSize', new Set([...themeKeys, ...fontSizeSteps]));
  // Shorthands are the same prop by another name (`bg`, `br`, `fos`, …).
  for (const [short, long] of Object.entries(shorthands)) {
    const resolvable = byProp.get(long);
    if (resolvable !== undefined) {
      byProp.set(short, resolvable);
    }
  }
  return byProp;
};

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
const checkStyleTokens = () => {
  const helpers = tryRequire('@tamagui/helpers');
  const themesPkg = tryRequire(TAMAGUI_THEMES);
  const shorthandsPkg = tryRequire('@tamagui/shorthands');
  const themeKeys = readThemeKeys();
  const fontSizeSteps = readFontSizeSteps();
  if (!helpers?.tokenCategories || !themesPkg?.tokens || !themeKeys.size || !fontSizeSteps.size) {
    return { violations: [], ok: false };
  }
  const byProp = resolvableByProp({
    helpers,
    categories: helpers.tokenCategories,
    tokens: themesPkg.tokens,
    shorthands: shorthandsPkg?.shorthands ?? {},
    themeKeys,
    fontSizeSteps,
  });
  const props = sortedCopy(byProp.keys(), (a, b) => b.length - a.length).join('|');
  const re = new RegExp(
    `\\b(?<prop>${props})=(?:"\\$(?<quoted>[A-Za-z0-9]+)"|\\{\\s*"\\$(?<braced>[A-Za-z0-9]+)"\\s*\\})`,
    'gu',
  );
  const violations = scanLiterals(re, (m) => {
    const prop = m.groups?.prop ?? '';
    const token = m.groups?.quoted ?? m.groups?.braced ?? '';
    return byProp.get(prop)?.has(token) === true ? undefined : `${prop}="$${token}"`;
  });
  return { violations, ok: true };
};

/** Flag `theme="literal"` naming a theme that was never built. */
const checkThemeNames = () => {
  const valid = readThemeNames();
  if (!valid.size) {
    return { violations: [], ok: false };
  }
  const re = /\btheme=(?:"(?<quoted>[A-Za-z][A-Za-z0-9_]*)"|\{\s*"(?<braced>[A-Za-z][A-Za-z0-9_]*)"\s*\})/gu;
  const violations = scanLiterals(re, (m) => {
    const name = m.groups?.quoted ?? m.groups?.braced ?? '';
    return valid.has(name) ? undefined : `theme="${name}"`;
  });
  return { violations, ok: true };
};

/** Intent names registered in `defaultIntents`. */
const readIntentNames = () => {
  /** @type {Set<string>} */
  const names = new Set();
  const src = readPublicSource('theme/src/theme/intents.ts');
  if (!src) {
    return names;
  }
  for (const m of sliceBlock(src, 'export const defaultIntents', '\n};').matchAll(
    /^ {2}(?<name>[a-zA-Z][a-zA-Z0-9]*)\s*:\s*\{/gmu,
  )) {
    names.add(m.groups?.name ?? '');
  }
  return names;
};

/**
 * Flag `useResolvedKnobs({ intent: "literal" })` naming an unregistered intent.
 * `UseResolvedKnobsOptions.intent` is a plain `string` (component-level intent
 * props are typed unions, this one is the open seam), and an unknown name just
 * misses `defaultIntents[intent]` — no overrides merge, so the component keeps
 * its base knobs and renders exactly as if no intent had been passed.
 */
const checkIntentTokens = () => {
  const valid = readIntentNames();
  if (!valid.size) {
    return { violations: [], valid: [], ok: false };
  }
  const call = /useResolvedKnobs\(/gu;
  const intentArg = /\bintent:\s*"(?<intent>[A-Za-z0-9]+)"/gu;
  /** @type {string[]} */
  const violations = [];
  for (const { rel, src } of sourceFiles()) {
    for (const m of src.matchAll(call)) {
      // Options object only — stop at the call's own closing paren.
      const start = m.index ?? 0;
      const end = matchingParen(src, start + m[0].length - 1);
      const args = src.slice(start + m[0].length, end);
      for (const arg of args.matchAll(intentArg)) {
        const intent = arg.groups?.intent ?? '';
        if (!valid.has(intent)) {
          violations.push(`${rel}:${lineAt(src, start)} — intent: "${intent}"`);
        }
      }
    }
  }
  return { violations, valid: sortedCopy(valid), ok: true };
};

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
const checkAnimationProps = () => {
  /** @type {string[]} */
  const legacyProp = [];
  /** @type {string[]} */
  const driverless = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!/\.(?:tsx|jsx)$/u.test(filePath)) {
      return;
    }
    if (/\.(?:spec|test|stories)\./u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    const rel = path.relative(ROOT, filePath);
    // Any `…transition`-valued animation key, so prefixed spellings like
    // `ctx.knobProps.transition` are caught too. Deliberately NOT "any value":
    // that also matches TS annotations (`animation: any`), css-in-js, and
    // unrelated config objects that have nothing to do with the tamagui prop.
    // The lookbehind keeps `data-animation={…}` (probe attributes: Spinner,
    // Pagination) out: `\b` alone matches between `-` and `animation`.
    for (const m of src.matchAll(/(?<![\w-])animation=\{|(?<![\w-])animation:\s*[\w$.[\]?]*\btransition\b/gu)) {
      const line = src.slice(0, m.index).split('\n').length;
      legacyProp.push(`${rel}:${line} — \`${m[0]}\` (tamagui 1.x prop; use \`transition\`)`);
    }
    // Element-scoped: an enter/exitStyle needs a transition on the SAME tag.
    // `=>` is allowed through: a `>` inside an arrow-function prop otherwise
    // truncates the tag and hides everything after it from this check.
    for (const tag of src.matchAll(/<[A-Z][\w.]*(?:\s(?:=>|[^>])*)?>/gsu)) {
      const [t] = tag;
      if (/\b(?:enterStyle|exitStyle)=/u.test(t) && !/\btransition(?:[=:]|Props\()/u.test(t)) {
        const line = src.slice(0, tag.index).split('\n').length;
        driverless.push(`${rel}:${line} — enter/exitStyle with no \`transition\` driver (LC-24)`);
      }
    }
  };
  for (const dir of [PUBLIC_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  return { legacyProp, driverless };
};

const checkFeaturesTwins = () => {
  /** @type {string[]} */
  const violations = [];
  for (const name of listAppNames()) {
    if (FEATURES_TWIN_EXEMPT.has(name)) {
      continue;
    }
    const twin = path.join(FEATURES_DIR, name);
    if (!existsSync(twin) || !statSync(twin).isDirectory()) {
      violations.push(`apps/${name} lacks features/${name} (app ↔ features twin required)`);
    }
  }
  return violations;
};

/**
 * @param {string} line one source line
 * @returns {boolean} true when the line is (part of) a comment
 */
const isCommentLine = (line) => {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
};

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
const checkSizeRecipeEscape = () => {
  const formsSrc = path.join(PUBLIC_DIR, 'forms', 'src');
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
  const re = /\b(?<prop>height|minHeight|paddingHorizontal|fontSize)=\{\s*(?<value>-?\d+(?:\.\d+)?)\s*\}/gu;
  /** @type {string[]} */
  const violations = [];
  walkFiles(formsSrc, (filePath) => {
    if (!/\.(?:tsx|ts)$/u.test(filePath)) {
      return;
    }
    const rel = path.relative(ROOT, filePath);
    if (/\.(?:spec|test|stories)\./u.test(rel)) {
      return;
    }
    if (rel.includes('__snapshots__')) {
      return;
    }
    if (!pilotPrefixes.some((prefix) => rel.startsWith(prefix))) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    const lines = src.split('\n');
    for (const m of src.matchAll(re)) {
      const line = lineAt(src, m.index ?? 0);
      const current = lines[line - 1] ?? '';
      const previous = lines[line - 2] ?? '';
      const window = `${previous}\n${current}\n${m[0]}`;
      const isEscaped = isCommentLine(current) || /sizeRecipeEscape|size-recipe-escape:/u.test(window);
      if (!isEscaped) {
        violations.push(`${rel}:${line} — ${m.groups?.prop}={${m.groups?.value}}`);
      }
    }
  });
  return violations;
};

const ESCAPE_REASON = String.raw`(?:"(?<dq>[^"\n]*)"|'(?<sq>[^'\n]*)'|\x60(?<bt>[^\x60$\n]*)\x60)`;
/** `sizeRecipeEscape="…"`, `sizeRecipeEscape={"…"}`, `sizeRecipeEscape: "…"`. */
const ESCAPE_PROP_RE = new RegExp(String.raw`\bsizeRecipeEscape(?:=\{?\s*|\s*:\s*)${ESCAPE_REASON}`, 'gu');
const ESCAPE_ATTR_RE = /\bsizeRecipeEscape=\{/gu;
const ESCAPE_CALL_RE = /\bsizeRecipeEscape\s*\(/gu;
const ESCAPE_COMMENT_RE = /(?<!`)(?:\/\/|\/\*)\s*size-recipe-escape:(?<rest>.*)$/u;
const ESCAPE_REASON_RE = new RegExp(ESCAPE_REASON, 'gu');

/**
 * @param {RegExpMatchArray} match a match of an escape-reason pattern
 * @returns {string} the trimmed reason from whichever quote form matched
 */
const escapeReasonOf = (match) => (match.groups?.dq ?? match.groups?.sq ?? match.groups?.bt ?? '').trim();

/**
 * `sizeRecipeEscape (` that is a call, not the declaration `function sizeRecipeEscape (`.
 * @param {string} src source text
 * @param {number} index offset of the `sizeRecipeEscape` match
 * @returns {boolean} true when the name is preceded by `function` and whitespace
 */
const isFunctionDeclarationName = (src, index) => {
  const before = src.slice(0, index);
  const trimmed = before.trimEnd();
  return trimmed !== before && trimmed.endsWith('function');
};

/**
 * @typedef {{ line: number, form: string, reason: string | undefined }} EscapeSite
 */

/**
 * @param {number} line 1-based line of a site
 * @param {string} form which spelling the site uses
 * @param {string} [reason] the written reason, absent when the code gives none readable
 * @returns {EscapeSite} the site record
 */
const escapeSite = (line, form, reason) => ({ line, form, reason });

/**
 * `sizeRecipeEscape="…"`, `sizeRecipeEscape={"…"}` and `sizeRecipeEscape: "…"` sites.
 * @param {string} src source text
 * @param {string[]} lines `src` split into lines
 * @returns {EscapeSite[]} sites whose reason is a string literal
 */
const propSites = (src, lines) => {
  /** @type {EscapeSite[]} */
  const sites = [];
  for (const m of src.matchAll(ESCAPE_PROP_RE)) {
    const line = lineAt(src, m.index ?? 0);
    if (!isCommentLine(lines[line - 1] ?? '')) {
      sites.push(escapeSite(line, 'prop', escapeReasonOf(m)));
    }
  }
  return sites;
};

/**
 * `sizeRecipeEscape={…}` props whose value is not a string literal.
 * @param {string} src source text
 * @param {string[]} lines `src` split into lines
 * @returns {EscapeSite[]} sites that carry no readable reason
 */
const attrSites = (src, lines) => {
  const literalProps = new Set([...src.matchAll(ESCAPE_PROP_RE)].map((m) => m.index ?? 0));
  /** @type {EscapeSite[]} */
  const sites = [];
  for (const m of src.matchAll(ESCAPE_ATTR_RE)) {
    const line = lineAt(src, m.index ?? 0);
    if (!literalProps.has(m.index ?? 0) && !isCommentLine(lines[line - 1] ?? '')) {
      sites.push(escapeSite(line, 'prop'));
    }
  }
  return sites;
};

/**
 * `sizeRecipeEscape(…)` calls, reason taken from the last string literal argument.
 * @param {string} src source text
 * @param {string[]} lines `src` split into lines
 * @returns {EscapeSite[]} one site per call
 */
const callSites = (src, lines) => {
  /** @type {EscapeSite[]} */
  const sites = [];
  for (const m of src.matchAll(ESCAPE_CALL_RE)) {
    const start = m.index ?? 0;
    const line = lineAt(src, start);
    if (!isFunctionDeclarationName(src, start) && !isCommentLine(lines[line - 1] ?? '')) {
      const end = matchingParen(src, start + m[0].length - 1);
      const args = src.slice(start + m[0].length, end);
      const last = [...args.matchAll(ESCAPE_REASON_RE)].at(-1);
      sites.push(escapeSite(line, 'call', last === undefined ? undefined : escapeReasonOf(last)));
    }
  }
  return sites;
};

/**
 * `// size-recipe-escape: <reason>` comments.
 * @param {string[]} lines the source split into lines
 * @returns {EscapeSite[]} one site per marker comment
 */
const commentSites = (lines) => {
  /** @type {EscapeSite[]} */
  const sites = [];
  for (const [index, text] of lines.entries()) {
    const m = text.trim().startsWith('*') ? null : ESCAPE_COMMENT_RE.exec(text);
    if (m) {
      const [reason] = (m.groups?.rest ?? '').split('*/');
      sites.push(escapeSite(index + 1, 'comment', reason.trim()));
    }
  }
  return sites;
};

/**
 * Every size-recipe escape the code writes, with the reason it gives. A call
 * with no string argument, or a JSX prop whose value is not a string literal
 * (`sizeRecipeEscape={reason}`), is returned with `reason: undefined`: the
 * registry can only match a reason it can read.
 * @param {string} src source text of one file
 * @returns {EscapeSite[]} one entry per escape site, ordered by line
 */
export const findSizeRecipeEscapes = (src) => {
  const lines = src.split('\n');
  return sortedCopy(
    [...propSites(src, lines), ...attrSites(src, lines), ...callSites(src, lines), ...commentSites(lines)],
    (a, b) => a.line - b.line,
  );
};

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
const checkUndeclaredSizeRecipeEscapes = () => {
  /** @type {ReturnType<typeof readSizeRecipeEscapeRegistry>} */
  let registry;
  try {
    registry = readSizeRecipeEscapeRegistry(path.join(ROOT, SPEC_PATH));
  } catch (error) {
    return [`size-recipe escape registry: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (!registry.present) {
    return [];
  }
  /** @type {Map<string, boolean>} */
  const declared = new Map();
  for (const { file, reason } of registry.escapes) {
    declared.set(`${file}\n${reason}`, false);
  }
  /** @type {string[]} */
  const violations = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!/\.(?:tsx|ts|jsx|js)$/u.test(filePath) || filePath.endsWith('.d.ts')) {
      return;
    }
    if (/\.(?:spec|test)\./u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    if (!src.includes('sizeRecipeEscape') && !src.includes('size-recipe-escape:')) {
      return;
    }
    const rel = path.relative(ROOT, filePath).replaceAll('\\', '/');
    for (const site of findSizeRecipeEscapes(src)) {
      const key = `${rel}\n${site.reason}`;
      if (site.reason === undefined || site.reason === '') {
        violations.push(`${rel}:${site.line} — sizeRecipeEscape with no written reason`);
      } else if (declared.has(key)) {
        declared.set(key, true);
      } else {
        violations.push(`${rel}:${site.line} — undeclared escape "${site.reason}"`);
      }
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  for (const [key, seen] of declared) {
    if (!seen) {
      const [file, reason] = key.split('\n');
      violations.push(`${file} — declared escape "${reason}" has no site in the code (stale row)`);
    }
  }
  return violations;
};

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
const checkUndeclaredHexEscapes = () => {
  /** @type {ReturnType<typeof readHexEscapeRegistry>} */
  let registry;
  try {
    registry = readHexEscapeRegistry(path.join(ROOT, SPEC_PATH));
  } catch (error) {
    return [`color-literal escape registry: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (!registry.present) {
    return [];
  }
  /** @type {Map<string, boolean>} */
  const declared = new Map();
  for (const { file, reason } of registry.escapes) {
    declared.set(`${file}\n${reason}`, false);
  }
  /** @type {string[]} */
  const violations = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!/\.(?:tsx|ts|jsx|js)$/u.test(filePath) || filePath.endsWith('.d.ts')) {
      return;
    }
    if (/\.(?:spec|test)\./u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    const rel = path.relative(ROOT, filePath).replaceAll('\\', '/');
    for (const site of findHexEscapes(src)) {
      const key = `${rel}\n${site.reason}`;
      if (!site.reason) {
        violations.push(`${rel}:${site.line} — hex-escape with no written reason`);
      } else if (declared.has(key)) {
        declared.set(key, true);
      } else {
        violations.push(`${rel}:${site.line} — undeclared escape "${site.reason}"`);
      }
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  for (const [key, seen] of declared) {
    if (!seen) {
      const [file, reason] = key.split('\n');
      violations.push(`${file} — declared escape "${reason}" has no comment in the code (stale row)`);
    }
  }
  return violations;
};

// ── Story file shape ──────────────────────────────────────────────────────

const STORY_FILE_RE = /\.(?:stories|story)\.(?:js|jsx|mjs|ts|tsx)$/u;

/**
 * Names exported through `export { a, b as c }` statements.
 * @param {string} src source text of a story file
 * @returns {Set<string>} the exported names, aliases resolved
 */
const braceExportNames = (src) => {
  /** @type {Set<string>} */
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\{(?<body>[^}]*)\}/gmu)) {
    for (const item of (m.groups?.body ?? '').split(',')) {
      const parts = splitAlias(item);
      const name = parts[1] ?? parts[0] ?? '';
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
};

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
const checkStoryFileIndexability = () => {
  /** @type {string[]} */
  const violations = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!STORY_FILE_RE.test(filePath)) {
      return;
    }
    const rel = path.relative(ROOT, filePath);
    const src = readFileSync(filePath, 'utf-8');
    const braced = braceExportNames(src);
    const namedMeta =
      /^export\s+(?:const|let|var|function|class)\s+meta\b/mu.exec(src) ??
      (braced.has('meta') ? /^export\s*\{[^}]*\bmeta\b[^}]*\}/mu.exec(src) : null);
    const hasDefault = /^export\s+default\b/mu.test(src) || braced.has('default');
    const isFactory = /^export\s+(?:const|let|var)\s+meta\b[^=\n]*=\s*[\w$.]+\.meta\s*\(/mu.test(src);
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
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  return violations;
};

/**
 * A `// mpo-drawing` pragma is not itself an exemption. The file
 * must also be a DRAWING member in the spec table. Missing spec → skip
 * (shc can run the oxlint rules before it copies the table).
 */
const checkUndeclaredDrawings = () => {
  const specPath = path.join(ROOT, SPEC_PATH);
  /** @type {ReturnType<typeof readDrawingRegistry>} */
  let registry;
  try {
    registry = readDrawingRegistry(specPath);
  } catch (error) {
    return {
      violations: [`drawing registry: ${error instanceof Error ? error.message : String(error)}`],
      ok: false,
    };
  }
  if (!registry.present) {
    return { violations: [], ok: true };
  }
  /** @type {string[]} */
  const violations = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!/\.(?:tsx|ts|jsx|js)$/u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    if (!DRAWING_PRAGMA.test(src)) {
      return;
    }
    const rel = path.relative(ROOT, filePath);
    if (isDrawingFile(rel, registry.files) || isDrawingFile(filePath, registry.files)) {
      return;
    }
    violations.push(`${rel} — // mpo-drawing without a DRAWING Members row in ## Drawing files`);
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  return { violations, ok: true };
};

/**
 * @param {string} file path of a tsconfig.json
 * @returns {string | null} the violation text, or null when the file is fine
 */
const tsconfigShadowViolation = (file) => {
  const src = readFileSync(file, 'utf-8');
  // Whole-line comments only: a `//` inside a string (the $schema URL) must
  // survive, and these files are JSONC, not JSON5.
  const stripped = src.replaceAll(/^[ \t]*\/\/.*$/gmu, '');
  const doc = parseJsonObject(stripped);
  const paths = objectField(objectField(doc, 'compilerOptions'), 'paths');
  if (paths === null) {
    return null;
  }
  const extendsField = doc?.extends;
  const extendsBase = Array.isArray(extendsField)
    ? extendsField.some((e) => isString(e) && e.includes('tsconfig.base'))
    : isString(extendsField) && extendsField.includes('tsconfig.base');
  if (!extendsBase) {
    return null;
  }
  const decl = /^[ \t]*"paths"\s*:/mu.exec(src);
  const index = decl?.index ?? 0;
  const before = src.slice(0, index);
  if (before.split('\n').slice(-3).join('\n').includes('workspace-paths-escape:')) {
    return null;
  }
  return `${path.relative(ROOT, file)}:${lineAt(src, index)} — declares \`compilerOptions.paths\` (${Object.keys(paths).join(', ')}) while extending tsconfig.base`;
};

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
const checkTsconfigWorkspacePaths = () => {
  /** @type {string[]} */
  const files = [];
  const featuresTsconfig = path.join(FEATURES_DIR, 'tsconfig.json');
  if (existsSync(featuresTsconfig)) {
    files.push(featuresTsconfig);
  }
  for (const dir of [APPS_DIR, PACKAGES_DIR, PUBLIC_DIR]) {
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const candidate = path.join(dir, entry.name, 'tsconfig.json');
        if (entry.isDirectory() && existsSync(candidate)) {
          files.push(candidate);
        }
      }
    }
  }
  return files.flatMap((file) => tsconfigShadowViolation(file) ?? []);
};

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
 * @param {unknown} target one exports-map entry: a path, a condition object, or an array of either
 * @param {Set<string>} conditions condition names Metro matches for the platform
 * @returns {string | null} the chosen path, or null when no condition matches
 */
const metroExportTarget = (target, conditions) => {
  if (isString(target)) {
    return target;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      const hit = metroExportTarget(item, conditions);
      if (hit !== null && hit !== '') {
        return hit;
      }
    }
    return null;
  }
  if (!isRecord(target)) {
    return null;
  }
  for (const [key, value] of Object.entries(target)) {
    if (conditions.has(key)) {
      const hit = metroExportTarget(value, conditions);
      if (hit !== null && hit !== '') {
        return hit;
      }
    }
  }
  return null;
};

/**
 * @param {unknown} target one exports-map entry
 * @returns {boolean} true when any condition in the entry is `source`
 */
const declaresSourceCondition = (target) => {
  if (Array.isArray(target)) {
    return target.some(declaresSourceCondition);
  }
  if (!isRecord(target)) {
    return false;
  }
  return Object.entries(target).some(([key, value]) => key === 'source' || declaresSourceCondition(value));
};

/**
 * @param {string} pkgRoot absolute path of the package directory
 * @param {string} subpath an exports key such as `./seam`
 * @returns {boolean} true when Metro's file lookup finds something at the subpath
 */
const hasMetroFallback = (pkgRoot, subpath) => {
  const base = path.join(pkgRoot, subpath.replace(/^\.\//u, ''));
  if (METRO_FALLBACK_EXTS.some((ext) => existsSync(`${base}.${ext}`))) {
    return true;
  }
  if (existsSync(path.join(base, PACKAGE_JSON))) {
    return true;
  }
  return METRO_FALLBACK_EXTS.some((ext) => existsSync(path.join(base, `index.${ext}`)));
};

/**
 * @param {string} pkgRoot absolute path of one package directory
 * @returns {string[]} one violation per unbuilt Metro subpath export
 */
const metroViolationsForPackage = (pkgRoot) => {
  const pkgJsonPath = path.join(pkgRoot, PACKAGE_JSON);
  const pkg = existsSync(pkgJsonPath) ? parseJsonObject(readFileSync(pkgJsonPath, 'utf-8')) : null;
  const exportsMap = objectField(pkg, 'exports');
  if (pkg === null || exportsMap === null) {
    return [];
  }
  const packageFromSource =
    isString(pkg.source) ||
    (isString(pkg.main) && /^(?:\.\/)?src\//u.test(pkg.main)) ||
    declaresSourceCondition(exportsMap['.']);
  /** @type {string[]} */
  const violations = [];
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const isExactSubpath = subpath.startsWith('./') && !subpath.includes('*');
    const isSourceConsumed = packageFromSource || declaresSourceCondition(target);
    if (isExactSubpath && isSourceConsumed && !hasMetroFallback(pkgRoot, subpath)) {
      const unbuilt = Object.entries(METRO_PLATFORM_CONDITIONS)
        .map(([platform, conditions]) => ({ platform, resolved: metroExportTarget(target, conditions) }))
        .find(({ resolved }) => resolved?.startsWith('./dist/') === true);
      if (unbuilt !== undefined) {
        const fallbackFile = path.relative(ROOT, path.join(pkgRoot, `${subpath.replace(/^\.\//u, '')}.ts`));
        violations.push(
          `${path.relative(ROOT, pkgJsonPath)} — "${subpath}" resolves to ${unbuilt.resolved} on ${unbuilt.platform}, which is unbuilt; add ${fallbackFile} re-exporting the source entry`,
        );
      }
    }
  }
  return violations;
};

/**
 * Metro subpath fallback.
 *
 * Metro reads the exports map, picks the first condition it recognizes, and
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
const checkMetroSubpathFallbacks = () => {
  /** @type {string[]} */
  const violations = [];
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR]) {
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          violations.push(...metroViolationsForPackage(path.join(dir, entry.name)));
        }
      }
    }
  }
  return violations;
};

/**
 * react-native-web's export list, read from the copy installed under ROOT.
 *
 * `dist/index.js` is the file the web target evaluates — it is RNW's `module`
 * entry and what the storybook alias resolves `react-native` to — so its
 * `export { … }` clauses ARE the vocabulary. Reading them is what keeps this
 * check from drifting when RNW is upgraded; a hand-kept list would go stale
 * the first time upstream adds or drops an export.
 *
 * @returns {Set<string> | null} null when RNW is not installed, which
 * disables the check rather than failing a partial install.
 */
const readReactNativeWebExports = () => {
  const entry = path.join(ROOT, 'node_modules', 'react-native-web', 'dist', 'index.js');
  if (!existsSync(entry)) {
    return null;
  }
  /** @type {Set<string>} */
  const names = new Set();
  for (const clause of readFileSync(entry, 'utf-8').matchAll(/export\s*\{(?<body>[^}]*)\}/gu)) {
    for (const specifier of (clause.groups?.body ?? '').split(',')) {
      const name = splitAlias(specifier).at(-1);
      if (name !== undefined && name !== '') {
        names.add(name);
      }
    }
  }
  return names.size > 0 ? names : null;
};

/** Platform-suffixed files the web resolver never reaches. */
const NATIVE_ONLY_FILE_RE = /\.(?:native|ios|android)\.(?:tsx|ts|jsx|js)$/u;

/**
 * `import … from "react-native"`, including the multi-line brace form.
 *
 * The body may contain no quote and no `;`, which is what stops the non-greedy
 * match from swallowing an earlier `import … from "react"` and attributing
 * ITS names to react-native.
 */
// oxlint-disable-next-line sonarjs/super-linear-regex -- the lazy clause must skip a `from` inside a specifier name (`{ fromX }`); its input is one import statement, which cannot contain `;` or a quote
const REACT_NATIVE_IMPORT_RE = /import\s+(?<clause>[^;'"]*?)from\s*["']react-native["']/gu;

/**
 * @param {string} absPath absolute path of a file
 * @param {string} dir absolute path of a directory
 * @returns {boolean} true when the file lives below the directory
 */
const isUnder = (absPath, dir) => {
  const rel = path.relative(dir, absPath);
  return rel !== '' && !rel.startsWith('..');
};

/**
 * The non-type specifiers of the `{ … }` group of an import clause.
 * No brace group means a default or `* as ns` import, and a namespace
 * read of a missing name is `undefined`, never a SyntaxError; a
 * type-only import clause is erased before any bundler sees it.
 * @param {string} clause the text between `import` and `from`
 * @returns {string[]} trimmed specifier texts such as `Foo` or `Foo as Bar`
 */
const namedImportSpecifiers = (clause) => {
  if (/^type\b/u.test(clause)) {
    return [];
  }
  const open = clause.indexOf('{');
  const close = clause.lastIndexOf('}');
  if (open === -1 || close < open) {
    return [];
  }
  return clause
    .slice(open + 1, close)
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((entry) => entry !== '' && !/^type\b/u.test(entry));
};

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
const checkReactNativeWebExports = () => {
  const exported = readReactNativeWebExports();
  if (exported === null) {
    return { ok: false, violations: [] };
  }
  /** @type {string[]} */
  const violations = [];
  const webResolved = sourceFiles().filter(
    ({ abs, src }) =>
      (isUnder(abs, PUBLIC_DIR) || isUnder(abs, FEATURES_DIR)) &&
      !NATIVE_ONLY_FILE_RE.test(abs) &&
      src.includes('react-native'),
  );
  for (const { rel, src } of webResolved) {
    for (const statement of src.matchAll(REACT_NATIVE_IMPORT_RE)) {
      for (const entry of namedImportSpecifiers((statement.groups?.clause ?? '').trim())) {
        const [name] = splitAlias(entry);
        if (name && !exported.has(name)) {
          violations.push(
            `${rel}:${lineAt(src, statement.index ?? 0)} — ${name} (react-native-web exports no ${name})`,
          );
        }
      }
    }
  }
  return { ok: true, violations };
};

/**
 * @param {string} src source text
 * @param {number} from offset of the `//`
 * @returns {number} offset of the line's newline, or the end of `src`
 */
const skipLineComment = (src, from) => {
  let i = from;
  while (i < src.length && src[i] !== '\n') {
    i += 1;
  }
  return i;
};

/**
 * @param {string} src source text
 * @param {number} from offset of the `/*`
 * @returns {number} offset just past the closing star-slash
 */
const skipBlockComment = (src, from) => {
  let i = from + 2;
  while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
    i += 1;
  }
  return i + 2;
};

/**
 * @param {string} src source text
 * @param {number} from offset of the opening quote
 * @returns {number} offset just past the closing quote
 */
const skipString = (src, from) => {
  const quote = src[from];
  let i = from + 1;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
    } else if (src[i] === quote) {
      return i + 1;
    } else {
      i += 1;
    }
  }
  return i;
};

/**
 * Offsets in `src` that are live CODE — not inside a comment, a string or a
 * template literal. One left-to-right pass. Regex literals are treated as
 * code, and a `${…}` interpolation is treated as string, which can only ever
 * make this check miss something, never invent a violation.
 *
 * @param {string} src source text
 * @returns {Uint8Array} 1 at every code offset
 */
const codeOffsets = (src) => {
  const mask = new Uint8Array(src.length);
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    const next = src[i + 1];
    if (char === '/' && next === '/') {
      i = skipLineComment(src, i);
    } else if (char === '/' && next === '*') {
      i = skipBlockComment(src, i);
    } else if (char === '"' || char === "'" || char === '`') {
      i = skipString(src, i);
    } else {
      mask[i] = 1;
      i += 1;
    }
  }
  return mask;
};

const IMPORT_META_RE = /\bimport\s*\.\s*meta\b/gu;
const IMPORT_META_SCANNED_RE = /\.(?:tsx|ts|jsx|js|mjs|cjs|mts|cts)$/u;

/**
 * A VALUE import of a node: builtin. `import type { … } from "node:fs"` is
 * erased, so it proves nothing about where the file runs and does not count.
 */
const NODE_BUILTIN_IMPORT_RE =
  // oxlint-disable-next-line sonarjs/super-linear-regex -- unanchored prefix scan over one file; `[^;'"]*` stops at the statement end and a rewrite would change which imports count
  /(?:^|\n)\s*import\s+(?!type\s)[^;'"]*from\s*["']node:[^"']+["']|require\(\s*["']node:[^"']+["']\s*\)|import\(\s*["']node:[^"']+["']\s*\)/u;

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
 * try/catch (packages/platform/src/config/runtime-config.ts), or, for an SSR
 * flag, `isServer` from @repo/platform, which is split at the
 * FILE level rather than by a bundler define.
 *
 * Exempt, by construction rather than by allowlist: a file that imports a
 * `node:` builtin as a value is Node-only build tooling
 * (@repo/config's vite/vitest configs, the CLI, @repo/utils/dev) and could
 * not run in a browser or on Hermes whatever it did with import.meta. Specs are exempt for the same reason —
 * vitest runs them in Node and provides `import.meta.env` itself.
 */
const checkImportMetaInPublicSource = () => {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(PUBLIC_DIR)) {
    return violations;
  }
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!IMPORT_META_SCANNED_RE.test(filePath)) {
      return;
    }
    if (/\.(?:spec|test)\./u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    if (!IMPORT_META_RE.test(src)) {
      IMPORT_META_RE.lastIndex = 0;
      return;
    }
    IMPORT_META_RE.lastIndex = 0;
    if (NODE_BUILTIN_IMPORT_RE.test(src)) {
      return;
    }
    const mask = codeOffsets(src);
    for (const match of src.matchAll(IMPORT_META_RE)) {
      const index = match.index ?? 0;
      if (mask[index] === 1) {
        violations.push(`${path.relative(ROOT, filePath)}:${lineAt(src, index)}`);
      }
    }
  };
  for (const pkg of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (pkg.isDirectory() && !pkg.name.startsWith('.') && pkg.name !== 'node_modules') {
      walkFiles(path.join(PUBLIC_DIR, pkg.name, 'src'), scan);
    }
  }
  return violations;
};

// ── React Flow selectors outside the token bridge ─────────────────────────

const REACT_FLOW_SELECTOR_RE = /\.react-flow__[\w-]+/gu;
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
const REACT_FLOW_SCANNED_RE = /\.(?:tsx|ts|jsx|js|mjs|cjs|css)$/u;

/**
 * Offsets that are NOT inside a comment.
 *
 * `codeOffsets` masks strings as well, which is the opposite of what this needs:
 * a hand-written React Flow rule lives in a template literal or a `className`,
 * so strings are exactly the interesting part. Comments are not — the map's own
 * allowlist explains itself by naming `.react-flow__node-input`, and that
 * explanation must not be the thing that fails the build.
 * @param {string} src source text
 * @returns {Uint8Array} 1 at every offset outside a comment
 */
const nonCommentOffsets = (src) => {
  const mask = new Uint8Array(src.length).fill(1);
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      const end = skipLineComment(src, i);
      mask.fill(0, i, end);
      i = end;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      let end = i;
      while (end < src.length && !(src[end] === '*' && src[end + 1] === '/')) {
        end += 1;
      }
      mask.fill(0, i, end + 2);
      i = end + 2;
    } else {
      i += 1;
    }
  }
  return mask;
};

/**
 * A `.react-flow__` selector under packages/<pkg>/src, outside the one
 * file that owns the mapping.
 */
const checkGraphVarsCoverage = () => {
  /** @type {string[]} */
  const violations = [];
  if (!existsSync(PUBLIC_DIR)) {
    return violations;
  }
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!REACT_FLOW_SCANNED_RE.test(filePath)) {
      return;
    }
    const posix = filePath.replaceAll('\\', '/');
    if (GRAPH_VARS_EXEMPT.some((exempt) => posix.endsWith(exempt))) {
      return;
    }
    // Specs are exempt for the reason check 10 exempts them: a spec that
    // asserts WHICH classes a variable binds to has to name those classes,
    // and it ships no paint. Nothing else is exempt, including stories.
    if (/\.(?:spec|test)\./u.test(filePath)) {
      return;
    }
    const src = readFileSync(filePath, 'utf-8');
    if (!src.includes('.react-flow__')) {
      return;
    }
    const mask = nonCommentOffsets(src);
    for (const match of src.matchAll(REACT_FLOW_SELECTOR_RE)) {
      const index = match.index ?? 0;
      if (mask[index] === 1) {
        violations.push(`${path.relative(ROOT, filePath)}:${lineAt(src, index)} — ${match[0]}`);
      }
    }
  };
  for (const pkg of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (pkg.isDirectory() && !pkg.name.startsWith('.') && pkg.name !== 'node_modules') {
      walkFiles(path.join(PUBLIC_DIR, pkg.name, 'src'), scan);
    }
  }
  return violations;
};

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
const STORY_HONESTY_MARKER_RE = /\bforeignContrastSpecimen\s*:\s*true\b/u;

// oxlint-disable-next-line sonarjs/super-linear-regex -- the lazy clause must skip a `from` inside a specifier name (`{ fromX }`); its input is one import statement, which cannot contain `;` or a quote
const TAMAGUI_IMPORT_RE = /import\s+(?<clause>[^;'"]*?)from\s*["']tamagui["']/gu;

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
const checkStoryForeignControls = () => {
  /** @type {string[]} */
  const violations = [];
  /** @type {FileVisitor} */
  const scan = (filePath) => {
    if (!STORY_FILE_RE.test(filePath)) {
      return;
    }
    const rel = path.relative(ROOT, filePath).replaceAll('\\', '/');
    const src = readFileSync(filePath, 'utf-8');
    if (!src.includes('tamagui')) {
      return;
    }
    /** @type {{ imported: string, alias: string, line: number }[]} */
    const controls = [];
    for (const statement of src.matchAll(TAMAGUI_IMPORT_RE)) {
      for (const entry of namedImportSpecifiers((statement.groups?.clause ?? '').trim())) {
        const [imported, alias] = splitAlias(entry);
        if (STORY_FOREIGN_CONTROL_PRIMITIVES.has(imported)) {
          controls.push({
            imported,
            alias: alias === undefined || alias === '' ? imported : alias,
            line: lineAt(src, statement.index ?? 0),
          });
        }
      }
    }
    if (!controls.length || STORY_HONESTY_MARKER_RE.test(src)) {
      return;
    }
    for (const { imported, alias, line } of controls) {
      const shown = alias === imported ? imported : `${imported} as ${alias}`;
      violations.push(
        `${rel}:${line} — \`${shown}\` from "tamagui" with no \`parameters.foreignContrastSpecimen: true\``,
      );
    }
  };
  for (const dir of [PUBLIC_DIR, PACKAGES_DIR, APPS_DIR, FEATURES_DIR]) {
    walkFiles(dir, scan);
  }
  return violations;
};

/**
 * Print one convention's violations under its explanation.
 * @param {string} message why the convention exists and how to comply
 * @param {string[]} violations one line per offending site
 * @returns {boolean} true when there was anything to report
 */
const reportViolations = (message, violations) => {
  if (violations.length === 0) {
    return false;
  }
  console.error(message);
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  console.error('');
  return true;
};

/**
 * Point every module-level root at a consumer tree and drop the caches built from the previous one.
 * @param {ConventionRoots} [roots] directory overrides; each defaults to its conventional place under `root`
 */
const applyRoots = (roots) => {
  const resolved = resolveRoots(roots);
  ROOT = resolved.root;
  APPS_DIR = resolved.apps;
  FEATURES_DIR = resolved.features;
  PUBLIC_DIR = resolved.public;
  PACKAGES_DIR = resolved.packages;
  sourceFileCache = null;
  requireFromRoot = createRequire(path.join(ROOT, PACKAGE_JSON));
};

/**
 * Run structural convention checks over a consumer tree.
 *
 * @param {RunConventionChecksOptions} [options] directory overrides for the consumer tree
 * @returns {number} 0 when clean, 1 when any check failed
 */
export const runConventionChecks = (options = {}) => {
  applyRoots(options.roots);
  const css = checkCssInApps();
  const twins = checkFeaturesTwins();
  const sizeRecipeEscape = checkSizeRecipeEscape();
  const undeclaredEscapes = checkUndeclaredSizeRecipeEscapes();
  const undeclaredHexEscapes = checkUndeclaredHexEscapes();
  const storyIndexing = checkStoryFileIndexability();
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
  const failed = [
    reportViolations(
      'Convention: `animation` is the tamagui 1.x prop — on 2.x it is silently dropped (no animation at all). Use `transition`.\n',
      animProps.legacyProp,
    ),
    reportViolations(
      'Convention (LC-24): enterStyle/exitStyle without a `transition` on the same element never interpolates — the styles are dead code.\n',
      animProps.driverless,
    ),
    reportViolations('Convention: .css files are banned under apps/*\n', css),
    reportViolations('Convention: each product app must have a features/<name> twin\n', twins),
    reportViolations(
      "Convention (SIZE-RECIPE ESCAPE): control chrome (height / minHeight / paddingHorizontal / fontSize) must come from the size recipe, not a numeric literal. Escape with `sizeRecipeEscape` or `// size-recipe-escape: <reason>` on the previous line or same statement, and declare the reason in the spec's `## Size-recipe escapes` table. Pilot: Button/, InputParts/, fields/Select/.\n",
      sizeRecipeEscape,
    ),
    reportViolations(
      'Convention (SIZE-RECIPE ESCAPE REGISTRY): every sizeRecipeEscape site must be a row in docs/theme-propagation-spec.md `## Size-recipe escapes`, by file and by the exact reason the code writes. The table is the allowlist; writing another escape cannot widen it. A row whose site is gone fails too.\n',
      undeclaredEscapes,
    ),
    reportViolations(
      'Convention (COLOR-LITERAL ESCAPE REGISTRY): a `hex-escape: <reason>` comment exempts its file from mpo-conventions/no-hex-literals, so every one must be a row in docs/theme-propagation-spec.md `## Colour-literal escapes`, by file and by the exact reason the comment writes. Reach for a theme token first; the escape is for surfaces no token reaches. A row whose comment is gone fails too.\n',
      undeclaredHexEscapes,
    ),
    reportViolations(
      'Convention (STORY FILE SHAPE): a story file must be classic CSF (`export default meta`, no named `meta` export) or a CSF factory (`export const meta = preview.meta(...)`). Anything else makes Storybook\'s indexer fail the WHOLE gallery with "CSF: missing default export", and no package build ever sees it.\n',
      storyIndexing,
    ),
    reportViolations(
      'Convention (FOREIGN CONTROL SPECIMEN): a story composes catalog components. A raw control primitive imported from "tamagui" (Input, Button, Checkbox, Switch, Slider, Select, RadioGroup, ToggleGroup, Progress, TextArea) consumes no knobs, so a knob sweep that trusts the story scores the primitive and marks the component checked. Mount the house control from @repo/forms (inside a layout: `<Input><Input.Box><Input.Area /></Input.Box></Input>`), or, when the raw primitive is there on purpose to show the contrast, label that story `parameters: { foreignContrastSpecimen: true }` so the probes skip it. Layout and text primitives (XStack, YStack, Paragraph, Text) are out of scope.\n',
      storyForeignControls,
    ),
    reportViolations(
      'Convention (DRAWING REGISTRY): `// mpo-drawing` is only legal on a file listed as a DRAWING member in docs/theme-propagation-spec.md. Adding an undeclared drawing file still fails.\n',
      undeclaredDrawings.violations,
    ),
    reportViolations(
      "Convention (WORKSPACE PATHS SHADOW): `compilerOptions.paths` REPLACES the map tsconfig.base.json inherits from tamagui-workspace-paths.generated.json, so one local entry hides every `@repo/*` mapping from that program. Declare the alias in the target package's `exports` (the generator reads it) instead. Escape with `// workspace-paths-escape: <reason>` above the key.\n",
      tsconfigPaths,
    ),
    reportViolations(
      'Convention (METRO SUBPATH FALLBACK): a subpath export in a source-consumed package must have a `<pkg>/<subpath>.ts` file re-exporting its source entry. Metro resolves the exports map to dist/, finds nothing (public/ is never built), and falls back to a FILE lookup at that path — it never reconsiders `source`, so the first import of the subpath fails the whole bundle. A genuinely built package carries no `source` condition and is skipped.\n',
      metroFallbacks,
    ),
    reportViolations(
      'Convention (REACT-NATIVE-WEB EXPORT): a NAMED import from "react-native" must name something react-native-web exports. Every web build aliases react-native to react-native-web, so a name it does not export is a module-evaluation SyntaxError that takes the WHOLE bundle down — every story in the gallery, not just the importing component — and a Platform.OS guard cannot help, because the import fails before any code runs. Read it off a namespace import (`import * as ReactNative from "react-native"`) or move the call into a .native.tsx sibling. `import type { … }` is erased and never counts.\n',
      rnWebExports.violations,
    ),
    reportViolations(
      "Convention (GRAPH VARS COVERAGE): a `.react-flow__` selector belongs in the token bridge, nowhere else. React Flow reads every paint through `var(--xy-thing, var(--xy-thing-default))`, so the whole surface is settable without touching its stylesheet; a rule written anywhere else wins or loses on specificity instead of on the knob, and the next @xyflow/react upgrade silently changes which. Set the variable in `theme/graphVars.ts`, or put the rule in the package's own `css/` tree (outside `src`) where a reviewer reads it whole. A DOM LOOKUP is the one other legitimate use, and it belongs in `react-flow/xy.ts` beside the rest of the @xyflow contract. A mention inside a comment is fine and is not flagged.\n",
      graphVars,
    ),
    reportViolations(
      "Convention (NO import.meta IN public/*/src): `import.meta` is legal only in an ES module. In a CLASSIC script it is a PARSE-time SyntaxError, so no `typeof import.meta` guard and no try/catch around it ever runs — the file never parses and takes its consumers with it, silently. Two bundles execute mpo as a classic script: the vxrn/rolldown native bundle for Hermes, and any Metro bundle for platform=web, which is what an Expo DOM component (`'use dom'`) is. Read a static `process.env.<KEY>` member expression inside try/catch instead (public/platform/src/config/runtime-config.ts), or take an SSR flag from `isServer` in @repo/platform. A .web.ts twin is not an escape — One's web build and tamagui-build resolve it like Metro. Node-only build tooling (a file importing a `node:` builtin) and specs are exempt.\n",
      importMeta,
    ),
    reportViolations(
      `Convention: transition="…" must use a registered animation token (${tokens.valid.join(', ')}, or "none"). An unknown token silently disables the animation.\n`,
      tokens.violations,
    ),
    reportViolations(
      "Convention: a `$token` style literal must resolve — as a theme key ($color11, $borderColor, $accentBackground, a Radix ramp step), as a token in the prop's own scale (radius/size/zIndex/color), or as a space token. None of those matched, so Tamagui drops the prop and the style never applies.\n",
      styleTokens.violations,
    ),
    reportViolations(
      'Convention: theme="…" must name a built theme or sub-theme (a scheme like light/dark, a hue like blue/red/green, a semantic child like error/warning/success, accent, or a state like active/alt1/alt2). An unbuilt name silently inherits the PARENT theme, so the element renders untinted.\n',
      themeNames.violations,
    ),
    reportViolations(
      `Convention: useResolvedKnobs({ intent }) must name a registered intent (${intents.valid.join(', ')}). An unknown name merges no overrides, so the component silently renders with its base knobs.\n`,
      intents.violations,
    ),
  ].includes(true);

  for (const { name, ok } of [
    { name: 'animation token', ok: tokens.ok },
    { name: 'style token', ok: styleTokens.ok },
    { name: 'theme name', ok: themeNames.ok },
    { name: 'intent', ok: intents.ok },
    { name: 'react-native-web export', ok: rnWebExports.ok },
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
};

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(runConventionChecks());
}
