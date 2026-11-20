/**
 * Task 1.8, the rendered half. Through `renderWithProviders` under a REAL
 * `<Preset overrides>`, so the knob path under test is the resolver with its
 * context stack — AC-3's actual claim — not the pure functions.
 *
 * Four assertions, each from the plan:
 *  - computed radius matches `resolveRadiusForPart` CONTAINER-CAP at all five
 *    radius stops;
 *  - no hex literal in any computed style;
 *  - computed `overflow` is not `hidden` (design §7.1 H6);
 *  - `useUpdateNodeInternals` fires exactly once when `ports` identity changes
 *    and ZERO times on a pure knob flip.
 *
 * `@xyflow/react` never appears here: the boundary module `../react-flow/xy`
 * is what gets mocked, which is the point of having one import site.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { Preset, resolveRadiusForPart, Surface, useResolvedKnobs } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declarationFor, hexLiteralsIn, paintDeclarationCount } from '../../tests/styles';
import type { useUpdateNodeInternals } from '../react-flow/xy';

import { containerRadiusPx, nodePanelPaddingPx } from './node-measure';
import type { GraphNodePort } from './node-measure';

const updateNodeInternals = vi.fn<ReturnType<typeof useUpdateNodeInternals>>();

vi.mock(import('../react-flow/xy'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useUpdateNodeInternals: () => updateNodeInternals };
});

const { GraphNode } = await import('./GraphNode');

const radiusStops = ['none', 'small', 'medium', 'large', 'full'] as const satisfies readonly Knobs['borderRadius'][];
const spaces = ['small', 'medium', 'large'] as const satisfies readonly Knobs['space'][];

const renderNode = (ui: ReactElement, overrides?: Partial<Knobs>) =>
  renderWithProviders(
    <Preset
      cascade={false}
      overrides={overrides}>
      <Surface
        size="medium"
        density="comfortable">
        {ui}
      </Surface>
    </Preset>,
  );

const frameOf = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('[data-graph-node]');
  if (!el) {
    throw new Error('GraphNode did not render a frame');
  }
  return el as HTMLElement;
};

const twoPorts: GraphNodePort[] = [
  { id: 'in', side: 'left', direction: 'in', label: 'input' },
  { id: 'out', side: 'right', direction: 'out', label: 'output' },
];

type ResolvedKnobs = ReturnType<typeof useResolvedKnobs>;

const ResolvedProbe = ({ onResolve }: { readonly onResolve: (knobs: ResolvedKnobs) => void }) => {
  onResolve(useResolvedKnobs({ component: 'GraphNode' }));
  return null;
};

/** The resolver's own fragments, read through the real context stack. */
const renderResolved = (overrides: Partial<Knobs>) => {
  const renders: ResolvedKnobs[] = [];
  renderWithProviders(
    <Preset
      cascade={false}
      overrides={overrides}>
      <Surface
        size="medium"
        density="comfortable">
        <ResolvedProbe onResolve={(knobs) => renders.push(knobs)} />
      </Surface>
    </Preset>,
  );
  const result = renders.at(-1);
  if (result === undefined) {
    throw new Error('ResolvedProbe never rendered');
  }
  return { result };
};

describe('GraphNode', () => {
  beforeEach(() => updateNodeInternals.mockClear());
  afterEach(cleanup);

  describe('radius: CONTAINER-CAP at all five stops, measured on the rendered frame', () => {
    it.each(radiusStops)('resolves %s through the doctrine table', (borderRadius) => {
      for (const space of spaces) {
        const { container } = renderNode(
          <GraphNode
            id="n1"
            title="Transform"
          />,
          {
            borderRadius,
            space,
          },
        );
        const frame = frameOf(container);
        const expected = resolveRadiusForPart({
          radiusClass: 'CONTAINER-CAP',
          stop: borderRadius,
          paddingPx: nodePanelPaddingPx[space],
        }).px;
        expect(frame.dataset.graphNodeRadius).toBe(String(expected));
        cleanup();
      }
    });

    it('paints that same radius — the emitted declaration, not just the attribute', () => {
      for (const borderRadius of radiusStops) {
        for (const space of spaces) {
          const { container } = renderNode(
            <GraphNode
              id="n1"
              title="Transform"
            />,
            {
              borderRadius,
              space,
            },
          );
          const frame = frameOf(container);
          const painted = declarationFor(frame, 'border-top-left-radius') ?? '';
          expect(painted, `${borderRadius}/${space} paints no radius at all`).not.toBe('');
          const reported = Number(frame.dataset.graphNodeRadius);
          // happy-dom does not resolve custom properties, so a token-valued
          // declaration reads back as `var(--t-radius-N)`. Decode it the same
          // way the component does and require the two to agree.
          const token = /^var\(--(?:t-)?radius-(?<stop>\d+)\)$/u.exec(painted);
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- `painted` is a CSS length ("9px"); Number() would read it as NaN
          const paintedPx = token ? containerRadiusPx(`$${token[1]}`) : Number.parseFloat(painted);
          expect(paintedPx, `${borderRadius}/${space} painted ${painted}`).toBe(reported);
          cleanup();
        }
      }
    });
  });

  describe('no hex literal in any computed style', () => {
    it('paints every color through a token, at every radius stop and both intents', () => {
      for (const borderRadius of radiusStops) {
        for (const intent of [undefined, 'error']) {
          const { container } = renderNode(
            <GraphNode
              id="n1"
              title="Transform"
              subtitle="two ports"
              ports={twoPorts}
              intent={intent}
            />,
            { borderRadius },
          );
          // A hex sweep over a tree that paints nothing passes for the wrong
          // reason. Prove there is paint to sweep first.
          expect(paintDeclarationCount(container)).toBeGreaterThan(0);
          expect(hexLiteralsIn(container)).toStrictEqual([]);
          cleanup();
        }
      }
    });
  });

  describe('§7.1 H6: the frame does not clip its handles', () => {
    it('never computes overflow hidden on the frame or a port row', () => {
      const { container } = renderNode(
        <GraphNode
          id="n1"
          title="Transform"
          ports={twoPorts}
        />,
      );
      // happy-dom leaves the `overflow` shorthand empty because Tamagui writes
      // the long-hands, so assert what is actually there.
      for (const el of [frameOf(container), ...container.querySelectorAll('[data-graph-node-port-row]')]) {
        const style = getComputedStyle(el as HTMLElement);
        expect(style.overflow).not.toBe('hidden');
        expect(style.overflowX).not.toBe('hidden');
        expect(style.overflowY).not.toBe('hidden');
      }
    });

    it('declares overflow visible rather than merely leaving it unset', () => {
      const { container } = renderNode(
        <GraphNode
          id="n1"
          title="Transform"
        />,
      );
      expect(getComputedStyle(frameOf(container)).overflowX).toBe('visible');
      expect(getComputedStyle(frameOf(container)).overflowY).toBe('visible');
    });

    it('is the containing block for its own ports', () => {
      // A `static` frame hands React Flow's absolutely positioned handles to
      // whatever ancestor happens to be positioned. Caught in Storybook: every
      // port marker piled up in the page corner instead of on the node edge.
      const { container } = renderNode(
        <GraphNode
          id="n1"
          title="Transform"
          ports={twoPorts}
        />,
      );
      expect(declarationFor(frameOf(container), 'position')).toBe('relative');
    });
  });

  describe('useUpdateNodeInternals fires on a port change and never on a knob flip', () => {
    it('does not fire on mount — React Flow measures a fresh node itself', () => {
      renderNode(
        <GraphNode
          id="n1"
          title="Transform"
          ports={twoPorts}
        />,
      );
      expect(updateNodeInternals).toHaveBeenCalledTimes(0);
    });

    it('fires exactly once when the ports array identity changes', () => {
      const { rerender } = renderNode(
        <GraphNode
          id="n1"
          title="Transform"
          ports={twoPorts}
        />,
      );
      expect(updateNodeInternals).toHaveBeenCalledTimes(0);

      const grown: GraphNodePort[] = [...twoPorts, { id: 'err', side: 'right', direction: 'out', label: 'error' }];
      rerender(
        <Preset cascade={false}>
          <Surface
            size="medium"
            density="comfortable">
            <GraphNode
              id="n1"
              title="Transform"
              ports={grown}
            />
          </Surface>
        </Preset>,
      );
      expect(updateNodeInternals).toHaveBeenCalledExactlyOnceWith('n1');
    });

    it('does NOT fire on a pure knob flip that keeps the same ports array', () => {
      const { rerender } = renderNode(
        <GraphNode
          id="n1"
          title="Transform"
          ports={twoPorts}
        />,
        {
          borderRadius: 'none',
          space: 'small',
        },
      );
      expect(updateNodeInternals).toHaveBeenCalledTimes(0);

      rerender(
        <Preset
          cascade={false}
          overrides={{ borderRadius: 'full', space: 'large', size: 'large' }}>
          <Surface
            size="medium"
            density="comfortable">
            <GraphNode
              id="n1"
              title="Transform"
              ports={twoPorts}
            />
          </Surface>
        </Preset>,
      );
      // The flip must actually have restyled the node, or this proves nothing.
      expect(frameOf(document.body).dataset.graphNodeRadius).toBe(String(nodePanelPaddingPx.large));
      expect(updateNodeInternals).toHaveBeenCalledTimes(0);
    });
  });

  describe('the title ink honors bodyFont, not headingFont (§11 fonts)', () => {
    /**
     * Found by the MPO-191 knob fuzz, not by a spec. The title used to spread
     * `knobProps.heading` and then `knobProps.label`; `label` carries
     * `fontFamily: bodyFontValue` (`resolveKnobs.ts:648`), so the SECOND spread
     * won and the title painted the body face — which is what design §11
     * declares, but only by spread order. Swapping the two lines would have
     * flipped a documented law with nothing failing.
     *
     * What is asserted here is the PREMISE, not the paint. Tamagui emits no
     * `font-family` declaration on the text element under happy-dom at all
     * (measured: the title's only classes are size, color, weight and overflow —
     * the family is inherited from an ancestor `font_*` scope), so the rendered
     * law is checked in Chrome and recorded in
     * `docs/design/knob-fuzz-wave4-node-graph.md`. The premise — that `label` is
     * a body-font fragment and `heading` is not — is what could change under us
     * silently, and it is checkable here.
     */
    it('label is the body fragment and heading is not, which is why the law reads as it does', () => {
      const { result } = renderResolved({ headingFont: 'mono', bodyFont: 'serif' });
      expect(result.knobProps.label.fontFamily).toBe(result.knobProps.body.fontFamily);
      expect(result.knobProps.label.fontFamily).not.toBe(result.knobProps.heading.fontFamily);
    });

    it('the title spreads exactly one typography fragment', () => {
      // A second fragment is how the order became load-bearing in the first
      // place. `GraphNode.tsx` carries the reason beside the line.
      const source = readFileSync(path.join(import.meta.dirname, 'GraphNode.tsx'), 'utf-8');
      const title = /<SizableText(?<attrs>[^>]*)data-graph-node-title/su.exec(source);
      expect(title, 'GraphNode no longer renders a data-graph-node-title').not.toBeNull();
      const spreads = title![1].match(/\{\.\.\.knobProps\.\w+\}/gu) ?? [];
      expect(spreads).toStrictEqual(['{...knobProps.label}']);
    });
  });
});
