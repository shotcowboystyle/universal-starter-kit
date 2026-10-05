/**
 * SVG rendering bridge for charts.
 *
 * All chart marks render through `@tamagui/react-native-svg`, which is a
 * platform-split shim already shipped by this package (icons use it today):
 *
 * - web → thin `createElement("rect" | "path" | …)` wrappers, i.e. plain
 *   inline DOM SVG — no react-native-svg needed in web bundles, works in the
 *   web Storybook (Vite) as-is;
 * - native → re-exports the real `react-native-svg` (optional peer of this
 *   package; already installed by the apps), so the native Storybook renders
 *   the same components through RNSVG.
 *
 * The shim ships no types, so exports are cast to the react-native-svg
 * component types (same pattern as `images/Svg`): props are written in the
 * RNSVG dialect, whose attribute names mirror React-DOM's camelCase SVG
 * attributes, keeping one prop spelling valid on both renderers.
 */

import { isWeb } from '@repo/platform';
import {
  Circle as TCircle,
  Defs as TDefs,
  G as TG,
  Line as TLine,
  Mask as TMask,
  Path as TPath,
  Rect as TRect,
  Svg as TSvg,
  Text as TSvgText,
} from '@tamagui/react-native-svg';
import type {
  Circle as RNCircle,
  Defs as RNDefs,
  G as RNG,
  Line as RNLine,
  Mask as RNMask,
  Path as RNPath,
  Rect as RNRect,
  Svg as RNSvg,
  Text as RNSvgText,
} from 'react-native-svg';

export const Svg = TSvg as unknown as typeof RNSvg;
export const Defs = TDefs as unknown as typeof RNDefs;
export const Mask = TMask as unknown as typeof RNMask;
export const G = TG as unknown as typeof RNG;
export const Rect = TRect as unknown as typeof RNRect;
export const Circle = TCircle as unknown as typeof RNCircle;
export const Line = TLine as unknown as typeof RNLine;
export const Path = TPath as unknown as typeof RNPath;
export const SvgText = TSvgText as unknown as typeof RNSvgText;

/** Accessible-image props for the chart root (Axiom 12). */
export interface ChartProofDeclaration {
  kind: 'bar' | 'pie' | 'donut' | 'line' | 'area';
  separated: boolean;
  datumText: boolean;
  datumCount: number;
  datumValues?: Array<[string, string]>;
}

export function chartRootA11yProps(label: string, proof?: ChartProofDeclaration): Record<string, unknown> {
  if (isWeb) {
    return {
      role: 'img',
      'aria-label': label,
      ...(proof
        ? {
            'data-mpo-chart': proof.kind,
            'data-mpo-chart-separated': String(proof.separated),
            'data-mpo-chart-datum-text': String(proof.datumText),
            'data-mpo-chart-datum-count': proof.datumCount,
            ...(proof.datumValues ? { 'data-mpo-chart-data-expected': JSON.stringify(proof.datumValues) } : {}),
          }
        : {}),
    };
  }
  return { accessible: true, accessibilityRole: 'image', accessibilityLabel: label };
}

/** Audit declarations carry no paint and are never sent to native SVG. */
export function chartMarkProps(label: string): Record<string, unknown> {
  return isWeb ? { 'data-mpo-chart-mark': label } : {};
}

/** A bar mark's box and value-end radius, for audits that cannot read a path. */
export function chartBarProps(box: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}): Record<string, unknown> {
  return isWeb ? { 'data-mpo-chart-bar': [box.x, box.y, box.width, box.height, box.radius].join(',') } : {};
}

export function chartChromeProps(kind: 'axis' | 'grid'): Record<string, unknown> {
  return isWeb ? { 'data-mpo-chart-chrome': kind } : {};
}

export function chartDatumTextProps(index: number): Record<string, unknown> {
  return isWeb ? { 'data-mpo-chart-datum-text': String(index) } : {};
}

export function chartWebProps(props: Record<string, unknown>): Record<string, unknown> {
  return isWeb ? props : {};
}

/** SVG's web presentation attribute and RNSVG's explicit native prop. */
export function luminanceMaskProps(): Record<string, unknown> {
  return isWeb ? { 'mask-type': 'luminance' } : { maskType: 'luminance' };
}

export interface DatumTargetInput {
  /** Per-datum accessible name (describeDatum output). */
  label?: string;
  onPress?: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}

/**
 * Platform event/a11y props for an invisible per-datum hit target.
 * Web: click + mouse hover on the DOM node. Native: RNSVG press responder
 * (pressIn/pressOut stand in for hover — tooltip-on-touch semantics).
 */
export function datumTargetProps(input: DatumTargetInput): Record<string, unknown> {
  const interactive = Boolean(input.onPress || input.onHoverIn || input.onHoverOut);
  if (isWeb) {
    return {
      ...(input.label ? { role: 'img', 'aria-label': input.label } : {}),
      ...(input.onPress ? { onClick: input.onPress, cursor: 'pointer' } : {}),
      ...(input.onHoverIn ? { onMouseEnter: input.onHoverIn } : {}),
      ...(input.onHoverOut ? { onMouseLeave: input.onHoverOut } : {}),
      ...(interactive ? { pointerEvents: 'auto' } : {}),
    };
  }
  return {
    ...(input.label ? { accessible: true, accessibilityLabel: input.label } : {}),
    ...(input.onPress ? { onPress: input.onPress } : {}),
    ...(input.onHoverIn ? { onPressIn: input.onHoverIn } : {}),
    ...(input.onHoverOut ? { onPressOut: input.onHoverOut } : {}),
  };
}
