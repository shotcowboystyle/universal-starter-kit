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

// SAFETY: the shim ships no types; each export is the same-named react-native-svg component on native and a DOM-SVG wrapper accepting the same props on web.
// oxlint-disable-next-line anti-slop/no-unknown-parameters, typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- untyped shim boundary; T is the caller-chosen RNSVG component type
const asRnSvg = <T>(component: unknown): T => component as T;

export const Svg = asRnSvg<typeof RNSvg>(TSvg);
export const Defs = asRnSvg<typeof RNDefs>(TDefs);
export const Mask = asRnSvg<typeof RNMask>(TMask);
export const G = asRnSvg<typeof RNG>(TG);
export const Rect = asRnSvg<typeof RNRect>(TRect);
export const Circle = asRnSvg<typeof RNCircle>(TCircle);
export const Line = asRnSvg<typeof RNLine>(TLine);
export const Path = asRnSvg<typeof RNPath>(TPath);
export const SvgText = asRnSvg<typeof RNSvgText>(TSvgText);

export type ChartKind = 'bar' | 'pie' | 'donut' | 'line' | 'area';

/** Accessible-image props for the chart root (Axiom 12). */
export interface ChartProofDeclaration {
  kind: ChartKind;
  separated: boolean;
  datumText: boolean;
  datumCount: number;
  datumValues?: [string, string][];
}

/** Spreadable SVG/DOM/RNSVG attribute bag. */
export type ChartAttrs = Record<string, string | number | boolean | (() => void)>;

export interface ChartRootAttrs {
  role?: 'img';
  'aria-label'?: string;
  accessible?: true;
  accessibilityRole?: 'image';
  accessibilityLabel?: string;
  'data-mpo-chart'?: ChartKind;
  'data-mpo-chart-separated'?: string;
  'data-mpo-chart-datum-text'?: string;
  'data-mpo-chart-datum-count'?: number;
  'data-mpo-chart-data-expected'?: string;
}

export const chartRootA11yProps = (label: string, proof?: ChartProofDeclaration): ChartRootAttrs => {
  if (!isWeb) {
    return { accessible: true, accessibilityRole: 'image', accessibilityLabel: label };
  }
  const attrs: ChartRootAttrs = { role: 'img', 'aria-label': label };
  if (proof) {
    attrs['data-mpo-chart'] = proof.kind;
    attrs['data-mpo-chart-separated'] = String(proof.separated);
    attrs['data-mpo-chart-datum-text'] = String(proof.datumText);
    attrs['data-mpo-chart-datum-count'] = proof.datumCount;
    if (proof.datumValues) {
      attrs['data-mpo-chart-data-expected'] = JSON.stringify(proof.datumValues);
    }
  }
  return attrs;
};

/** Audit declarations carry no paint and are never sent to native SVG. */
export const chartMarkProps = (label: string): ChartAttrs => (isWeb ? { 'data-mpo-chart-mark': label } : {});

/** A bar mark's box and value-end radius, for audits that cannot read a path. */
export const chartBarProps = (box: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}): ChartAttrs => (isWeb ? { 'data-mpo-chart-bar': [box.x, box.y, box.width, box.height, box.radius].join(',') } : {});

export const chartChromeProps = (kind: 'axis' | 'grid'): ChartAttrs => (isWeb ? { 'data-mpo-chart-chrome': kind } : {});

export const chartDatumTextProps = (index: number): ChartAttrs =>
  isWeb ? { 'data-mpo-chart-datum-text': String(index) } : {};

export const chartWebProps = (props: ChartAttrs): ChartAttrs => (isWeb ? props : {});

/** SVG's web presentation attribute and RNSVG's explicit native prop. */
export const luminanceMaskProps = (): ChartAttrs => (isWeb ? { 'mask-type': 'luminance' } : { maskType: 'luminance' });

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
export interface DatumTargetAttrs {
  role?: 'img';
  'aria-label'?: string;
  cursor?: 'pointer';
  pointerEvents?: 'auto';
  accessible?: true;
  accessibilityLabel?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export const datumTargetProps = (input: DatumTargetInput): DatumTargetAttrs => {
  const { label, onPress, onHoverIn, onHoverOut } = input;
  const hasLabel = label !== undefined && label !== '';
  const attrs: DatumTargetAttrs = {};
  if (isWeb) {
    if (hasLabel) {
      attrs.role = 'img';
      attrs['aria-label'] = label;
    }
    if (onPress) {
      attrs.onClick = onPress;
      attrs.cursor = 'pointer';
    }
    if (onHoverIn) {
      attrs.onMouseEnter = onHoverIn;
    }
    if (onHoverOut) {
      attrs.onMouseLeave = onHoverOut;
    }
    if (onPress || onHoverIn || onHoverOut) {
      attrs.pointerEvents = 'auto';
    }
    return attrs;
  }
  if (hasLabel) {
    attrs.accessible = true;
    attrs.accessibilityLabel = label;
  }
  if (onPress) {
    attrs.onPress = onPress;
  }
  if (onHoverIn) {
    attrs.onPressIn = onHoverIn;
  }
  if (onHoverOut) {
    attrs.onPressOut = onHoverOut;
  }
  return attrs;
};
