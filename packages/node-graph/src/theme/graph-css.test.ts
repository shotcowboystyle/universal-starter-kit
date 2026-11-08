/**
 * The static sheet and the one rule that governs when the var sheet is rebuilt.
 *
 * The four touch declarations are not styling. Each one is a gesture that stops
 * working on a phone without it, so they are asserted by name rather than left
 * to a reviewer's eye.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { atRulePreambles, topLevelSelectors } from '../../tests/styles';

import { GraphVars, graphRootClassName, graphVarsSheet } from './GraphVarsStyle';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const graphCss = readFileSync(path.join(packageRoot, 'css/graph.css'), 'utf-8');

describe('css/graph.css', () => {
  it.each([
    ['touch-action: none', 'the pane owns pan and pinch; without it the browser takes the gesture'],
    ['-webkit-touch-callout: none', 'iOS otherwise raises the share callout on the lasso long-press'],
    ['user-select: none', 'a drag across nodes otherwise starts a text selection'],
    ['overscroll-behavior: none', 'a pan at the edge otherwise becomes pull-to-refresh'],
  ])('carries `%s` — %s', (declaration) => {
    expect(graphCss).toContain(declaration);
  });

  it('scopes every rule to the graph root', () => {
    // A sheet a consumer imports globally must not paint anything outside the
    // graph, so every selector is checked, not just the ones a reader notices.
    const selectors = topLevelSelectors(graphCss);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, 'an empty selector means the scanner lost its place').not.toBe('');
      for (const part of selector.split(',').map((piece) => piece.trim())) {
        expect(part.startsWith(`.${graphRootClassName}`), part).toBe(true);
      }
    }
  });

  it('namespaces every at-rule, which no selector scope can reach', () => {
    // `@keyframes` names live in a GLOBAL namespace: a consumer's own
    // `@keyframes dash` and ours would collide however well the rules are
    // scoped. So the check on an at-rule is its name, not a selector prefix.
    const preambles = atRulePreambles(graphCss);
    expect(preambles.length).toBeGreaterThan(0);
    for (const preamble of preambles) {
      expect(preamble, preamble).toMatch(new RegExp(`^@[a-z-]+\\s+${graphRootClassName}-`, 'u'));
    }
  });

  it('carries no colour of its own — colour is the var layer', () => {
    expect(/#[0-9a-f]{3,8}\b/iu.test(graphCss)).toBe(false);
    expect(/\b(?:rgba?|hsla?)\(/u.test(graphCss)).toBe(false);
  });
});

describe(graphVarsSheet, () => {
  it('emits a scoped block with a stable key order', () => {
    const sheet = graphVarsSheet(
      { '--xy-edge-stroke': 'var(--color9)', '--mpo-graph-node-gap': '18px' },
      'dark',
      '.mp-graph-root',
    );
    expect(sheet).toContain('.mp-graph-root {');
    expect(sheet).toContain('color-scheme: dark;');
    expect(sheet.indexOf('--mpo-graph-node-gap')).toBeLessThan(sheet.indexOf('--xy-edge-stroke'));
  });
});

describe(GraphVars, () => {
  it('rebuilds the sheet on the revision and on nothing else', () => {
    const first = renderWithProviders(
      createElement(GraphVars, {
        vars: { '--xy-edge-stroke': 'var(--color9)' },
        scheme: 'light',
        revision: 4,
      }),
    );
    const style = () => first.container.querySelector<HTMLStyleElement>('style[data-mpo-graph-vars]');
    expect(style()?.textContent).toContain('var(--color9)');

    // Same revision, different vars: the sheet must NOT be re-serialized.
    first.rerender(
      createElement(GraphVars, {
        vars: { '--xy-edge-stroke': 'var(--color12)' },
        scheme: 'light',
        revision: 4,
      }),
    );
    expect(style()?.textContent).toContain('var(--color9)');

    // Bump the revision and it catches up.
    first.rerender(
      createElement(GraphVars, {
        vars: { '--xy-edge-stroke': 'var(--color12)' },
        scheme: 'light',
        revision: 5,
      }),
    );
    expect(style()?.textContent).toContain('var(--color12)');
    expect(style()?.dataset.mpoGraphVars).toBe('5');
    first.unmount();
  });
});
