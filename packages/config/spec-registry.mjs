/**
 * Slot-margin, size-recipe-escape and color-literal-escape registries — parsed from the living
 * rulebook, the same way drawingRegistry.mjs reads its own.
 *
 * An escape is declared by name in a committed registry that is
 * generated from the spec, not from the code, so writing more violations can
 * never widen the allowlist. Both tables live in
 * `docs/theme-propagation-spec.md`:
 *
 *   ## Slot margins          `| Class | Normative meaning |`, one SLOT-MARGIN
 *                            row whose **bolded** `Members:` are the element
 *                            names that may carry a margin.
 *   ## Size-recipe escapes   `| File | Reason |`, one row per escape site; the
 *                            reason is the exact text the code writes.
 *   ## Colour-literal escapes  `| File | Reason |`, one row per file whose
 *                            `hex-escape:` comment exempts it from
 *                            no-hex-literals; same verbatim reason.
 *
 * A consumer tree with no spec, or a spec without the section, yields
 * `present: false` rather than throwing, so shc can pick the rules up before
 * it has copied the tables.
 *
 * Usage:
 *   import { readSlotMarginRegistry, readSizeRecipeEscapeRegistry, readHexEscapeRegistry } from "./spec-registry.mjs";
 *   node specRegistry.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { defaultSpecPath } from './drawing-registry.mjs';

export const SLOT_MARGIN_HEADING = '## Slot margins';
export const SLOT_MARGIN_CLASS = 'SLOT-MARGIN';
export const SIZE_RECIPE_ESCAPE_HEADING = '## Size-recipe escapes';
export const HEX_ESCAPE_HEADING = '## Colour-literal escapes';

/**
 * `` `a — b` `` → `a — b`.
 * @param {string} cell a table cell
 * @returns {string} the cell without its surrounding backticks
 */
const unwrapCode = (cell) => /^`(?<inner>.*)`$/u.exec(cell)?.groups?.inner ?? cell;

/**
 * @param {string} line a trimmed `| a | b |` table line
 * @returns {string[]} the trimmed cells
 */
const tableCells = (line) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

/**
 * Body rows of the first markdown table under `heading`, header and separator
 * dropped. `null` when the heading is absent.
 * @param {string} markdown the whole document
 * @param {string} heading e.g. "## Slot margins"
 * @returns {string[][] | null} the body rows' cells, or null when the heading is absent
 */
export const readSpecTable = (markdown, heading) => {
  const lines = markdown.split('\n').map((line) => line.trim());
  const start = lines.indexOf(heading);
  if (start === -1) {
    return null;
  }
  const afterHeading = lines.slice(start + 1);
  const sectionEnd = afterHeading.findIndex((line) => /^#{1,2}\s/u.test(line));
  const section = sectionEnd === -1 ? afterHeading : afterHeading.slice(0, sectionEnd);
  const tableStart = section.findIndex((line) => line.startsWith('|'));
  if (tableStart === -1) {
    return [];
  }
  const fromTable = section.slice(tableStart);
  const tableEnd = fromTable.findIndex((line) => !line.startsWith('|'));
  const table = tableEnd === -1 ? fromTable : fromTable.slice(0, tableEnd);
  return table
    .flatMap((line) => {
      const cells = tableCells(line);
      return /^:?-+:?$/u.test(cells[0] ?? '') ? [] : [cells];
    })
    .slice(1);
};

/**
 * `Members: **Card.Footer**, **Card.Header**.` → ["Card.Footer", "Card.Header"].
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
 * @param {string} specPath path of the spec markdown
 * @param {string} heading the section heading to read
 * @returns {string[][] | null} the table's body rows, or null when the spec or section is missing
 */
const readTable = (specPath, heading) => {
  if (!existsSync(specPath)) {
    return null;
  }
  return readSpecTable(readFileSync(specPath, 'utf-8'), heading);
};

/**
 * Element names that may carry a margin because the spec declares them an
 * internal slot (`Card.Footer` `marginTop: auto` is the precedent).
 *
 * @param {string} [specPath] path of the spec markdown; defaults to the one under the working directory
 * @returns {{ specPath: string, present: boolean, members: string[] }} the declared slot members, or `present: false` without the section
 */
export const readSlotMarginRegistry = (specPath = defaultSpecPath()) => {
  const rows = readTable(specPath, SLOT_MARGIN_HEADING);
  if (!rows) {
    return { specPath, present: false, members: [] };
  }
  const row = rows.find((cells) => cells[0] === SLOT_MARGIN_CLASS);
  if (!row) {
    throw new Error(`${specPath}: "${SLOT_MARGIN_HEADING}" has no ${SLOT_MARGIN_CLASS} row`);
  }
  return { specPath, present: true, members: parseMembers(row[1] ?? '') };
};

/**
 * `| File | Reason |` rows under `heading`: one `{ file, reason }` per row,
 * placeholder `_(none)_` rows dropped.
 *
 * @param {string} specPath path of the spec markdown
 * @param {string} heading the section heading to read
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }} the declared escapes, or `present: false` without the section
 */
const readFileReasonRegistry = (specPath, heading) => {
  const rows = readTable(specPath, heading);
  if (!rows) {
    return { specPath, present: false, escapes: [] };
  }
  /** @type {{ file: string, reason: string }[]} */
  const escapes = [];
  for (const cells of rows) {
    const file = unwrapCode(cells[0] ?? '');
    const reason = unwrapCode(cells[1] ?? '');
    if (!file || /^[_*]?\(none/u.test(file)) {
      continue;
    }
    if (!reason) {
      throw new Error(`${specPath}: "${heading}" row for ${file} has no reason`);
    }
    escapes.push({ file, reason });
  }
  return { specPath, present: true, escapes };
};

/**
 * Declared size-recipe escape sites: one `{ file, reason }` per row. `file` is
 * a path from the tree root; `reason` is compared verbatim with the reason the
 * code writes, so rewording an escape is a spec edit too.
 *
 * @param {string} [specPath] path of the spec markdown; defaults to the one under the working directory
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }} the declared escapes, or `present: false` without the section
 */
export const readSizeRecipeEscapeRegistry = (specPath = defaultSpecPath()) =>
  readFileReasonRegistry(specPath, SIZE_RECIPE_ESCAPE_HEADING);

/**
 * Files exempt from `mpo-conventions/no-hex-literals`: one `{ file, reason }`
 * per row, matched verbatim against the file's `hex-escape:` comment. These
 * are surfaces no theme token reaches (a
 * content script on third-party pages, the browser badge API, native build
 * config).
 *
 * @param {string} [specPath] path of the spec markdown; defaults to the one under the working directory
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }} the declared escapes, or `present: false` without the section
 */
export const readHexEscapeRegistry = (specPath = defaultSpecPath()) =>
  readFileReasonRegistry(specPath, HEX_ESCAPE_HEADING);

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const slots = readSlotMarginRegistry();
  const escapes = readSizeRecipeEscapeRegistry();
  const hexEscapes = readHexEscapeRegistry();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ slots, escapes, hexEscapes }, null, 2));
  } else {
    console.log(`spec registries from ${slots.specPath}`);
    console.log(`  SLOT-MARGIN (present=${slots.present}): ${slots.members.join(', ') || '(none)'}`);
    console.log(`  size-recipe escapes (present=${escapes.present}):`);
    for (const { file, reason } of escapes.escapes) {
      console.log(`    ${file} — ${reason}`);
    }
    console.log(`  color-literal escapes (present=${hexEscapes.present}):`);
    for (const { file, reason } of hexEscapes.escapes) {
      console.log(`    ${file} — ${reason}`);
    }
  }
}
