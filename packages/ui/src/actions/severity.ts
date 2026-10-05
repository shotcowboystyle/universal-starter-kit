/**
 * Friction tier from severity × recreation signals.
 */

export type DestructiveSeverity = 'low' | 'medium' | 'high';

export interface DestructiveSeverityHints {
  severity?: DestructiveSeverity;
  /** Multi-select / bulk delete. */
  bulk?: boolean;
  /** Not undoable / soft-deleted. */
  irreversible?: boolean;
  /** Nested resources are removed too. */
  cascades?: boolean;
}

/**
 * Resolve the confirm tier. Explicit `severity` wins; otherwise derive from hints.
 * `DestructiveAction` defaults to **medium** (confirm) when nothing is specified —
 * opting into the primitive means the action is risky.
 */
export function resolveDestructiveSeverity(hints: DestructiveSeverityHints = {}): DestructiveSeverity {
  if (hints.severity) {
    return hints.severity;
  }
  if (hints.cascades) {
    return 'high';
  }
  if (hints.bulk && hints.irreversible) {
    return 'high';
  }
  if (hints.bulk || hints.irreversible) {
    return 'medium';
  }
  return 'medium';
}

/** Medium/high tiers require a confirm gate. */
export function severityRequiresConfirm(severity: DestructiveSeverity): boolean {
  return severity === 'medium' || severity === 'high';
}

/** Danger / error tone is reserved for medium+ (Pajamas / DG-DX). */
export function severityUsesDangerTone(severity: DestructiveSeverity): boolean {
  return severity === 'medium' || severity === 'high';
}
