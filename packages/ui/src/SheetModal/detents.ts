/**
 * SheetModal detent geometry — the pure half, split out so it can be specced
 * without standing up a React Native renderer.
 *
 * A detent is a VISIBLE HEIGHT in points. The native sheet's `translateY`
 * measures DOWN from fully-expanded, so a detent of `h` rests at `travel - h`,
 * and `travel` itself is the fully-expanded sheet.
 */

/** Smallest height a native sheet is ever laid out at. */
export const minSheetHeight = 180;

/**
 * Half-open detent for a sheet that owns a scrollport, as a fraction of its
 * full height. Mirrors FloatingPanel so both native sheets drag alike.
 */
export const mediumDetent = 0.55;

export interface ResolveSheetDetentsOptions {
  /** Full (expanded) height of the sheet, in points. */
  travel: number;
  /** The sheet owns a scrollport, so a half-open rest is meaningful. */
  scrollable?: boolean;
  /** Percent detent from the caller — the same prop the web Sheet takes. */
  snapPoint?: number;
}

/**
 * The heights the sheet is allowed to rest at, largest first.
 *
 * `snapPoint` is a percent on the web Sheet (`snapPoints={[snapPoint]}`).
 * Native honours the same prop by turning that percent into a detent, so a
 * caller that writes `snapPoint={85}` gets an 85%-height rest on both twins
 * rather than the prop being silently dropped on device.
 *
 * Anything shorter than `minSheetHeight` is discarded, because a sheet that
 * rests below that is indistinguishable from a dismissed one. A sheet whose
 * full height is already under the floor keeps its own height, otherwise it
 * would have no detents at all.
 */
export function resolveSheetDetents({ travel, scrollable, snapPoint }: ResolveSheetDetentsOptions): number[] {
  const points = [travel];
  if (scrollable) {
    points.push(Math.round(travel * mediumDetent));
  }
  if (typeof snapPoint === 'number' && Number.isFinite(snapPoint) && snapPoint > 0) {
    points.push(Math.round(travel * (Math.min(snapPoint, 100) / 100)));
  }
  const floor = Math.min(minSheetHeight, travel);
  return Array.from(new Set(points.filter((h) => h >= floor))).sort((a, b) => b - a);
}
