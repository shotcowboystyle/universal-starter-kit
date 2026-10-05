/**
 * Centralized z-index scale for consistent layering across components.
 *
 * ## Z-Index Tiers
 *
 * | Tier              | Range       | Use Case                                    |
 * |-------------------|-------------|---------------------------------------------|
 * | Local             | 1-10        | Stacking within a component (badges, pins) |
 * | Component         | 100         | Sticky headers, local overlays              |
 * | Loading           | 1000        | Loading spinners, toasts                    |
 * | Sheet             | 100000      | Mobile sheets, drawers                      |
 * | Dropdown          | 200000      | Popovers, select dropdowns, modals          |
 * | Extension         | 2147483647  | Browser extension injection (max int)       |
 *
 * ## Usage
 *
 * ```tsx
 * import { zIndex } from '../shared/zIndex';
 *
 * <View zIndex={zIndex.dropdown}>...</View>
 * ```
 */

// Local stacking within a component (badges, pinned columns, scroll arrows)
const zLocalBase = 1;
const zLocalElevated = 2;
const zLocalTop = 10;

// Component-level overlays (sticky table headers, local overlays)
const zComponent = 100;

// Loading states, toasts, inline overlays
const zLoading = 1000;

// Mobile sheets and drawer overlays
const zDrawerOverlay = 99999;
const zSheet = 100000;

// Floating dropdowns, popovers, modals (must be above sheets)
const zDropdown = 200000;

// Browser extension injection (max safe integer for DOM)
const zExtension = 2147483647;

/**
 * Named z-index constants for common use cases.
 * Prefer these over raw numbers for consistency.
 */
export const zIndex = {
  // Local stacking
  localBase: zLocalBase,
  localElevated: zLocalElevated,
  localTop: zLocalTop,

  // Component level
  stickyHeader: zComponent,
  scrollArrow: zLocalElevated,

  // Loading/toast layer
  loading: zLoading,

  // Overlay layers
  drawerOverlay: zDrawerOverlay,
  sheet: zSheet,
  dropdown: zDropdown,

  // Special cases
  extension: zExtension,
} as const;

export type ZIndexKey = keyof typeof zIndex;
