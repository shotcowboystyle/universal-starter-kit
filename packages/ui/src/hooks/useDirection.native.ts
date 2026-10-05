/**
 * useDirection (native) — see useDirection.ts for the contract.
 *
 * React Native exposes direction through `I18nManager.isRTL`, which is fixed
 * for the app session (changing it requires a reload), so no subscription is
 * needed — the value cannot change while mounted.
 */

import { I18nManager } from 'react-native';

export type Direction = 'ltr' | 'rtl';

/** Returns the current writing direction (`"ltr"` | `"rtl"`). */
export function useDirection(): Direction {
  return I18nManager.isRTL ? 'rtl' : 'ltr';
}
