/**
 * The four typed edge kinds, design §4.4.
 *
 * "Handle different types of edges" is the requirement, and the thing that
 * makes it real is that a user can TELL THEM APART on a canvas — so the
 * property below is pairwise distinguishability, not four of everything.
 *
 * A contradiction the plan and the design do not agree on, recorded rather
 * than silently resolved: plan task 1.10 says the four kinds map to "four
 * distinct path functions and four distinct token strokes", but design §4.4's
 * own table gives THREE of each — `flow` and `error` share `smoothstep`, and
 * `data` and `conditional` share `$color8`. The table is the more specific
 * artifact and it carries a "reads as" column giving each choice a reason, so
 * the table wins and the counts are asserted at three. Every pair is still
 * distinguishable, because the pairs that share one column differ in two
 * others. If Clay wants four of each, that is a design change with two new
 * choices in it, not a spec edit.
 */

import { describe, expect, it } from 'vitest';

import { createGraphSchema, defaultRules, validateConnection } from '../model/index';
import type { GraphDocument } from '../model/index';

import { builtinEdgeKindNames, builtinEdgeKinds } from './edge-kinds';
import type { BuiltinEdgeData, BuiltinEdgeKind } from './edge-kinds';
import {
  edgeAppearances,
  edgeMarkerEnd,
  edgeStrokeWidth,
  edgeStrokeWidths,
  resolveEdgeStyle,
  themeTokenName,
} from './edge-style';

const hex = /#[0-9a-f]{3,8}\b/iu;

describe('the table in design §4.4', () => {
  it('is exactly what the code carries', () => {
    expect(edgeAppearances).toStrictEqual({
      flow: { path: 'smoothstep', stroke: '$color9', marker: 'arrowclosed' },
      data: { path: 'bezier', stroke: '$color8', marker: 'arrow' },
      error: { path: 'smoothstep', stroke: '$red9', dash: '6 4', marker: 'arrowclosed' },
      conditional: { path: 'step', stroke: '$color8', dash: '2 4', marker: 'arrow' },
    });
  });

  it('names four kinds and no more', () => {
    expect(builtinEdgeKindNames).toStrictEqual(['flow', 'data', 'error', 'conditional']);
    expect(Object.keys(builtinEdgeKinds).toSorted()).toStrictEqual([...builtinEdgeKindNames].toSorted());
  });
});

const fingerprint = (kind: BuiltinEdgeKind) => JSON.stringify(edgeAppearances[kind]);

describe('the four kinds are pairwise distinguishable', () => {
  it('no two share the whole (path, stroke, dash, marker) tuple', () => {
    const seen = new Set(builtinEdgeKindNames.map(fingerprint));
    expect(seen.size).toBe(4);
  });

  it('the pairs that share one column differ in two others', () => {
    // flow / error share `smoothstep`, and differ by stroke AND dash.
    expect(edgeAppearances.flow.path).toBe(edgeAppearances.error.path);
    expect(edgeAppearances.flow.stroke).not.toBe(edgeAppearances.error.stroke);
    expect(edgeAppearances.flow.dash).not.toBe(edgeAppearances.error.dash);
    // data / conditional share `$color8`, and differ by path AND dash.
    expect(edgeAppearances.data.stroke).toBe(edgeAppearances.conditional.stroke);
    expect(edgeAppearances.data.path).not.toBe(edgeAppearances.conditional.path);
    expect(edgeAppearances.data.dash).not.toBe(edgeAppearances.conditional.dash);
  });

  it('uses three path functions and three strokes, per the table, not four', () => {
    // Asserted so a later edit toward "four distinct" is a deliberate change to
    // this line rather than a drift nobody noticed.
    expect(new Set(builtinEdgeKindNames.map((k) => edgeAppearances[k].path)).size).toBe(3);
    expect(new Set(builtinEdgeKindNames.map((k) => edgeAppearances[k].stroke)).size).toBe(3);
  });
});

describe('no hex anywhere', () => {
  it('every stroke is a token expression', () => {
    for (const kind of builtinEdgeKindNames) {
      const { stroke } = edgeAppearances[kind];
      expect(stroke, kind).toMatch(/^\$/u);
      expect(stroke, kind).not.toMatch(hex);
      expect(stroke, kind).not.toContain('color-mix(');
    }
  });

  it('holds for the whole appearance table serialized', () => {
    const serialized = JSON.stringify(edgeAppearances);
    expect(serialized).not.toMatch(hex);
    expect(serialized).not.toContain('color-mix(');
  });

  it('holds for every resolved style, at every knob combination', () => {
    for (const kind of builtinEdgeKindNames) {
      for (const borderWidth of ['none', 'small', 'medium', 'large'] as const) {
        for (const animation of ['none', 'quick'] as const) {
          const style = JSON.stringify(resolveEdgeStyle({ kind, borderWidth, animation }));
          expect(style, `${kind}/${borderWidth}/${animation}`).not.toMatch(hex);
        }
      }
    }
  });
});

describe('the borderWidth knob', () => {
  it('remaps to 1 / 1.5 / 2 / 3', () => {
    // An edge is a STROKE, not a border. `borderWidthMap` in the theme is
    // 0 / 0.5 / 1 / 2 (`public/theme/src/theme/resolveKnobs.ts:90`), and a
    // 0-width edge erases the graph's primary information. §11 calls this a
    // remap for exactly that reason, and NOT a floor to hairlineWidth, which
    // is dividers-only by its own header.
    expect(edgeStrokeWidths).toStrictEqual({ none: 1, small: 1.5, medium: 2, large: 3 });
  });

  it('never resolves to 0, at any stop', () => {
    for (const stop of ['none', 'small', 'medium', 'large'] as const) {
      expect(edgeStrokeWidth(stop), stop).toBeGreaterThan(0);
    }
  });

  it('reaches the resolved style', () => {
    expect(resolveEdgeStyle({ kind: 'flow', borderWidth: 'none', animation: 'quick' }).strokeWidth).toBe(1);
    expect(resolveEdgeStyle({ kind: 'flow', borderWidth: 'large', animation: 'quick' }).strokeWidth).toBe(3);
  });

  it('moves every edge kind with one flip', () => {
    // Stroke width is not per kind, by design §4.4's last line.
    for (const kind of builtinEdgeKindNames) {
      expect(resolveEdgeStyle({ kind, borderWidth: 'large', animation: 'quick' }).strokeWidth).toBe(3);
    }
  });
});

describe('the animation knob', () => {
  it('stops the dash at "none"', () => {
    const still = resolveEdgeStyle({ kind: 'error', borderWidth: 'medium', animation: 'none' });
    expect(still.animation).toBe('none');
  });

  it("keeps the dash PATTERN, because that is the kind's identity", () => {
    // Stopping the march is not the same as erasing the dashes. An `error`
    // edge that stops dashing and also goes solid is indistinguishable from a
    // `flow` edge with a different color, and reduced-motion users would lose
    // a channel rather than an animation.
    const still = resolveEdgeStyle({ kind: 'error', borderWidth: 'medium', animation: 'none' });
    expect(still.strokeDasharray).toBe('6 4');
  });

  it('marches on a dashed kind when the knob is not none', () => {
    const marching = resolveEdgeStyle({ kind: 'error', borderWidth: 'medium', animation: 'quick' });
    expect(marching.animation).not.toBe('none');
    expect(marching.animation).toContain('mp-graph-dash');
  });

  it('is "none" for an undashed kind whatever the knob says', () => {
    // There is nothing to march.
    for (const kind of ['flow', 'data'] as const) {
      expect(resolveEdgeStyle({ kind, borderWidth: 'medium', animation: 'quick' }).animation, kind).toBe('none');
      expect(resolveEdgeStyle({ kind, borderWidth: 'medium', animation: 'quick' }).strokeDasharray).toBeUndefined();
    }
  });
});

describe(themeTokenName, () => {
  it('strips the $ so a renderer can look the token up', () => {
    // Measured, not assumed: with the raw token in the SVG `stroke` the
    // computed value is `none` — an invalid declaration is dropped, and React
    // Flow's own `.react-flow__edge-path` rule resolves to nothing because its
    // `--xy-edge-stroke` is undefined until task 1.7's bridge writes it. The
    // edges were invisible in the story until this landed.
    expect(themeTokenName('$color9')).toBe('color9');
    expect(themeTokenName('$red9')).toBe('red9');
  });

  it('leaves a value that is already a plain name alone', () => {
    expect(themeTokenName('currentColor')).toBe('currentColor');
  });

  it('names a real key for every kind', () => {
    for (const kind of builtinEdgeKindNames) {
      expect(themeTokenName(edgeAppearances[kind].stroke), kind).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
    }
  });
});

describe('the marker', () => {
  it('matches the table, and is read where the EDGE is built', () => {
    // React Flow builds its marker defs from the edges array and hands the
    // component a resolved `url(#...)`, so `BaseEdge` cannot choose a type.
    for (const kind of builtinEdgeKindNames) {
      expect(edgeMarkerEnd({ kind }), kind).toStrictEqual({ type: edgeAppearances[kind].marker });
    }
    expect(edgeMarkerEnd({ kind: 'flow' })).toStrictEqual({ type: 'arrowclosed' });
    expect(edgeMarkerEnd({ kind: 'data' })).toStrictEqual({ type: 'arrow' });
  });

  it("falls back to flow's marker for an unknown kind", () => {
    expect(edgeMarkerEnd({ kind: 'bespoke' })).toStrictEqual({ type: 'arrowclosed' });
    expect(edgeMarkerEnd({ kind: 'bespoke', appearance: 'data' })).toStrictEqual({ type: 'arrow' });
  });
});

describe('an unknown kind', () => {
  it('falls back to flow rather than rendering nothing', () => {
    // A consumer schema may define a kind with no appearance of its own. An
    // edge that does not paint is worse than one that paints plainly.
    expect(resolveEdgeStyle({ kind: 'bespoke', borderWidth: 'medium', animation: 'quick' })).toStrictEqual(
      resolveEdgeStyle({ kind: 'flow', borderWidth: 'medium', animation: 'quick' }),
    );
  });

  it('honors an explicit appearance name from the kind spec', () => {
    expect(
      resolveEdgeStyle({
        kind: 'bespoke',
        appearance: 'error',
        borderWidth: 'medium',
        animation: 'quick',
      }).stroke,
    ).toBe('$red9');
  });
});

describe('a refused connection', () => {
  // The `Refused` story shows this message next to the edge that would not be
  // made, so the code and the wording are part of this task, not the model's.
  // oxlint-disable-next-line typescript/consistent-type-definitions -- must stay an alias: interfaces lack the implicit index signature the NodeKindDefs/EdgeKindDefs constraint needs
  type Nodes = {
    readonly source: Record<string, never>;
    readonly sink: Record<string, never>;
  };

  const schema = createGraphSchema<Nodes, BuiltinEdgeData>({
    id: 'edges-story',
    nodes: {
      source: {
        kind: 'source',
        render: () => null,
        defaultData: {},
        measure: { width: 172, minHeight: 48 },
        ports: [{ id: 'out', side: 'right', direction: 'out', dataType: 'number' }],
      },
      sink: {
        kind: 'sink',
        render: () => null,
        defaultData: {},
        measure: { width: 172, minHeight: 48 },
        ports: [{ id: 'in', side: 'left', direction: 'in', dataType: 'string' }],
      },
    },
    edges: builtinEdgeKinds,
    rules: defaultRules,
  });

  const doc: GraphDocument<Nodes, BuiltinEdgeData> = {
    version: 1,
    nodes: [
      { id: 'a', kind: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', kind: 'sink', position: { x: 260, y: 0 }, data: {} },
    ],
    edges: [],
  };

  it('carries the code and a message a human can read', () => {
    const verdict = validateConnection({
      document: doc,
      schema,
      source: { node: 'a', port: 'out' },
      target: { node: 'b', port: 'in' },
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) {
      return;
    }
    expect(verdict.code).toBe('data-type-mismatch');
    expect(verdict.message).toBe('a number output does not fit a string input');
  });

  it('refuses the reverse direction with its own code', () => {
    const verdict = validateConnection({
      document: doc,
      schema,
      source: { node: 'b', port: 'in' },
      target: { node: 'a', port: 'out' },
    });
    expect(verdict).toStrictEqual(expect.objectContaining({ ok: false, code: 'wrong-direction' }));
  });
});
