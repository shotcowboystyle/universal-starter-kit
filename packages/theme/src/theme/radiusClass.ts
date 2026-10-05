/**
 * Radius-class declarations and the radius RESOLUTION resolver.
 *
 * Two axes live here, and they COMPOSE rather than replace each other:
 *
 * 1. Knob-IMMUNITY (`R-PILL` / `R-IDENTITY`): the knob does not
 *    reach the part at all — roundness is the part's identity, so it stays
 *    round at every stop including `none`. Declared via `radiusClassProps`.
 * 2. RESOLUTION: given that a part
 *    listens to the knob, what a stop resolves to. Four classes (DEFAULT /
 *    CIRCULAR-AT-FULL / BINARY / CONTAINER-CAP), with a per-component
 *    override layer on top where meaning demands it (Checkbox
 *    never becomes a circle; the Radio disc never stops being one).
 *
 * `resolveRadiusForPart` layers them in doctrine order: immunity wins, then a
 * declared override, then the class. The tables are GENERATED from the radius
 * doctrine section (`scripts/radius-class-registry.mjs` --emit/--check), so
 * code and doctrine cannot drift — the same contract the immunity axis has
 * with `scripts/radius-identity-registry.mjs`.
 *
 * Most parts prove they obey the radius knob by simply going square at
 * `borderRadius:none`. A few legitimately do not — an ornamental dot has no
 * arc for the knob to move (R-PILL), and an avatar's circle is the object's
 * identity rather than a style (R-IDENTITY). Those parts must SAY SO on the
 * node, because the alternative — a probe that skips anything that looks
 * round — silently exempts real KNOB-TOTALITY defects.
 *
 * The declaration is only half the contract: the `radius:none` sweep
 * validates it against the registry GENERATED from the spec's radius-class
 * table (`scripts/radius-identity-registry.mjs`), so a class this file cannot
 * spell, or an R-IDENTITY part the spec never adjudicated, still fails. This
 * module is the writing end; the spec's radius-class table is the registry.
 */

import type { BorderRadius } from './knobs';
import {
  RADIUS_OVERRIDE_TABLE,
  RADIUS_RESOLUTION_COMPOSITION,
  RADIUS_RESOLUTION_TABLE,
  type RadiusOverrideEntry,
  type RadiusResolutionCell,
  type RadiusResolutionClass,
} from './radiusClassTable.generated';

/**
 * The radius classes whose parts stay round at `borderRadius:none`.
 *
 * - `R-PILL` — a pill/circle at every radius value (ornamental dots, badge
 *   indicators). Size still tracks the size knob. Icon wells are DEFAULT,
 *   not R-PILL (R2e) — unless the well IS a count badge.
 * - `R-IDENTITY` — the shape IS the part's identity (Avatar, brand marks,
 *   Radio disc). Membership is enumerated in the spec table and enforced
 *   per part.
 */
export type KnobImmuneRadiusClass = 'R-PILL' | 'R-IDENTITY';

export interface RadiusClassDeclaration {
  'data-radius-class': KnobImmuneRadiusClass;
  'data-radius-part': string;
}

/**
 * Declare a knob-immune shape so the `radius:none` sweep can license it.
 *
 * Spread onto the outermost node of the shape — a declaration covers its own
 * anatomy, so inner painted parts (an avatar's image/fallback) inherit it.
 *
 * @param radiusClass the class the spec's Radius table assigns the part
 * @param part the part name as the spec writes it (the R-IDENTITY registry
 *   is matched by this name)
 *
 * @example
 * <Frame {...radiusClassProps("R-IDENTITY", "Avatar")} circular />
 */
export function radiusClassProps(radiusClass: KnobImmuneRadiusClass, part: string): RadiusClassDeclaration {
  return { 'data-radius-class': radiusClass, 'data-radius-part': part };
}

export interface RadiusResolutionDeclaration {
  'data-radius-resolution': 'BINARY';
}

/**
 * Declare that a part resolves through the BINARY row, so the
 * constraint audit measures it as 0 or half its own shorter edge. The token
 * scale has no h/2 value, so an undeclared thumb or track reads off-scale at
 * every stop. Spread it only where the painted radius IS the resolved one: a
 * consumer radius override ejects the part from the class.
 *
 * @example
 * <StyledSwitch.Thumb {...radiusResolutionProps("BINARY")} borderRadius={thumbRadius} />
 */
export function radiusResolutionProps(radiusClass: 'BINARY'): RadiusResolutionDeclaration {
  return { 'data-radius-resolution': radiusClass };
}

// ── Radius resolution ─────────────────────────

/**
 * The geometry a doctrine cell may need. `h/2` cells need the part's own
 * painted height (shorter edge); CONTAINER-CAP cells need the container's own
 * padding at the current space stop (13/18/32 — `panelPaddingPxMap`).
 */
export interface RadiusClassGeometry {
  heightPx?: number;
  paddingPx?: number;
}

function resolveCell(cell: RadiusResolutionCell, geometry: RadiusClassGeometry, where: string): number {
  switch (cell.kind) {
    case 'px':
      return cell.px;
    case 'half-height': {
      if (geometry.heightPx === undefined || geometry.heightPx <= 0) {
        throw new Error(
          `resolveRadiusClass: ${where} resolves to h/2 and needs geometry.heightPx — the part's own painted height (shorter edge)`,
        );
      }
      return geometry.heightPx / 2;
    }
    case 'min-token-padding': {
      if (geometry.paddingPx === undefined || geometry.paddingPx < 0) {
        throw new Error(
          `resolveRadiusClass: ${where} caps at the container's own padding and needs geometry.paddingPx`,
        );
      }
      return Math.min(cell.tokenPx, geometry.paddingPx);
    }
    case 'padding': {
      if (geometry.paddingPx === undefined || geometry.paddingPx < 0) {
        throw new Error(
          `resolveRadiusClass: ${where} resolves to the container's own padding and needs geometry.paddingPx`,
        );
      }
      return geometry.paddingPx;
    }
  }
}

/**
 * Resolve one radius-resolution class at one knob stop to px.
 *
 * This is the CLASS layer only — the doctrine's DEFAULT resolution. Parts with
 * a declared per-component override or a knob-immunity declaration resolve
 * through `resolveRadiusForPart`, which layers all three.
 *
 * Fails loudly on anything the doctrine table cannot spell: an unknown class,
 * an unknown stop, or an `h/2`/padding cell without its geometry. Silent
 * defaults are how tables widen.
 */
export function resolveRadiusClass(
  radiusClass: RadiusResolutionClass,
  stop: BorderRadius,
  geometry: RadiusClassGeometry = {},
): number {
  const row = RADIUS_RESOLUTION_TABLE[radiusClass];
  if (!row) {
    throw new Error(
      `resolveRadiusClass: "${radiusClass}" is not a class in the DG-RAD doctrine table (docs/design-guidelines.md §13)`,
    );
  }
  const cell = row[stop];
  if (!cell) {
    throw new Error(`resolveRadiusClass: "${stop}" is not a radius stop the DG-RAD doctrine table knows`);
  }
  return resolveCell(cell, geometry, `${radiusClass} at ${stop}`);
}

/**
 * Look up a part's declared per-component override, if any.
 * Matching is by the doctrine's component name, case-insensitive — the same
 * contract the R-IDENTITY membership registry uses. Sweeps use this to PASS a
 * declared override instead of reporting it as a violation.
 */
export function radiusOverrideFor(part: string): RadiusOverrideEntry | undefined {
  const needle = part.trim().toLowerCase();
  return RADIUS_OVERRIDE_TABLE.find((entry) => entry.component.toLowerCase() === needle);
}

export type ResolvedRadiusSource = (typeof RADIUS_RESOLUTION_COMPOSITION)[number];

export interface ResolveRadiusForPartOptions extends RadiusClassGeometry {
  /** the knob stop being resolved */
  stop: BorderRadius;
  /**
   * the part's resolution class as doctrine assigns it — DEFAULT unless
   * assigned otherwise
   */
  radiusClass?: RadiusResolutionClass;
  /**
   * the part name as the doctrine's override table spells it (`Checkbox`,
   * `Radio disc`) — enables the override lookup
   */
  part?: string;
  /**
   * the part's declared knob-immunity (`R-PILL` / `R-IDENTITY`),
   * if it carries one. Immunity COMPOSES above both other layers: the knob
   * never reaches the part, so it stays round at every stop including `none`.
   */
  immunity?: KnobImmuneRadiusClass;
}

export interface ResolvedPartRadius {
  px: number;
  /** which layer resolved it: declared immunity > declared override > class */
  source: ResolvedRadiusSource;
  /** the class the part would resolve by, for sweeps that report both */
  radiusClass: RadiusResolutionClass;
  /** the recorded override reason, when an override won */
  overrideWhy?: string;
}

/**
 * Resolve a part's radius at a knob stop through all three doctrine layers,
 * in doctrine order: a declared knob-immunity
 * wins, then a declared per-component override, then the resolution class.
 *
 * A declared immunity is COMPOSED with, never replaced: even at `none` the
 * part measures h/2, because roundness is its identity, not a radius (badge
 * count pill, status dots, DotIndicator marks, presence pip stay round in the
 * square world).
 */
export function resolveRadiusForPart(options: ResolveRadiusForPartOptions): ResolvedPartRadius {
  const radiusClass: RadiusResolutionClass = options.radiusClass ?? 'DEFAULT';
  const geometry: RadiusClassGeometry = {
    heightPx: options.heightPx,
    paddingPx: options.paddingPx,
  };
  if (options.immunity) {
    if (options.heightPx === undefined || options.heightPx <= 0) {
      throw new Error(
        `resolveRadiusForPart: a declared ${options.immunity} part is round at every stop (h/2) and needs geometry.heightPx`,
      );
    }
    return { px: options.heightPx / 2, source: 'immunity', radiusClass };
  }
  const override = options.part === undefined ? undefined : radiusOverrideFor(options.part);
  if (override) {
    const cell = override.cells[options.stop];
    if (!cell) {
      throw new Error(`resolveRadiusForPart: "${options.stop}" is not a radius stop the DG-RAD override table knows`);
    }
    return {
      px: resolveCell(cell, geometry, `override ${override.component} at ${options.stop}`),
      source: 'override',
      radiusClass,
      overrideWhy: override.why,
    };
  }
  return {
    px: resolveRadiusClass(radiusClass, options.stop, geometry),
    source: 'class',
    radiusClass,
  };
}
