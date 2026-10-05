/**
 * Action-region DEV guardrails — thin alias over `@repo/theme` §5 catalog.
 * Kept so ActionBar / DestructiveAction imports stay stable while W10/W7 land.
 */

import { __resetDevWarnSeen, devWarn, type DevWarnCode, type DevWarnDetail } from '@repo/theme';

export type ActionDevWarnCode = Extract<
  DevWarnCode,
  'two-primaries' | 'bare-destructive-without-confirm' | 'cancel-disabled' | 'dialog-too-many-actions'
>;

// Cancel-disabled / dialog-action-cap helpers — canonical logic lives in the theme catalog.
export { warnCancelDisabled, warnDialogTooManyActions } from '@repo/theme';

export type ActionDevWarnDetail = DevWarnDetail;

export function actionDevWarn(code: ActionDevWarnCode, detail: ActionDevWarnDetail = {}): void {
  devWarn(code, detail);
}

/** @internal test helper */
export function __resetActionDevWarnSeen(): void {
  __resetDevWarnSeen();
}
