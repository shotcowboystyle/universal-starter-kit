import { OVERLAY_ANCHOR_GAP } from '@repo/theme';

/**
 * A panel opened at a POINT rather than from a trigger's box: the ContextMenu
 * gesture. layoutTokens.ts files a pointer-positioned context menu
 * as a FREE overlay: content-sized, `OVERLAY_ANCHOR_GAP` from its anchor,
 * flipping at the viewport edges instead of overflowing. The anchor here is a
 * zero-size box at the point, so "start-aligned to the anchor" puts the
 * panel's start edge on the pointer's x.
 */
export interface PanelPoint {
  x: number;
  y: number;
}

/** The box a panel must stay inside, already inset by padding and safe area. */
export interface PanelBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function pointPanelLeft(
  point: PanelPoint,
  width: number,
  bounds: PanelBounds,
  rtl = false,
): { left: number; alignEnd: boolean } {
  const towardEnd = rtl ? point.x - width : point.x;
  const towardStart = rtl ? point.x : point.x - width;
  const fits = (left: number) => left >= bounds.left && left + width <= bounds.right;
  const alignEnd = !fits(towardEnd) && fits(towardStart);
  const raw = alignEnd ? towardStart : towardEnd;
  return { left: Math.max(bounds.left, Math.min(raw, bounds.right - width)), alignEnd };
}

/** Below when it fits, above when only that fits, else the roomier side. */
export function pointOpensUp(
  point: PanelPoint,
  height: number,
  bounds: PanelBounds,
  gap: number = OVERLAY_ANCHOR_GAP,
): boolean {
  const below = bounds.bottom - (point.y + gap);
  const above = point.y - gap - bounds.top;
  if (height <= below) {
    return false;
  }
  if (height <= above) {
    return true;
  }
  return above > below;
}

export interface PointPlacement {
  left: number;
  top: number;
  maxHeight: number;
  dropup: boolean;
  alignEnd: boolean;
}

export function placeAtPoint({
  point,
  width,
  height,
  bounds,
  gap = OVERLAY_ANCHOR_GAP,
  rtl = false,
}: {
  point: PanelPoint;
  width: number;
  height: number;
  bounds: PanelBounds;
  gap?: number;
  rtl?: boolean;
}): PointPlacement {
  const { left, alignEnd } = pointPanelLeft(point, width, bounds, rtl);
  const dropup = pointOpensUp(point, height, bounds, gap);
  const maxHeight = Math.max(0, dropup ? point.y - gap - bounds.top : bounds.bottom - (point.y + gap));
  const top = dropup ? point.y - gap - Math.min(height, maxHeight) : point.y + gap;
  return { left, top, maxHeight, dropup, alignEnd };
}

export interface ContextMenuEventLike {
  clientX: number;
  clientY: number;
  button?: number;
  pointerType?: string;
}

/**
 * Where a `contextmenu` event asks the menu to open. A mouse right-click or a
 * touch long-press carries the pointer's viewport coordinates. A keyboard open
 * (Shift+F10, the Menu key) has no pointer: Chromium sends a PointerEvent with
 * an empty `pointerType` aimed at the focused element's centre
 * (`EventHandler::ShowNonLocatedContextMenu`). It opens from the target's
 * bottom start corner. A plain MouseEvent counts as a pointer only when it is
 * a right-click or carries coordinates.
 */
export function contextMenuPoint(
  event: ContextMenuEventLike,
  reference: PointReference | null,
  rtl = false,
): PanelPoint | null {
  const fromPointer =
    event.pointerType !== undefined
      ? event.pointerType !== ''
      : event.button === 2 || event.clientX !== 0 || event.clientY !== 0;
  if (fromPointer) {
    return { x: event.clientX, y: event.clientY };
  }
  return reference ? referenceCornerPoint(reference, rtl) : null;
}

export interface PointReference {
  getBoundingClientRect(): { left: number; right: number; bottom: number };
}

/** The target's bottom start corner: where a menu with no pointer opens. */
export function referenceCornerPoint(reference: PointReference, rtl = false): PanelPoint {
  const rect = reference.getBoundingClientRect();
  return { x: rtl ? rect.right : rect.left, y: rect.bottom };
}
