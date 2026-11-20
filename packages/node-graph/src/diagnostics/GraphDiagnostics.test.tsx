/**
 * The panel, and the two things about it that are not cosmetic.
 *
 * It has to NAME THE STAGE AND THE PHASE when boot failed, because that pair is
 * what tells a reader which of design §9.4's five layers let the failure
 * through — and on a device the panel is the only evidence there is.
 *
 * And `deliberate-break.ts` throws at module scope, so its blast radius has to
 * stay exactly one dynamic import behind a story control.
 */

import fs from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GraphDiagnostics } from './GraphDiagnostics';
import type { GraphDiagnostics as GraphDiagnosticsRecord } from './types';

const healthy: GraphDiagnosticsRecord = {
  stage: 'ready',
  bootMs: 812,
  renderer: 'react-flow-dom',
  xyflowVersion: '12.11.5',
  layoutRunner: 'none',
  faces: [],
  faceDelivery: [],
  nodesMounted: 12,
  nodesInDocument: 12,
  culling: true,
  renderMode: 'detail',
  scheme: 'light',
  lastError: null,
};

const draw = (diagnostics: GraphDiagnosticsRecord, show = true) =>
  renderWithProviders(
    <GraphDiagnostics
      diagnostics={diagnostics}
      show={show}
    />,
  );

const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(full));
      continue;
    }
    if (/\.(?:tsx?|jsx?)$/u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

describe('GraphDiagnostics module', () => {
  afterEach(cleanup);

  describe(GraphDiagnostics, () => {
    it('reports the fields a device screenshot has to carry', () => {
      draw(healthy);
      expect(screen.getByText(/stage: ready/u)).toBeTruthy();
      expect(screen.getByText(/renderer: react-flow-dom/u)).toBeTruthy();
      expect(screen.getByText(/xyflow: 12\.11\.5/u)).toBeTruthy();
      expect(screen.getByText(/layoutRunner: none/u)).toBeTruthy();
      expect(screen.getByText(/nodesMounted: 12/u)).toBeTruthy();
    });

    it("reports the document's node count beside the mounted one", () => {
      // The pair is the point. AC 2.7 asks for twelve nodes; culling mounts ten
      // of them at the default viewport, and a panel printing one number for both
      // made that unreadable off a screenshot.
      draw({ ...healthy, nodesMounted: 10, nodesInDocument: 12 });
      expect(screen.getByText(/nodesInDocument: 12/u)).toBeTruthy();
      expect(screen.getByText(/nodesMounted: 10 — 2 outside the viewport, culling is on/u)).toBeTruthy();
    });

    it('says nothing about culling when every node mounted', () => {
      draw({ ...healthy, nodesMounted: 12, nodesInDocument: 12 });
      expect(screen.getByText(/nodesMounted: 12$/u)).toBeTruthy();
    });

    it("reports how long boot took, so the watchdog's budget can be re-set from it", () => {
      draw(healthy);
      expect(screen.getByText(/bootMs: 812 ms/u)).toBeTruthy();
    });

    it('says there is no boot record rather than printing a zero', () => {
      draw({ ...healthy, bootMs: null });
      expect(screen.getByText(/bootMs: no boot record/u)).toBeTruthy();
    });

    it('names which mechanism delivered each face', () => {
      // Design 6.3 has two, and which one answered is the difference between a
      // 211 KB base64 payload doing the work and an asset URL doing it.
      draw({
        ...healthy,
        faceDelivery: [
          { id: 'inter-400', family: 'Inter', weight: 400, source: 'inline' },
          { id: 'inter-700', family: 'Inter', weight: 700, source: 'asset' },
        ],
      });
      expect(screen.getByText(/faceDelivery: inter-400 · Inter 400 · inline/u)).toBeTruthy();
      expect(screen.getByText(/faceDelivery: inter-700 · Inter 700 · asset/u)).toBeTruthy();
    });

    it('says no faces were mounted rather than leaving the delivery row blank', () => {
      draw(healthy);
      expect(screen.getByText(/faceDelivery: no faces mounted/u)).toBeTruthy();
    });

    it('says faces were not probed rather than showing an empty space', () => {
      draw(healthy);
      expect(screen.getByText(/faces: not probed/u)).toBeTruthy();
    });

    it("shows a face probe's verdict and both widths", () => {
      draw({
        ...healthy,
        faces: [
          {
            stack: 'Inter, sans-serif',
            widthStack: 210.13,
            widthFirstCorrupted: 205.28,
            matched: true,
            conclusive: true,
          },
        ],
      });
      expect(screen.getByText(/MATCHED/u)).toBeTruthy();
      expect(screen.getByText(/210\.13px vs 205\.28px/u)).toBeTruthy();
    });

    it('draws NOTHING outside dev unless told otherwise', () => {
      const { container } = draw(healthy, false);
      expect(container.querySelector('[data-graph-diagnostics]')).toBeNull();
    });

    it('NAMES THE STAGE AND THE PHASE on a module failure', () => {
      draw({
        ...healthy,
        stage: 'faces',
        lastError: { phase: 'module', message: "Cannot use 'import.meta' outside a module" },
      });
      expect(screen.getByText(/boot failed at stage faces · phase module/u)).toBeTruthy();
      expect(screen.getByText(/import\.meta/u)).toBeTruthy();
    });

    it('marks the stage reached in the trail, so the remaining layers are visible', () => {
      draw({
        ...healthy,
        stage: 'faces',
        lastError: { phase: 'module', message: 'x' },
      });
      expect(screen.getByText(/script → module → \[faces\] → provider → flow → ready/u)).toBeTruthy();
    });

    it('says the stage was none when boot never stamped one', () => {
      draw({ ...healthy, stage: null, lastError: { phase: 'boot', message: 'x' } });
      expect(screen.getByText(/boot failed at stage none · phase boot/u)).toBeTruthy();
      expect(screen.getByText(/\(none reached\)/u)).toBeTruthy();
    });

    it('draws no failure banner when nothing failed', () => {
      const { container } = draw(healthy);
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe("deliberateBreak's blast radius", () => {
    const src = path.resolve(import.meta.dirname, '..');

    it('is excluded from the build, so no compiled copy of it exists at all', () => {
      // Measured, not assumed: `tamagui-build` compiles every source file it
      // finds, reachable or not, so a story-only importer is NOT enough to keep
      // it out of `dist`. The first run of this build emitted
      // dist/esm/diagnostics/deliberateBreak.mjs. The exclude pattern is what
      // actually keeps it out, the same mechanism that keeps the DOM entry out.
      const pkg = JSON.parse(fs.readFileSync(path.resolve(src, '../package.json'), 'utf-8')) as {
        scripts: Record<string, string>;
      };
      expect(pkg.scripts.build).toContain('diagnostics/deliberate-break');
    });

    it('throws on evaluation, which is the whole point', async () => {
      await expect(import('./deliberate-break')).rejects.toThrow(/deliberate break/u);
    });

    it('is imported by NOTHING under src/ except its own story and this spec', () => {
      // Two importers, both named. The story, which is the feature, and this
      // file, which imports it one line above to prove it throws. Anything else
      // appearing here means a module that throws on evaluation acquired a
      // caller that is not behind a story control, and the build excludes only
      // `*.stories.*`.
      const importers = filesUnder(src).filter(
        (file) =>
          !file.endsWith('deliberate-break.ts') &&
          /["']\.\/deliberate-break["']|["'][^"']*\/deliberate-break["']/u.test(fs.readFileSync(file, 'utf-8')),
      );
      expect(importers.map((file) => path.relative(src, file)).toSorted()).toStrictEqual([
        'diagnostics/GraphDiagnostics.stories.tsx',
        'diagnostics/GraphDiagnostics.test.tsx',
      ]);
    });
  });
});
