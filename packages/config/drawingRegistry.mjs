/**
 * Drawing / chrome-allow registry — parsed from the living rulebook.
 *
 * Raw numeric geometry is legal only in files listed as DRAWING
 * members, and chrome props on imported @repo/* components are
 * legal only for CHROME-ALLOW members. Both lists are parsed from
 * `docs/theme-propagation-spec.md` `## Drawing files`. Writing more
 * violations into the code cannot widen either list.
 *
 * A consumer tree with no spec (or no Drawing files section) yields empty
 * lists rather than throwing, so shc can pick the oxlint rules up before it
 * has copied this table.
 *
 * Usage:
 *   import { readDrawingRegistry } from "./drawingRegistry.mjs";
 *   node drawingRegistry.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DRAWING_HEADING = '## Drawing files';
export const DRAWING_CLASS = 'DRAWING';
export const CHROME_ALLOW_CLASS = 'CHROME-ALLOW';

/** `// mpo-drawing` or `/* mpo-drawing` at the start of a line. */
export const DRAWING_PRAGMA = /^\s*(?:\/\/|\/\*)\s*mpo-drawing\b/m;

/**
 * @param {string} [cwd]
 */
export function defaultSpecPath(cwd = process.cwd()) {
  return join(cwd, 'docs/theme-propagation-spec.md');
}

/** `Members: **Avatar**, **Radio disc**.` → ["Avatar", "Radio disc"]. */
function parseMembers(text) {
  const match = text.match(/Members:\s*(.*)$/i);
  if (!match) {return [];}
  return [...match[1].matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * @param {string} markdown
 * @param {string} specPath
 */
function parseDrawingTable(markdown, specPath) {
  const lines = markdown.split('\n');
  const heading = lines.findIndex((line) => /^##\s+Drawing files\s*$/.test(line));
  if (heading === -1) {return null;}

  /** @type {{ id: string, text: string }[]} */
  const rows = [];
  let seenTable = false;
  for (let i = heading + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('##')) {break;}
    if (!line.startsWith('|')) {
      if (seenTable) {break;}
      continue;
    }
    seenTable = true;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) {continue;}
    if (/^:?-{2,}/.test(cells[0])) {continue;}
    if (cells[0].toLowerCase() === 'class') {continue;}
    rows.push({ id: cells[0], text: cells[1] });
  }
  if (rows.length === 0) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no class rows`);
  }
  return rows;
}

/**
 * @param {string} [specPath]
 * @returns {{
 *   specPath: string,
 *   present: boolean,
 *   files: string[],
 *   chromeAllow: string[],
 * }}
 */
export function readDrawingRegistry(specPath = defaultSpecPath()) {
  if (!existsSync(specPath)) {
    return { specPath, present: false, files: [], chromeAllow: [] };
  }
  const rows = parseDrawingTable(readFileSync(specPath, 'utf8'), specPath);
  if (!rows) {
    return { specPath, present: false, files: [], chromeAllow: [] };
  }

  /** @type {Record<string, { text: string, members: string[] }>} */
  const classes = {};
  for (const row of rows) {
    classes[row.id] = { text: row.text, members: parseMembers(row.text) };
  }
  if (!classes[DRAWING_CLASS]) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no ${DRAWING_CLASS} row`);
  }
  if (!classes[CHROME_ALLOW_CLASS]) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no ${CHROME_ALLOW_CLASS} row`);
  }

  return {
    specPath,
    present: true,
    files: classes[DRAWING_CLASS].members,
    chromeAllow: classes[CHROME_ALLOW_CLASS].members,
  };
}

/**
 * True when `filename` is one of the registered drawing files.
 * Members are path suffixes (`listing/glyphs/CanvasGlyph.tsx`) or basenames.
 *
 * @param {string | undefined} filename
 * @param {string[]} files
 */
export function isDrawingFile(filename, files) {
  if (!filename || !files.length) {return false;}
  const normalized = filename.replaceAll('\\', '/');
  return files.some((entry) => {
    const needle = entry.replaceAll('\\', '/').replace(/^\.\//, '');
    return normalized === needle || normalized.endsWith(`/${needle}`);
  });
}

const invokedDirectly = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const registry = readDrawingRegistry();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(registry, null, 2));
  } else {
    console.log(`drawing registry from ${registry.specPath} (present=${registry.present})`);
    console.log(`  DRAWING:      ${registry.files.join(', ') || '(none)'}`);
    console.log(`  CHROME-ALLOW: ${registry.chromeAllow.join(', ') || '(none)'}`);
  }
}
