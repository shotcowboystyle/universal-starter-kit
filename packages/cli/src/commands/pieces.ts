import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { INIT_APP_PIECES, cliRoot, isInitAppPiece } from './provenance';
import type { InitAppPiece } from './provenance';

export { INIT_APP_PIECES } from './provenance';
export type { InitAppPiece } from './provenance';

const PIECE_DESCRIPTIONS: Record<InitAppPiece, string> = {
  keycloak: 'Keycloak auth wiring (env keys, provider, docker compose + realm)',
  tauri: 'Tauri desktop target (src-tauri skeleton — webview shell, Rust toolchain)',
  webext: 'Browser extension target (MV3 popup + background)',
};

export const piecesRoot = (): string => path.join(cliRoot(), 'templates/pieces');

interface TemplateVars {
  NAME: string;
  NAME_PASCAL: string;
  /** Lowercase alphanumeric form for iOS bundle ids / Android packages. */
  NAME_APPID: string;
  MPO_VERSION: string;
  YEAR: string;
}

const toPascalCase = (name: string): string =>
  name
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/**
 * Fragment source dirs for a piece: shared/ plus universal/ (the layout
 * adopted repos follow: apps/<name>/...). A piece is available when at least
 * one of the two exists.
 */
const pieceFragmentDirs = (piece: InitAppPiece, root: string): string[] =>
  [path.join(root, piece, 'shared'), path.join(root, piece, 'universal')].filter((dir) => existsSync(dir));

/**
 * npm always strips .gitignore / .npmrc (and newer npms .env*) from published
 * tarballs, so the template stores them without the leading dot; restore it
 * at scaffold time.
 */
const DOTFILE_NAMES = new Map([
  ['gitignore', '.gitignore'],
  ['npmrc', '.npmrc'],
  ['env.example', '.env.example'],
]);

const restoreDotfile = (name: string): string => DOTFILE_NAMES.get(name) ?? name;

const render = (content: string, vars: TemplateVars): string =>
  content
    .replaceAll('__NAME_PASCAL__', vars.NAME_PASCAL)
    .replaceAll('__NAME_APPID__', vars.NAME_APPID)
    .replaceAll('__NAME__', vars.NAME)
    .replaceAll('__MPO_VERSION__', vars.MPO_VERSION)
    .replaceAll('__YEAR__', vars.YEAR);

/** Assets copied byte-for-byte; the utf-8 render pass would corrupt them. */
const BINARY_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.ico', '.icns']);

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Deep-merge for JSON partials: objects merge recursively (fragment keys
 * append after base keys, so e.g. package.json script order stays stable),
 * arrays union (base order first), scalars/type-mismatches take the
 * fragment value.
 */
export const mergeJsonValues = (base: JsonValue, fragment: JsonValue): JsonValue => {
  if (Array.isArray(base) && Array.isArray(fragment)) {
    const merged = [...base];
    const seen = new Set(base.map((item) => JSON.stringify(item)));
    for (const item of fragment) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
    return merged;
  }
  if (isJsonObject(base) && isJsonObject(fragment)) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(fragment)) {
      merged[key] = key in merged ? mergeJsonValues(merged[key], value) : value;
    }
    return merged;
  }
  return fragment;
};

/** Code-unit order (not locale order), so the bytes do not depend on the machine's locale. */
const compareCodeUnits = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};

/**
 * JSON.parse only ever yields JSON values; this is the one place that states it.
 */
export const parseJson = (text: string): JsonValue =>
  // SAFETY: JSON.parse returns string | number | boolean | null | arrays and plain objects of those, which is exactly JsonValue
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse is typed `any`; its output is JsonValue by spec
  JSON.parse(text) as JsonValue;

const trimTrailingNewlines = (text: string): string => {
  let end = text.length;
  while (end > 0 && text[end - 1] === '\n') {
    end -= 1;
  }
  return text.slice(0, end);
};

const SORTED_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** Dependency maps stay sorted after fragment merges so overlay order never changes the bytes. */
const sortDependencyFields = (value: JsonValue): JsonValue => {
  if (!isJsonObject(value)) {
    return value;
  }
  const result = { ...value };
  for (const field of SORTED_DEPENDENCY_FIELDS) {
    const deps = result[field];
    if (!isJsonObject(deps)) {
      continue;
    }
    result[field] = Object.fromEntries(Object.entries(deps).toSorted(([a], [b]) => compareCodeUnits(a, b)));
  }
  return result;
};

/**
 * Apply a rendered `<target>.partial` fragment onto the target file:
 *   - `.json` targets deep-merge (see mergeJsonValues)
 *   - everything else appends as a text block separated by a blank line
 * Missing targets are created from the fragment alone.
 */
const applyPartial = (targetPath: string, renderedFragment: string): void => {
  if (targetPath.endsWith('.json')) {
    const fragment = parseJson(renderedFragment);
    const base = existsSync(targetPath) ? parseJson(readFileSync(targetPath, 'utf-8')) : undefined;
    const merged = sortDependencyFields(base === undefined ? fragment : mergeJsonValues(base, fragment));
    writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
    return;
  }
  const block = `${trimTrailingNewlines(renderedFragment.replace(/^\n+/u, ''))}\n`;
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, block);
    return;
  }
  const existing = trimTrailingNewlines(readFileSync(targetPath, 'utf-8'));
  writeFileSync(targetPath, `${existing}\n\n${block}`);
};

const PARTIAL_SUFFIX = '.partial';

/** A regular fragment file: binaries copy byte-for-byte, text renders and overwrites. */
const overlayFile = (from: string, destDir: string, name: string, vars: TemplateVars): void => {
  const to = path.join(destDir, render(restoreDotfile(name), vars));
  if (BINARY_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    copyFileSync(from, to);
    return;
  }
  writeFileSync(to, render(readFileSync(from, 'utf-8'), vars));
};

/**
 * Overlay a piece fragment tree: regular files render and overwrite,
 * `<target>.partial` files merge into (or create) their target.
 */
const overlayTree = (srcDir: string, destDir: string, vars: TemplateVars): void => {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      overlayTree(from, path.join(destDir, render(restoreDotfile(entry.name), vars)), vars);
    } else if (entry.name.endsWith(PARTIAL_SUFFIX)) {
      const targetName = entry.name.slice(0, -PARTIAL_SUFFIX.length);
      const toName = render(restoreDotfile(targetName), vars);
      applyPartial(path.join(destDir, toName), render(readFileSync(from, 'utf-8'), vars));
    } else {
      overlayFile(from, destDir, entry.name, vars);
    }
  }
};

/**
 * Validate + canonicalize a piece selection: unknown names throw, duplicates
 * collapse, order is always sorted, and every piece must ship a fragment.
 */
export const normalizePieces = (pieces: string[], root = piecesRoot()): InitAppPiece[] => {
  const normalized: InitAppPiece[] = [];
  for (const piece of [...new Set(pieces)].toSorted()) {
    if (!isInitAppPiece(piece)) {
      throw new Error(`Unknown piece "${piece}". Available pieces: ${INIT_APP_PIECES.join(', ')}`);
    }
    if (pieceFragmentDirs(piece, root).length === 0) {
      throw new Error(`Piece "${piece}" ships no fragments under ${root}`);
    }
    normalized.push(piece);
  }
  return normalized;
};

export const availablePieces = (root = piecesRoot()): InitAppPiece[] =>
  INIT_APP_PIECES.filter((piece) => pieceFragmentDirs(piece, root).length > 0);

export const pieceDescription = (piece: InitAppPiece): string => PIECE_DESCRIPTIONS[piece];

/**
 * apps/<name>/src/app.ts for the selected backend pieces: each provider
 * adds one createApp key. Only written when a provider piece is selected.
 */
export const composeAppTs = (pieces: InitAppPiece[]): string => {
  const lines: string[] = ['import { createApp } from "@repo/core";'];
  const keycloak = pieces.includes('keycloak');
  if (keycloak) {
    lines.push('import { config } from "@repo/platform";');
  }
  lines.push(
    'import { themeConfig } from "@package/themes";',
    '',
    '/**',
    ' * App-wide provider stack. Providers below were enabled by the pieces',
    ' * this project adopted — see CreateAppConfig in @repo/core',
    ' * for everything else that can be wired here (tanstack, web3, custom',
    ' * providers).',
    ' */',
    'export const { AppProvider, useAppConfig, withApp } = createApp({',
    '  theme: themeConfig,',
  );
  if (keycloak) {
    lines.push(
      '  // Keycloak auth: KeycloakProvider mounts when KEYCLOAK_ENABLED=1.',
      '  // Realm/client settings come from the KEYCLOAK_* env keys',
      '  // (packages/config, .env.example); docker/compose.keycloak.yaml runs',
      '  // a dev server with an imported realm.',
      '  keycloak: { baseUrl: config.get("KEYCLOAK_BASE_URL") },',
    );
  }
  lines.push('});', '');
  return lines.join('\n');
};

export interface PiecesScaffold {
  name: string;
  mpoVersion: string;
  pieces: InitAppPiece[];
  /** templates/pieces of another CLI version (the merge base of an older adoption). */
  root?: string;
}

/**
 * The tool-owned surface of an adopted project: the selected piece
 * fragments overlaid, in sorted order, on an EMPTY tree. `mpo update`
 * builds both merge baselines of an adopted project with this.
 */
export const scaffoldPieces = (targetDir: string, request: PiecesScaffold): void => {
  const root = request.root ?? piecesRoot();
  const pieces = normalizePieces(request.pieces, root);
  if (!pieces.length) {
    const flags = INIT_APP_PIECES.map((piece) => `--${piece}`).join(', ');
    throw new Error(`A pieces scaffold needs at least one piece (${flags})`);
  }
  const vars: TemplateVars = {
    NAME: request.name,
    NAME_PASCAL: toPascalCase(request.name),
    NAME_APPID: request.name.replaceAll('-', ''),
    MPO_VERSION: request.mpoVersion,
    YEAR: String(new Date().getFullYear()),
  };
  mkdirSync(targetDir, { recursive: true });
  for (const piece of pieces) {
    for (const fragmentDir of pieceFragmentDirs(piece, root)) {
      overlayTree(fragmentDir, targetDir, vars);
    }
  }
  if (pieces.includes('keycloak')) {
    mkdirSync(path.join(targetDir, 'apps', request.name, 'src'), { recursive: true });
    writeFileSync(path.join(targetDir, 'apps', request.name, 'src/app.ts'), composeAppTs(pieces));
  }
};
