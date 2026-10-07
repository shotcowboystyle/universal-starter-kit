/**
 * Design §7.2 S10, the one snapping rule that is about the DOM.
 *
 * It lives here rather than in `interaction/snapChanges.spec.ts`, where the
 * plan drafted it, for a mechanical reason: the claim is "one `<svg>` with at
 * most two `<line>` children, inside the viewport transform", and only the
 * component that renders it can be asked what it made. The other five wiring
 * rules stay pure and stay there.
 *
 * The guides are mounted inside a real `<ReactFlow>` because `ViewportPortal`
 * renders into the store's viewport node. A test that mounted the svg on its
 * own would assert the markup and prove nothing about where it lands, which is
 * the half of S10 that matters.
 */

import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SnapGuide } from '../interaction/snapAlignment';

import { SnapGuides, snapGuideClassName, snapGuidePadding, snapGuidesBounds, snapGuidesClassName } from './SnapGuides';
import { ReactFlow, ReactFlowProvider } from './xy';

afterEach(cleanup);

const xGuide: SnapGuide = {
  axis: 'x',
  position: 300,
  start: 0,
  end: 450,
  nodeId: 'c',
  movingLine: 'start',
  candidateLine: 'start',
};

const yGuide: SnapGuide = {
  axis: 'y',
  position: 200,
  start: 10,
  end: 620,
  nodeId: 'd',
  movingLine: 'center',
  candidateLine: 'end',
};

function mount(guides: readonly SnapGuide[], animated?: boolean) {
  return renderWithProviders(
    <ReactFlowProvider>
      <ReactFlow
        nodes={[]}
        edges={[]}
        proOptions={{ hideAttribution: true }}>
        <SnapGuides
          guides={guides}
          animated={animated}
        />
      </ReactFlow>
    </ReactFlowProvider>,
  );
}

describe(SnapGuides, () => {
  it('renders nothing at all when there is nothing to align to', () => {
    const { container } = mount([]);
    expect(container.querySelector(`.${snapGuidesClassName}`)).toBeNull();
  });

  it('renders ONE svg with one line for one guide', () => {
    const { container } = mount([xGuide]);
    expect(container.querySelectorAll(`.${snapGuidesClassName}`)).toHaveLength(1);
    expect(container.querySelectorAll(`.${snapGuideClassName}`)).toHaveLength(1);
  });

  it('renders ONE svg with two lines for both axes, never a layer per guide', () => {
    const { container } = mount([xGuide, yGuide]);
    expect(container.querySelectorAll(`.${snapGuidesClassName}`)).toHaveLength(1);
    expect(container.querySelectorAll(`.${snapGuideClassName}`)).toHaveLength(2);
  });

  it('puts the layer INSIDE the viewport, so pan and zoom carry it for free', () => {
    const { container } = mount([xGuide]);
    const viewport = container.querySelector('.react-flow__viewport');
    expect(viewport).not.toBeNull();
    expect(viewport?.querySelector(`.${snapGuidesClassName}`)).not.toBeNull();
  });

  it('draws a vertical line for an x guide and a horizontal one for a y guide', () => {
    const { container } = mount([xGuide, yGuide]);
    const box = snapGuidesBounds([xGuide, yGuide]);
    if (!box) {
      throw new Error('two guides have a box');
    }
    const [vertical, horizontal] = [...container.querySelectorAll(`.${snapGuideClassName}`)];
    // Local coordinates: the layer is translated to `box`, so a line's numbers
    // are its flow position minus the box origin.
    expect([
      vertical.getAttribute('x1'),
      vertical.getAttribute('x2'),
      vertical.getAttribute('y1'),
      vertical.getAttribute('y2'),
    ]).toEqual([`${300 - box.x}`, `${300 - box.x}`, `${0 - box.y}`, `${450 - box.y}`]);
    expect([
      horizontal.getAttribute('x1'),
      horizontal.getAttribute('x2'),
      horizontal.getAttribute('y1'),
      horizontal.getAttribute('y2'),
    ]).toEqual([`${10 - box.x}`, `${620 - box.x}`, `${200 - box.y}`, `${200 - box.y}`]);
  });

  it.each([[[xGuide]], [[yGuide]], [[xGuide, yGuide]]])(
    'gives the layer a box that CONTAINS every line it draws',
    (guides) => {
      // The assertion that would have caught the invisible first version. It
      // was `width={0} height={0}` with `overflow: visible`, drawing in flow
      // coordinates: correct DOM, and nothing painted, because an outermost
      // svg clips to its own viewport. Every other test in this file passed.
      const { container } = mount(guides);
      const svg = container.querySelector(`.${snapGuidesClassName}`);
      if (!svg) {
        throw new Error('a guide layer');
      }
      const width = Number(svg.getAttribute('width'));
      const height = Number(svg.getAttribute('height'));
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      for (const line of [...container.querySelectorAll(`.${snapGuideClassName}`)]) {
        for (const [attribute, extent] of [
          ['x1', width],
          ['x2', width],
          ['y1', height],
          ['y2', height],
        ] as const) {
          const value = Number(line.getAttribute(attribute));
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(extent);
        }
      }
    },
  );

  it('pads the box, so a centred stroke is not sliced in half by its own edge', () => {
    const box = snapGuidesBounds([xGuide]);
    expect(box).toEqual({
      x: 300 - snapGuidePadding,
      y: 0 - snapGuidePadding,
      width: snapGuidePadding * 2,
      height: 450 + snapGuidePadding * 2,
    });
  });

  it('has no box for no guides', () => {
    expect(snapGuidesBounds([])).toBeNull();
  });

  it('carries the animated flag, which is all motion settings get to change', () => {
    const { container } = mount([xGuide], false);
    expect(container.querySelector(`.${snapGuidesClassName}`)?.dataset.animated).toBe('false');
    cleanup();
    const on = mount([xGuide], true);
    expect(on.container.querySelector(`.${snapGuidesClassName}`)?.dataset.animated).toBe('true');
  });
});
