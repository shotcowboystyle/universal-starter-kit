import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { cliRoot } from './provenance';

/**
 * Pieces: additive fragment trees under templates/pieces/<piece>/ that an
 * ADOPTED project (`mpo adopt`) hand-copied and wants `mpo update` to keep
 * reconciling. A project from `mpo init` never needs them: apps/one already
 * ships gnome/, tauri/, vscode/ and webext/, and frappe / keycloak are
 * `--service` selections of the real apps. Keep sorted: pieces are recorded
 * sorted in provenance and overlaid in this order.
 */
export const INIT_APP_PIECES = ['frappe', 'frappe-bench', 'gnome', 'keycloak', 'tauri', 'vscode', 'webext'] as const;
export type InitAppPiece = (typeof INIT_APP_PIECES)[number];

const PIECE_DESCRIPTIONS: Record<InitAppPiece, string> = {
  frappe: 'Frappe client wiring (env keys, provider)',
  'frappe-bench': 'Frappe dev bench (docker compose: bench, MariaDB, Redis)',
  gnome: 'GNOME desktop target (GTK4/GJS via react-gnome — native widgets, no webview)',
  keycloak: 'Keycloak auth wiring (env keys, provider, docker compose + realm)',
  tauri: 'Tauri desktop target (src-tauri skeleton — webview shell, Rust toolchain)',
  vscode: 'VS Code extension target (extension host + Tamagui webview)',
  webext: 'Browser extension target (MV3 popup + background)',
};

export function piecesRoot(): string {
  return join(cliRoot(), 'templates/pieces');
}

interface TemplateVars {
  NAME: string;
  NAME_PASCAL: string;
  /** Lowercase alphanumeric form for iOS bundle ids / Android packages. */
  NAME_APPID: string;
  MPO_VERSION: string;
  YEAR: string;
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Fragment source dirs for a piece: shared/ plus universal/ (the layout
 * adopted repos follow: apps/<name>/...). A piece is available when at least
 * one of the two exists.
 */
function pieceFragmentDirs(piece: InitAppPiece, root: string): string[] {
  return [join(root, piece, 'shared'), join(root, piece, 'universal')].filter((dir) => existsSync(dir));
}

/**
 * npm always strips .gitignore / .npmrc (and newer npms .env*) from published
 * tarballs, so the template stores them without the leading dot; restore it
 * at scaffold time.
 */
const DOTFILE_NAMES: Record<string, string> = {
  gitignore: '.gitignore',
  npmrc: '.npmrc',
  'env.example': '.env.example',
};

function render(content: string, vars: TemplateVars): string {
  return content
    .replaceAll('__NAME_PASCAL__', vars.NAME_PASCAL)
    .replaceAll('__NAME_APPID__', vars.NAME_APPID)
    .replaceAll('__NAME__', vars.NAME)
    .replaceAll('__MPO_VERSION__', vars.MPO_VERSION)
    .replaceAll('__YEAR__', vars.YEAR);
}

/** Assets copied byte-for-byte; the utf-8 render pass would corrupt them. */
const BINARY_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.ico', '.icns']);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge for JSON partials: objects merge recursively (fragment keys
 * append after base keys, so e.g. package.json script order stays stable),
 * arrays union (base order first), scalars/type-mismatches take the
 * fragment value.
 */
export function mergeJsonValues(base: JsonValue, fragment: JsonValue): JsonValue {
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
    const merged: { [key: string]: JsonValue } = { ...base };
    for (const [key, value] of Object.entries(fragment)) {
      merged[key] = key in merged ? mergeJsonValues(merged[key], value) : value;
    }
    return merged;
  }
  return fragment;
}

const SORTED_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** Dependency maps stay sorted after fragment merges so overlay order never changes the bytes. */
function sortDependencyFields(value: JsonValue): JsonValue {
  if (!isJsonObject(value)) {
    return value;
  }
  const result = { ...value };
  for (const field of SORTED_DEPENDENCY_FIELDS) {
    const deps = result[field];
    if (!isJsonObject(deps)) {
      continue;
    }
    result[field] = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return result;
}

/**
 * Apply a rendered `<target>.partial` fragment onto the target file:
 *   - `.json` targets deep-merge (see mergeJsonValues)
 *   - everything else appends as a text block separated by a blank line
 * Missing targets are created from the fragment alone.
 */
function applyPartial(targetPath: string, renderedFragment: string): void {
  if (targetPath.endsWith('.json')) {
    const fragment = JSON.parse(renderedFragment) as JsonValue;
    const base = existsSync(targetPath) ? (JSON.parse(readFileSync(targetPath, 'utf-8')) as JsonValue) : undefined;
    const merged = sortDependencyFields(base === undefined ? fragment : mergeJsonValues(base, fragment));
    writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
    return;
  }
  const block = `${renderedFragment.replace(/^\n+/u, '').replace(/\n+$/u, '')}\n`;
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, block);
    return;
  }
  const existing = readFileSync(targetPath, 'utf-8').replace(/\n+$/u, '');
  writeFileSync(targetPath, `${existing}\n\n${block}`);
}

const PARTIAL_SUFFIX = '.partial';

/**
 * Overlay a piece fragment tree: regular files render and overwrite,
 * `<target>.partial` files merge into (or create) their target.
 */
function overlayTree(srcDir: string, destDir: string, vars: TemplateVars): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const from = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      overlayTree(from, join(destDir, render(DOTFILE_NAMES[entry.name] ?? entry.name, vars)), vars);
      continue;
    }
    if (entry.name.endsWith(PARTIAL_SUFFIX)) {
      const targetName = entry.name.slice(0, -PARTIAL_SUFFIX.length);
      const toName = render(DOTFILE_NAMES[targetName] ?? targetName, vars);
      applyPartial(join(destDir, toName), render(readFileSync(from, 'utf-8'), vars));
      continue;
    }
    const toName = render(DOTFILE_NAMES[entry.name] ?? entry.name, vars);
    const to = join(destDir, toName);
    if (BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      copyFileSync(from, to);
      continue;
    }
    writeFileSync(to, render(readFileSync(from, 'utf-8'), vars));
  }
}

/**
 * Validate + canonicalize a piece selection: unknown names throw, duplicates
 * collapse, order is always sorted, and every piece must ship a fragment.
 */
export function normalizePieces(pieces: string[], root = piecesRoot()): InitAppPiece[] {
  const known = new Set<string>(INIT_APP_PIECES);
  const normalized = [...new Set(pieces)].sort() as InitAppPiece[];
  for (const piece of normalized) {
    if (!known.has(piece)) {
      throw new Error(`Unknown piece "${piece}". Available pieces: ${INIT_APP_PIECES.join(', ')}`);
    }
    if (pieceFragmentDirs(piece, root).length === 0) {
      throw new Error(`Piece "${piece}" ships no fragments under ${root}`);
    }
  }
  return normalized;
}

/**
 * The frappe piece carried the dev bench until the bench became its own piece
 * (MPO-241). An adoption recorded against pieces that still bundle it keeps
 * the bench, now as frappe-bench, so an update does not delete it.
 */
export function withSplitPieces(pieces: InitAppPiece[], recordedRoot?: string): InitAppPiece[] {
  if (!recordedRoot || !pieces.includes('frappe') || pieces.includes('frappe-bench')) {
    return pieces;
  }
  if (!existsSync(join(recordedRoot, 'frappe/universal/docker/compose.frappe.yaml'))) {
    return pieces;
  }
  return [...pieces, 'frappe-bench' as const].sort();
}

export function availablePieces(root = piecesRoot()): InitAppPiece[] {
  return INIT_APP_PIECES.filter((piece) => pieceFragmentDirs(piece, root).length > 0);
}

export function pieceDescription(piece: InitAppPiece): string {
  return PIECE_DESCRIPTIONS[piece];
}

/**
 * apps/<name>/src/app.ts for the selected backend pieces: each provider
 * adds one createApp key. Only written when a provider piece is selected.
 */
export function composeAppTs(pieces: InitAppPiece[]): string {
  const frappe = pieces.includes('frappe');
  const keycloak = pieces.includes('keycloak');
  const lines: string[] = ['import { createApp } from "@repo/core";'];
  if (frappe || keycloak) {
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
  if (frappe) {
    lines.push(
      '  // Frappe client: FrappeProvider mounts when FRAPPE_ENABLED=1 (a',
      '  // packages/config public env key, loaded from .env — see',
      '  // .env.example). FRAPPE_URL names the Frappe server (default:',
      '  // BASE_URL, then http://localhost:8000).',
    );
    if (pieces.includes('frappe-bench')) {
      lines.push('  // docker/compose.frappe.yaml runs a dev bench.');
    }
    lines.push('  frappe: { baseURL: config.get("FRAPPE_URL") },');
  }
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
}

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
export function scaffoldPieces(targetDir: string, request: PiecesScaffold): void {
  const root = request.root ?? piecesRoot();
  const pieces = normalizePieces(request.pieces, root);
  if (!pieces.length) {
    throw new Error(
      `A pieces scaffold needs at least one piece (${INIT_APP_PIECES.map((piece) => `--${piece}`).join(', ')})`,
    );
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
  if (pieces.includes('frappe') || pieces.includes('keycloak')) {
    mkdirSync(join(targetDir, 'apps', request.name, 'src'), { recursive: true });
    writeFileSync(join(targetDir, 'apps', request.name, 'src/app.ts'), composeAppTs(pieces));
  }
}
