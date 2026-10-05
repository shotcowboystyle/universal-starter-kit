/**
 * OPTICS hairline (Axiom 15) — native twin of `hairline.ts`.
 *
 * React Native's StyleSheet.hairlineWidth already resolves to one device
 * pixel for the current screen density (e.g. 1/3 on 3x, 1/2 on 2x), so no
 * fallback plumbing is needed; `className` entries are omitted (web-only).
 */
import { StyleSheet } from 'react-native';

/** Divider line width: one device pixel for the current screen density. */
export const hairlineWidth: number = StyleSheet.hairlineWidth;

/** Spreadable divider treatments — see `hairline.ts` for usage. */
export const hairline = {
  /** Standalone horizontal rule as a filled hairline-height line. */
  line: {
    height: hairlineWidth,
    maxHeight: hairlineWidth,
    flexBasis: hairlineWidth,
    borderBottomWidth: 0,
    backgroundColor: '$borderColor',
  },
  /** Standalone vertical rule as a filled hairline-width line. */
  vline: {
    width: hairlineWidth,
    maxWidth: hairlineWidth,
    flexBasis: hairlineWidth,
    borderRightWidth: 0,
    backgroundColor: '$borderColor',
  },
  /** Already-filled 1px line elements (e.g. menu separator views). */
  height: { height: hairlineWidth },
  bottom: { borderBottomWidth: hairlineWidth },
  top: { borderTopWidth: hairlineWidth },
  right: { borderRightWidth: hairlineWidth },
  left: { borderLeftWidth: hairlineWidth },
} as const;

/** Web-only fallback stylesheet — no-op on native. */
export const hairlineFallbackCss = '';

/** Web-only fallback mount — no-op on native. */
export function ensureHairlineFallback(): void {}
