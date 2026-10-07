/**
 * Action-region DEV guardrails — thin alias over `@repo/theme` §5 catalog.
 * Kept so ActionBar / DestructiveAction imports stay stable while W10/W7 land.
 */

import { __resetDevWarnSeen, devWarn } from '@repo/theme';
import type { DevWarnCode, DevWarnDetail } from '@repo/theme';

export type ActionDevWarnCode = Extract<
  DevWarnCode,
  'two-primaries' | 'bare-destructive-without-confirm' | 'cancel-disabled' | 'dialog-too-many-actions'
>;

// Cancel-disabled / dialog-action-cap helpers — canonical logic lives in the theme catalog.
export { warnCancelDisabled, warnDialogTooManyActions } from '@repo/theme';

export type ActionDevWarnDetail = DevWarnDetail;

export const actionDevWarn = (code: ActionDevWarnCode, detail: ActionDevWarnDetail = {}): void => {
  devWarn(code, detail);
};

// Test helper; not part of the public API.
// oxlint-disable-next-line sonarjs/variable-name, sonarjs/function-name -- exported double-underscore reset helper name is consumed by tests across packages
export const __resetActionDevWarnSeen = (): void => {
  __resetDevWarnSeen();
};
