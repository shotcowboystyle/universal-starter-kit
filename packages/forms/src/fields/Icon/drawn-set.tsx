import { Circle, Line, Path, Polyline, Rect, Svg } from 'react-native-svg';
import { useTheme } from 'tamagui';

import type { DrawnIconName } from './drawn-icon-names';

/**
 * The drawn icon set — geometries lifted from design-mockups-v3/iconset.py
 * (console `_icons.html` lucide stroke: 24 viewBox, stroke 2 round-capped,
 * check at 2.5). This lane consumes that set; it does not grow it.
 */

type GlyphPrimitive =
  | { kind: 'polyline'; points: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; filled?: boolean };

interface IconGeom {
  strokeWidth: number;
  fillStroke: boolean;
  primitives: readonly GlyphPrimitive[];
}

const STROKE = 2;
const STROKE_CHECK = 2.5;

const GEOM: Record<DrawnIconName, IconGeom> = {
  'chev-d': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [{ kind: 'polyline', points: '6 9 12 15 18 9' }],
  },
  'chev-r': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [{ kind: 'polyline', points: '9 6 15 12 9 18' }],
  },
  'chev-l': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [{ kind: 'polyline', points: '15 6 9 12 15 18' }],
  },
  x: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
      { kind: 'line', x1: 6, y1: 6, x2: 18, y2: 18 },
    ],
  },
  check: {
    strokeWidth: STROKE_CHECK,
    fillStroke: true,
    primitives: [{ kind: 'polyline', points: '5 12 10 17 19 8' }],
  },
  warn: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'path', d: 'M12 3 2 20h20z' },
      { kind: 'line', x1: 12, y1: 10, x2: 12, y2: 14 },
      { kind: 'circle', cx: 12, cy: 17, r: 0.8, filled: true },
    ],
  },
  'arr-d': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 12, y1: 4, x2: 12, y2: 18 },
      { kind: 'polyline', points: '6 12 12 18 18 12' },
    ],
  },
  copy: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'rect', x: 9, y: 9, width: 12, height: 12, rx: 2 },
      { kind: 'path', d: 'M5 15V5a2 2 0 0 1 2-2h10' },
    ],
  },
  disk: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'rect', x: 3, y: 4, width: 18, height: 16, rx: 2 },
      { kind: 'line', x1: 3, y1: 14, x2: 21, y2: 14 },
      { kind: 'circle', cx: 7, cy: 17, r: 1, filled: true },
    ],
  },
  grip: {
    strokeWidth: 0,
    fillStroke: false,
    primitives: [
      { kind: 'circle', cx: 9, cy: 6, r: 1.5, filled: true },
      { kind: 'circle', cx: 15, cy: 6, r: 1.5, filled: true },
      { kind: 'circle', cx: 9, cy: 12, r: 1.5, filled: true },
      { kind: 'circle', cx: 15, cy: 12, r: 1.5, filled: true },
      { kind: 'circle', cx: 9, cy: 18, r: 1.5, filled: true },
      { kind: 'circle', cx: 15, cy: 18, r: 1.5, filled: true },
    ],
  },
  'chev-u': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [{ kind: 'polyline', points: '6 15 12 9 18 15' }],
  },
  'arr-u': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 12, y1: 20, x2: 12, y2: 6 },
      { kind: 'polyline', points: '6 12 12 6 18 12' },
    ],
  },
  'arr-r': {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 4, y1: 12, x2: 18, y2: 12 },
      { kind: 'polyline', points: '12 6 18 12 12 18' },
    ],
  },
  upload: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 12, y1: 17, x2: 12, y2: 5 },
      { kind: 'polyline', points: '6 11 12 5 18 11' },
      { kind: 'line', x1: 4, y1: 20, x2: 20, y2: 20 },
    ],
  },
  mail: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'rect', x: 3, y: 5, width: 18, height: 14, rx: 2 },
      { kind: 'path', d: 'm3 8 9 6 9-6' },
    ],
  },
  menu: {
    strokeWidth: STROKE,
    fillStroke: true,
    primitives: [
      { kind: 'line', x1: 4, y1: 6, x2: 20, y2: 6 },
      { kind: 'line', x1: 4, y1: 12, x2: 20, y2: 12 },
      { kind: 'line', x1: 4, y1: 18, x2: 20, y2: 18 },
    ],
  },
};

/**
 * The glyph paint is resolved here, never left as `currentColor`.
 *
 * react-native-svg has no CSS cascade. iOS resolves `currentColor` in
 * RNSVGRenderable's getCurrentColor: self.color, else the parent Svg's color,
 * else NIL. DrawnIcon passed no color to its own Svg, so the stroke arrived
 * nil, CGContextSetStrokeColorWithColor kept whatever was last in the Core
 * Graphics context, and the picker grid painted one glyph bright and the rest
 * near-black by draw order.
 *
 * A Tamagui token fails one step earlier for the same reason: react-native-svg
 * wants a color VALUE, so "$color11" would reach Core Graphics unparsed.
 */
const drawnIconInkToken = 'color11';

// oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- a theme Variable's `val` is untyped; only a string is a usable paint
const asPaint = (candidate: unknown): string | undefined => (typeof candidate === 'string' ? candidate : undefined);

const useDrawnInk = (color?: string): string => {
  const theme = useTheme();
  const raw = color === undefined || color === '' || color === 'currentColor' ? `$${drawnIconInkToken}` : color;
  const val = raw.startsWith('$') ? asPaint(theme[raw.slice(1)]?.val) : raw;
  // An unknown consumer token falls back to the active theme's readable ink.
  const fallback = asPaint(theme[drawnIconInkToken]?.val) ?? asPaint(theme.color?.val);
  // Outside a theme both lookups miss. Returning undefined was the original bug:
  // react-native-svg takes it as nil and Core Graphics paints with whatever
  // stroke was last in the context. A mid neutral is visible on both schemes.
  return val ?? fallback ?? '#808080';
};

export const DrawnIcon = ({ name, size = 16, color }: { name: DrawnIconName; size?: number; color?: string }) => {
  const ink = useDrawnInk(color);
  const geom = GEOM[name];
  const stroke = geom.fillStroke ? ink : 'none';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      // Also the parent colour, so any nested `currentColor` resolves to ink
      // instead of nil.
      color={ink}
      pointerEvents="none"
      aria-hidden>
      {geom.primitives.map((primitive, index) => {
        const key = `${name}-${index}`;
        if (primitive.kind === 'polyline') {
          return (
            <Polyline
              key={key}
              points={primitive.points}
              fill="none"
              stroke={stroke}
              strokeWidth={geom.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (primitive.kind === 'line') {
          return (
            <Line
              key={key}
              x1={primitive.x1}
              y1={primitive.y1}
              x2={primitive.x2}
              y2={primitive.y2}
              fill="none"
              stroke={stroke}
              strokeWidth={geom.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (primitive.kind === 'path') {
          return (
            <Path
              key={key}
              d={primitive.d}
              fill="none"
              stroke={stroke}
              strokeWidth={geom.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (primitive.kind === 'rect') {
          return (
            <Rect
              key={key}
              x={primitive.x}
              y={primitive.y}
              width={primitive.width}
              height={primitive.height}
              rx={primitive.rx}
              fill="none"
              stroke={stroke}
              strokeWidth={geom.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        return (
          <Circle
            key={key}
            cx={primitive.cx}
            cy={primitive.cy}
            r={primitive.r}
            fill={primitive.filled ? ink : 'none'}
            stroke={primitive.filled ? 'none' : stroke}
            strokeWidth={primitive.filled ? 0 : geom.strokeWidth}
          />
        );
      })}
    </Svg>
  );
};
