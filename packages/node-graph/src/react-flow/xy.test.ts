/**
 * The boundary is only worth having if it is checked.
 *
 * Two failures this catches. A React Flow upgrade that renames or drops a name
 * fails here instead of at a user's first render, because `xy.ts` is the only
 * place that names them. And a name added to `xy.ts` without a decision fails
 * the exact-set assertion, which is what keeps the re-export list from drifting
 * back into a full mirror of upstream.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

// oxlint-disable-next-line sonarjs/no-wildcard-import -- the spec enumerates the module's whole export surface
import * as xy from './xy';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const requireFromHere = createRequire(import.meta.url);

/** Every value `xy.ts` re-exports. Types are checked by `pnpm -F … typecheck`. */
const reExportedValues = [
  'applyEdgeChanges',
  'applyNodeChanges',
  'Background',
  'BaseEdge',
  'Controls',
  'EdgeLabelRenderer',
  'getBezierPath',
  'getHandlePosition',
  'getSmoothStepPath',
  'getStraightPath',
  'Handle',
  'MarkerType',
  'MiniMap',
  'Position',
  'ReactFlow',
  'ReactFlowProvider',
  'SelectionMode',
  'useEdgesState',
  'useNodesState',
  'useReactFlow',
  'useStore',
  'useStoreApi',
  'useUpdateNodeInternals',
  'ViewportPortal',
] as const;

interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const parseVersion = (value: string): SemVer => {
  const groups = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/u.exec(value)?.groups;
  if (!groups) {
    throw new Error(`not a semver: ${value}`);
  }
  return { major: Number(groups.major), minor: Number(groups.minor), patch: Number(groups.patch) };
};

/**
 * Caret ranges only, on purpose. A range this cannot read is a range nobody
 * reasoned about, so it fails loudly rather than passing silently.
 */
const satisfiesCaret = (version: string, range: string): boolean => {
  const caret = /^\^(?<version>\d+\.\d+\.\d+)$/u.exec(range)?.groups;
  if (!caret) {
    throw new Error(`declared range is not a caret range: ${range}`);
  }
  const min = parseVersion(caret.version);
  const actual = parseVersion(version);
  if (actual.major !== min.major) {
    return false;
  }
  if (actual.minor !== min.minor) {
    return actual.minor > min.minor;
  }
  return actual.patch >= min.patch;
};

/**
 * `@xyflow/system` does not put `./package.json` in its exports map — unlike
 * `@xyflow/react`, which does — so `require("@xyflow/system/package.json")`
 * throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the entry and walk up to the
 * manifest that owns it instead, which also proves the version read is the
 * version this process would actually import.
 */
const installedSystemVersion = (): string => {
  let dir = path.dirname(requireFromHere.resolve('@xyflow/system'));
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf-8')) as { name?: string; version: string };
      if (pkg.name === '@xyflow/system') {
        return pkg.version;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('no @xyflow/system package.json above its resolved entry');
    }
    dir = parent;
  }
};

let declaredRange: string;
let declaredSystemPin: string;

describe('the @xyflow boundary', () => {
  beforeAll(async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    declaredRange = pkg.dependencies['@xyflow/react'];
    declaredSystemPin = pkg.dependencies['@xyflow/system'];
  });

  it('defines every re-exported name', () => {
    for (const name of reExportedValues) {
      // oxlint-disable-next-line import/namespace -- `name` ranges over the declared re-export list on purpose
      expect(xy[name], name).toBeDefined();
    }
  });

  it('re-exports exactly the decided set, plus the four constants, and nothing else', () => {
    expect(Object.keys(xy).toSorted()).toStrictEqual(
      [
        ...reExportedValues,
        'xyflowVersion',
        'reactFlowPaneSelector',
        'reactFlowNodeSelector',
        'reactFlowViewportSelector',
      ].toSorted(),
    );
  });

  it('owns the pane class name, because a class is part of the DOM contract', () => {
    // The long press finds the pane by class (`use-lasso-select.ts`). That is a
    // DOM lookup rather than a paint rule, so `checkGraphVarsCoverage` exempts
    // THIS file for it — and the exemption is only worth having if the string
    // is actually here. Pinned so a refactor that inlines it back at the call
    // site fails here rather than at the next @xyflow upgrade, silently.
    expect(xy.reactFlowPaneSelector).toBe('.react-flow__pane');
  });

  it('owns the node class name too, for the same reason', () => {
    // `NodeGraph/AutoLayout`'s position stamp finds nodes by class to read
    // their CSS transform — React Flow places a node with a transform and
    // never with a layout offset, so a stamp built on `offsetLeft` is a
    // constant. Same boundary, same pin.
    expect(xy.reactFlowNodeSelector).toBe('.react-flow__node');
  });

  it('owns the viewport class name, which is what `didMove` is read from', () => {
    // The frame sampler compares this element's transform at the first sample
    // against the last (design 13.2). A rename would make the probe return
    // `null`, every run would report `didMove: false`, and a whole session of
    // measurement would be discarded for a reason nobody could see.
    expect(xy.reactFlowViewportSelector).toBe('.react-flow__viewport');
  });

  it('declares the version diagnostics reports, and it is the INSTALLED one', () => {
    // Design 9.5 has to report a version, only this file may reach @xyflow, and
    // a literal that drifts from the installed package is worse than no version
    // at all — it would send a reader chasing the wrong changelog.
    const installed = requireFromHere('@xyflow/react/package.json') as { version: string };
    expect(xy.xyflowVersion).toBe(installed.version);
  });

  it('pins @xyflow/system to exactly what @xyflow/react pins', () => {
    // `getHandlePosition` comes straight from `@xyflow/system` — React Flow
    // does not re-export it, and it is the function the 44pt endpoint law is
    // asserted against (design 7.1 H2). Two copies of that package on one
    // canvas would mean the law is proved against a DIFFERENT implementation
    // than the one drawing the edges: a green test over a broken graph. An
    // exact pin equal to React Flow's own is what keeps them one module.
    const reactPkg = requireFromHere('@xyflow/react/package.json') as {
      dependencies: Record<string, string>;
    };
    expect(declaredSystemPin).toBe(reactPkg.dependencies['@xyflow/system']);
    expect(installedSystemVersion()).toBe(declaredSystemPin);
  });

  it('has an installed @xyflow/react inside the declared range', () => {
    const installed = requireFromHere('@xyflow/react/package.json') as { version: string };
    expect(declaredRange).toBeDefined();
    expect(
      satisfiesCaret(installed.version, declaredRange),
      `installed ${installed.version} is outside ${declaredRange}`,
    ).toBe(true);
  });
});
