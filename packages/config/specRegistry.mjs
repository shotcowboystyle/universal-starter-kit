/**
 * Slot-margin, size-recipe-escape and colour-literal-escape registries — parsed from the living
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
 *   import { readSlotMarginRegistry, readSizeRecipeEscapeRegistry, readHexEscapeRegistry } from "./specRegistry.mjs";
 *   node specRegistry.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { defaultSpecPath } from './drawingRegistry.mjs';

export const SLOT_MARGIN_HEADING = '## Slot margins';
export const SLOT_MARGIN_CLASS = 'SLOT-MARGIN';
export const SIZE_RECIPE_ESCAPE_HEADING = '## Size-recipe escapes';
export const HEX_ESCAPE_HEADING = '## Colour-literal escapes';

/** `` `a — b` `` → `a — b`. */
function unwrapCode(cell) {
  const match = cell.match(/^`(.*)`$/);
  return match ? match[1] : cell;
}

/**
 * Body rows of the first markdown table under `heading`, header and separator
 * dropped. `null` when the heading is absent.
 * @param {string} markdown
 * @param {string} heading e.g. "## Slot margins"
 * @returns {string[][] | null}
 */
export function readSpecTable(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {return null;}
  /** @type {string[][]} */
  const rows = [];
  let seenTable = false;
  let seenHeader = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2}\s/.test(line)) {break;}
    if (!line.startsWith('|')) {
      if (seenTable) {break;}
      continue;
    }
    seenTable = true;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (/^:?-+:?$/.test(cells[0] ?? '')) {continue;}
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

/** `Members: **Card.Footer**, **Card.Header**.` → ["Card.Footer", "Card.Header"]. */
function parseMembers(text) {
  const match = text.match(/Members:\s*(.*)$/i);
  if (!match) {return [];}
  return [...match[1].matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * @param {string} specPath
 * @param {string} heading
 */
function readTable(specPath, heading) {
  if (!existsSync(specPath)) {return null;}
  return readSpecTable(readFileSync(specPath, 'utf8'), heading);
}

/**
 * Element names that may carry a margin because the spec declares them an
 * internal slot (`Card.Footer` `marginTop: auto` is the precedent).
 *
 * @param {string} [specPath]
 * @returns {{ specPath: string, present: boolean, members: string[] }}
 */
export function readSlotMarginRegistry(specPath = defaultSpecPath()) {
  const rows = readTable(specPath, SLOT_MARGIN_HEADING);
  if (!rows) {return { specPath, present: false, members: [] };}
  const row = rows.find((cells) => cells[0] === SLOT_MARGIN_CLASS);
  if (!row) {
    throw new Error(`${specPath}: "${SLOT_MARGIN_HEADING}" has no ${SLOT_MARGIN_CLASS} row`);
  }
  return { specPath, present: true, members: parseMembers(row[1] ?? '') };
}

/**
 * `| File | Reason |` rows under `heading`: one `{ file, reason }` per row,
 * placeholder `_(none)_` rows dropped.
 *
 * @param {string} specPath
 * @param {string} heading
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }}
 */
function readFileReasonRegistry(specPath, heading) {
  const rows = readTable(specPath, heading);
  if (!rows) {return { specPath, present: false, escapes: [] };}
  /** @type {{ file: string, reason: string }[]} */
  const escapes = [];
  for (const cells of rows) {
    const file = unwrapCode(cells[0] ?? '');
    const reason = unwrapCode(cells[1] ?? '');
    if (!file || /^[_*]?\(none/.test(file)) {continue;}
    if (!reason) {
      throw new Error(`${specPath}: "${heading}" row for ${file} has no reason`);
    }
    escapes.push({ file, reason });
  }
  return { specPath, present: true, escapes };
}

/**
 * Declared size-recipe escape sites: one `{ file, reason }` per row. `file` is
 * a path from the tree root; `reason` is compared verbatim with the reason the
 * code writes, so rewording an escape is a spec edit too.
 *
 * @param {string} [specPath]
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }}
 */
export function readSizeRecipeEscapeRegistry(specPath = defaultSpecPath()) {
  return readFileReasonRegistry(specPath, SIZE_RECIPE_ESCAPE_HEADING);
}

/**
 * Files exempt from `mpo-conventions/no-hex-literals`: one `{ file, reason }`
 * per row, matched verbatim against the file's `hex-escape:` comment. These
 * are surfaces no theme token reaches (GTK widget CSS outside the provider, a
 * content script on third-party pages, the browser badge API, native build
 * config).
 *
 * @param {string} [specPath]
 * @returns {{ specPath: string, present: boolean, escapes: { file: string, reason: string }[] }}
 */
export function readHexEscapeRegistry(specPath = defaultSpecPath()) {
  return readFileReasonRegistry(specPath, HEX_ESCAPE_HEADING);
}

const invokedDirectly = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

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
    for (const { file, reason } of escapes.escapes) {console.log(`    ${file} — ${reason}`);}
    console.log(`  colour-literal escapes (present=${hexEscapes.present}):`);
    for (const { file, reason } of hexEscapes.escapes) {console.log(`    ${file} — ${reason}`);}
  }
}
