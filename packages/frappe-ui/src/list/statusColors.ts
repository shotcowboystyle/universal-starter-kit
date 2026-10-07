// Desk indicator-color parity: map a status value to theme color tokens for
// the list-view status pill. Doctype workflow `states` (which carry desk
// color names) win over the heuristic word map.
import type { DoctypeMeta } from '../formEngine/doctypeMeta';

export interface StatusPillColors {
  /** Pill surface (step-3 ramp). */
  background: string;
  /** Pill text (step-11 ramp — AA on the step-3 surface). */
  text: string;
}

/** Desk indicator color name → tamagui ramp family. */
const DESK_COLOR_TO_RAMP: Record<string, string> = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  orange: 'orange',
  yellow: 'yellow',
  amber: 'yellow',
  gray: 'gray',
  grey: 'gray',
  darkgrey: 'gray',
  'light-blue': 'blue',
  purple: 'purple',
  pink: 'pink',
  cyan: 'blue',
};

/** Desk's common listview indicator heuristics (frappe list_view indicators). */
const STATUS_WORD_TO_RAMP: Record<string, string> = {
  // green — done / healthy
  closed: 'green',
  completed: 'green',
  complete: 'green',
  finished: 'green',
  active: 'green',
  enabled: 'green',
  approved: 'green',
  paid: 'green',
  success: 'green',
  resolved: 'green',
  delivered: 'green',
  received: 'green',
  // orange — needs attention / in flight
  open: 'orange',
  pending: 'orange',
  'in progress': 'orange',
  'to deliver': 'orange',
  'to bill': 'orange',
  overdue: 'orange',
  medium: 'orange',
  // blue — submitted / informational
  submitted: 'blue',
  running: 'blue',
  new: 'blue',
  'in review': 'blue',
  low: 'blue',
  // red — failed / stopped
  cancelled: 'red',
  canceled: 'red',
  disabled: 'red',
  failed: 'red',
  rejected: 'red',
  error: 'red',
  expired: 'red',
  inactive: 'red',
  unpaid: 'red',
  lost: 'red',
  high: 'red',
  urgent: 'red',
  // gray — inert
  draft: 'gray',
};

function rampToPill(ramp: string): StatusPillColors {
  return { background: `$${ramp}3`, text: `$${ramp}11` };
}

/**
 * Resolve the pill colors for a status value. Workflow states from the
 * doctype meta (desk color names) take precedence; otherwise a heuristic
 * word map mirrors stock desk indicators; unknown values fall back to gray.
 */
export function statusPillColors(status: string, meta?: DoctypeMeta): StatusPillColors {
  const normalized = status.trim().toLowerCase();
  const state = meta?.states?.find((s) => (s.title ?? '').trim().toLowerCase() === normalized);
  if (state?.color) {
    const ramp = DESK_COLOR_TO_RAMP[state.color.trim().toLowerCase()];
    if (ramp) {
      return rampToPill(ramp);
    }
  }
  const ramp = STATUS_WORD_TO_RAMP[normalized];
  return rampToPill(ramp ?? 'gray');
}
