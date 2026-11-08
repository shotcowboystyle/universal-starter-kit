/**
 * The alignment guides, design §7.2 S10.
 *
 * ONE `<svg>` with at most two `<line>` children, inside React Flow's viewport
 * transform, cleared the moment the drag ends. Never a div per guide: a guide
 * is a hairline across the canvas, and a div layer would need its own width,
 * its own transform, and its own rounding, all of which the viewport already
 * did for us.
 *
 * **The svg is SIZED to its lines, and that is not cosmetic.** The first
 * version was `width={0} height={0}` with `overflow: visible`, drawing in flow
 * coordinates — structurally right, and INVISIBLE in Chrome. The DOM was
 * correct (one svg, two lines, right coordinates, stroke resolved from the var
 * layer) and nothing painted, because an outermost `<svg>` clips to its own
 * viewport and a zero-sized viewport has nothing inside it. Measured on
 * `NodeGraph/Snapping → ZoomThreshold` by forcing the stroke to 6 px and
 * screenshotting: still nothing. So the layer takes the bounding box of the
 * guides, plus a small pad for the stroke, and draws in LOCAL coordinates.
 *
 * `vector-effect: non-scaling-stroke` in `css/graph.css` is what keeps a
 * hairline a hairline at 4x zoom rather than a 2 px bar.
 */

import type { SnapGuide } from '../interaction/snap-alignment';

import { ViewportPortal } from './xy';

export const snapGuidesClassName = 'mp-graph-guides';
export const snapGuideClassName = 'mp-graph-guide';

/**
 * Flow units of slack around the box. The stroke is centred on the line, so a
 * box that ends exactly on it would clip half of it away; and at a pinched-out
 * zoom the painted stroke is wider than the flow units it sits in.
 */
export const snapGuidePadding = 2;

export interface SnapGuidesBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The padded box that holds every line. Exported because the spec asserts it. */
export const snapGuidesBounds = (guides: readonly SnapGuide[]): SnapGuidesBox | null => {
  if (guides.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const guide of guides) {
    const [x1, y1, x2, y2] =
      guide.axis === 'x'
        ? [guide.position, guide.start, guide.position, guide.end]
        : [guide.start, guide.position, guide.end, guide.position];
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  return {
    x: minX - snapGuidePadding,
    y: minY - snapGuidePadding,
    width: maxX - minX + snapGuidePadding * 2,
    height: maxY - minY + snapGuidePadding * 2,
  };
};

export interface SnapGuidesProps {
  readonly guides: readonly SnapGuide[];
  /**
   * Design §7.2 S11: motion settings fade the guide, they do not turn snapping
   * off. False under `animation: "none"` and under OS reduced motion.
   */
  readonly animated?: boolean;
}

export const SnapGuides = ({ guides, animated = true }: SnapGuidesProps) => {
  const box = snapGuidesBounds(guides);
  if (!box) {
    return null;
  }
  return (
    <ViewportPortal>
      <svg
        aria-hidden="true"
        className={snapGuidesClassName}
        data-animated={animated ? 'true' : 'false'}
        width={box.width}
        height={box.height}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          // The same mechanism React Flow moves its own nodes with, so the
          // guide and the node it points at cannot round differently.
          transform: `translate(${box.x}px, ${box.y}px)`,
          overflow: 'visible',
          pointerEvents: 'none',
        }}>
        {guides.map((guide) => (
          <line
            key={guide.axis}
            className={snapGuideClassName}
            data-axis={guide.axis}
            x1={(guide.axis === 'x' ? guide.position : guide.start) - box.x}
            x2={(guide.axis === 'x' ? guide.position : guide.end) - box.x}
            y1={(guide.axis === 'x' ? guide.start : guide.position) - box.y}
            y2={(guide.axis === 'x' ? guide.end : guide.position) - box.y}
          />
        ))}
      </svg>
    </ViewportPortal>
  );
};
