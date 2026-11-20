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
 *   import { readDrawingRegistry } from "./drawing-registry.mjs";
 *   node drawingRegistry.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DRAWING_HEADING = '## Drawing files';
export const DRAWING_CLASS = 'DRAWING';
export const CHROME_ALLOW_CLASS = 'CHROME-ALLOW';

/** `// mpo-drawing` or `/* mpo-drawing` at the start of a line. */
// oxlint-disable-next-line sonarjs/super-linear-regex -- exported; `\s` spanning newlines is part of what it matches today, and it only ever tests one source file's text
export const DRAWING_PRAGMA = /^\s*(?:\/\/|\/\*)\s*mpo-drawing\b/mu;

/**
 * @param {string} [cwd] directory the spec path is resolved against
 * @returns {string} the conventional spec location under `cwd`
 */
export const defaultSpecPath = (cwd = process.cwd()) => path.join(cwd, 'docs/theme-propagation-spec.md');

/**
 * `Members: **Avatar**, **Radio disc**.` → ["Avatar", "Radio disc"].
 * @param {string} text a table cell
 * @returns {string[]} the bolded member names
 */
const parseMembers = (text) => {
  const rest = /Members:(?<rest>.*)$/iu.exec(text)?.groups?.rest;
  if (rest === undefined) {
    return [];
  }
  return [...rest.matchAll(/\*\*(?<name>[^*]+)\*\*/gu)].flatMap((m) => {
    const name = (m.groups?.name ?? '').trim();
    return name === '' ? [] : [name];
  });
};

/**
 * @param {string} markdown the whole spec document
 * @param {string} specPath path of the spec, for error messages
 * @returns {{ id: string, text: string }[] | null} the class rows, or null when the section is absent
 */
const parseDrawingTable = (markdown, specPath) => {
  const lines = markdown.split('\n');
  const heading = lines.findIndex((line) => /^##\s+Drawing files\s*$/u.test(line));
  if (heading === -1) {
    return null;
  }
  const afterHeading = lines.slice(heading + 1).map((line) => line.trim());
  const sectionEnd = afterHeading.findIndex((line) => line.startsWith('##'));
  const section = sectionEnd === -1 ? afterHeading : afterHeading.slice(0, sectionEnd);
  const tableStart = section.findIndex((line) => line.startsWith('|'));
  const fromTable = tableStart === -1 ? [] : section.slice(tableStart);
  const tableEnd = fromTable.findIndex((line) => !line.startsWith('|'));
  const table = tableEnd === -1 ? fromTable : fromTable.slice(0, tableEnd);
  const rows = table.flatMap((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const isClassRow = cells.length >= 2 && !/^:?-{2,}/u.test(cells[0]) && cells[0].toLowerCase() !== 'class';
    return isClassRow ? [{ id: cells[0], text: cells[1] }] : [];
  });
  if (rows.length === 0) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no class rows`);
  }
  return rows;
};

/**
 * @param {string} [specPath] path of the spec markdown; defaults to the one under the working directory
 * @returns {{
 *   specPath: string,
 *   present: boolean,
 *   files: string[],
 *   chromeAllow: string[],
 * }} the DRAWING and CHROME-ALLOW members, or `present: false` without the section
 */
export const readDrawingRegistry = (specPath = defaultSpecPath()) => {
  if (!existsSync(specPath)) {
    return { specPath, present: false, files: [], chromeAllow: [] };
  }
  const rows = parseDrawingTable(readFileSync(specPath, 'utf-8'), specPath);
  if (!rows) {
    return { specPath, present: false, files: [], chromeAllow: [] };
  }

  /** @type {Map<string, string[]>} */
  const membersByClass = new Map();
  for (const row of rows) {
    membersByClass.set(row.id, parseMembers(row.text));
  }
  const files = membersByClass.get(DRAWING_CLASS);
  if (files === undefined) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no ${DRAWING_CLASS} row`);
  }
  const chromeAllow = membersByClass.get(CHROME_ALLOW_CLASS);
  if (chromeAllow === undefined) {
    throw new Error(`${specPath}: "${DRAWING_HEADING}" has no ${CHROME_ALLOW_CLASS} row`);
  }

  return { specPath, present: true, files, chromeAllow };
};

/**
 * True when `filename` is one of the registered drawing files.
 * Members are path suffixes (`listing/glyphs/CanvasGlyph.tsx`) or basenames.
 *
 * @param {string | undefined} filename path being linted
 * @param {string[]} files registered drawing members
 * @returns {boolean} true when the filename matches a member
 */
export const isDrawingFile = (filename, files) => {
  if (filename == null || filename === '' || files.length === 0) {
    return false;
  }
  const normalized = filename.replaceAll('\\', '/');
  return files.some((entry) => {
    const needle = entry.replaceAll('\\', '/').replace(/^\.\//u, '');
    return normalized === needle || normalized.endsWith(`/${needle}`);
  });
};

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

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
