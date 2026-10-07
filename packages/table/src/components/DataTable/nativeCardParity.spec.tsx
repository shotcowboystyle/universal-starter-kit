/**
 * One card renderer, two platforms.
 *
 * DataTableRoot.tsx (web) and index.native.tsx (native) are separate roots
 * because native virtualizes through FlashList. The CARD LIST is not part
 * of that split — a card has no platform-specific anatomy — so both roots
 * render the same DataTableMobileCards rather than each drawing a card.
 *
 * MPO-285 shared the field RULE (classifyCardField, getColumnLabel) while
 * leaving two copies of the JSX, and the two had already drifted: the
 * native copy hardcoded its surface, and shipped without zebra striping,
 * the selection checkbox, the empty states, and the TableCellContext that
 * makes a field render chromeless. Sharing the rule alone does not stop
 * that, because a new slot still has to be added twice.
 *
 * These assertions read source rather than render: the native root pulls in
 * FlashList and the suite runs under happy-dom, so index.native.tsx is
 * never the module a spec resolves. What the card DOES on native is covered
 * by dataTableMobileCards.spec.tsx, which now describes both platforms.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIR = resolve(__dirname);

function read(file: string): string {
  return readFileSync(resolve(DIR, file), 'utf-8');
}

/** A `<Component ... />` element at a call site, as text. */
function callSite(source: string, component: string): string {
  const start = source.indexOf(`<${component}`);
  if (start === -1) {
    return '';
  }
  const end = source.indexOf('/>', start);
  return end === -1 ? '' : source.slice(start, end);
}

/** Prop names that call site passes. */
function propNames(source: string, component: string): Set<string> {
  const names = new Set<string>();
  for (const match of callSite(source, component).matchAll(/(?:^|\s)([A-Za-z][A-Za-z0-9]*)=\{/g)) {
    names.add(match[1]);
  }
  return names;
}

const cardCallSite = (source: string) => callSite(source, 'DataTableMobileCards');

describe('DataTable card renderer parity', () => {
  it('the native root renders DataTableMobileCards and carries no card of its own', () => {
    const native = read('index.native.tsx');
    expect(native).toMatch(/import \{[^}]*DataTableMobileCards[^}]*\} from "\.\/DataTableMobileCards"/);
    expect(cardCallSite(native)).not.toBe('');
    expect(native).not.toMatch(/renderMobileCard/);
  });

  it('the native root reaches the card field rule through the component, not directly', () => {
    // MPO-285 left index.native.tsx importing classifyCardField/getColumnLabel
    // to feed its own JSX. With the JSX shared there is nothing left to feed:
    // an import here again would mean a second card had grown back.
    const native = read('index.native.tsx');
    expect(native).not.toMatch(/\bclassifyCardField\b/);
    expect(native).not.toMatch(/\bgetColumnLabel\b/);
  });

  it('exactly one file in the component draws a card', () => {
    const drawers = readdirSync(DIR)
      .filter((file) => file.endsWith('.tsx') && !file.includes('.spec.') && !file.includes('.stories.'))
      .filter((file) => read(file).includes('testID="data-table-card"'));
    expect(drawers).toEqual(['DataTableMobileCards.tsx']);
  });

  // Both roots hand their row views the same contract. A prop web passes and
  // native does not is how the card lost selection and the empty states in
  // the first place, so it is the drift worth failing a build over.
  it.each(['DataTableMobileCards', 'DataTableDocumentList'])('native passes every %s prop web passes', (component) => {
    const web = propNames(read('DataTableRoot.tsx'), component);
    const native = propNames(read('index.native.tsx'), component);
    expect(web.size).toBeGreaterThan(0);
    expect([...web].filter((prop) => !native.has(prop)).sort()).toEqual([]);
  });

  it('native hands the card list its press props, so a card is pressable there too', () => {
    expect(cardCallSite(read('index.native.tsx'))).toMatch(/getRowPressProps/);
  });
});
