/**
 * Tree-shaken DEV guardrails (blueprint §5).
 * No-ops when `NODE_ENV === "production"`.
 *
 * W12 owns `outline-none` + `positive-tabindex`. Other codes are catalogued
 * here so consumers share one tree-shaken entry point.
 */

export type DevWarnCode =
  | 'placeholder-as-label'
  | 'two-primaries'
  | 'banned-error-word'
  | 'bare-disabled'
  | 'cancel-disabled'
  | 'dialog-too-many-actions'
  | 'select-too-few-options'
  | 'positive-tabindex'
  | 'tooltip-on-disabled'
  | 'outline-none'
  // A second level-1 heading mounted under one page scope.
  // Emitted by PageHeadingScope in @repo/ui.
  | 'multiple-h1'
  // Stacked-group geometry (theme groupGeometry): a group container could
  // not resolve its items' first/middle/last positions because an item is
  // hidden behind a component boundary — corners fall back to "only"
  // (uniformly rounded), which is the defect the geometry rule bans.
  | 'opaque-stack-group'
  /** Numeric height/paddingHorizontal on a recipe control without sizeRecipeEscape. */
  | 'size-recipe-escape';

export interface DevWarnDetail {
  component?: string;
  id?: string;
  value?: unknown;
  word?: string;
  count?: number;
  suggest?: string;
  region?: string;
  [key: string]: unknown;
}

/**
 * GUARDRAIL-CLEAN-STORIES allowlist entry, declared as a Storybook story
 * parameter (`parameters.guardrailSpecimen`).
 *
 * Catalog stories emit zero `[theme]` guardrail warnings at rest. A story whose
 * whole purpose is to demonstrate the warned state (a disabled-dial specimen, a
 * pager boundary case) is allowlisted by declaring itself:
 *
 * ```ts
 * export const Disabled: Story = {
 *   parameters: {
 *     guardrailSpecimen: {
 *       warns: ["bare-disabled"],
 *       reason: "Demonstrates the disabled dial; Stepper has no disabledReason plumbing.",
 *     } satisfies GuardrailSpecimenParameter,
 *   },
 * };
 * ```
 *
 * Semantics, pinned:
 * - `warns` is the CLOSED set of codes the story may emit at rest. An emitted
 *   code outside the set still FAILs the story.
 * - A declared code that happens not to fire passes — component improvements
 *   must never break an allowlist entry.
 * - The declaration NEVER suppresses the console warning — the warn still
 *   fires; only the warn-harvester tolerates it (explicit, never tacit).
 * - Harvesters read this parameter off
 *   the rendered story and fail CLOSED when parameters cannot be read at all.
 */
export interface GuardrailSpecimenParameter {
  /** Warn codes this story may emit at rest — a closed set, not a wildcard. */
  warns: DevWarnCode[];
  /** Why the warned state is the story's subject. */
  reason: string;
}

const seen = new Set<string>();

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Emit a once-per-key console warning in non-production builds.
 */
export function devWarn(code: DevWarnCode, detail: DevWarnDetail = {}): void {
  if (!isDev()) {
    return;
  }
  const key = [
    code,
    detail.component ?? '',
    detail.id ?? '',
    detail.region ?? '',
    String(detail.value ?? ''),
    detail.word ?? '',
    detail.count ?? '',
  ].join(':');
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const bits = [
    detail.component ? `component=${detail.component}` : undefined,
    detail.id ? `id=${detail.id}` : undefined,
    detail.region ? `region=${detail.region}` : undefined,
    detail.value !== undefined ? `value=${String(detail.value)}` : undefined,
    detail.word ? `word=${detail.word}` : undefined,
    detail.count !== undefined ? `count=${detail.count}` : undefined,
    detail.suggest ? `suggest=${detail.suggest}` : undefined,
  ].filter(Boolean);
  const suffix = bits.length ? ` (${bits.join(', ')})` : '';
  console.warn(`[theme] ${code}${suffix}`);
}

/** @internal test helper */
export function __resetDevWarnSeen(): void {
  seen.clear();
}

/** Alias kept for callers that imported the W12-era name. */
export const themeDevWarn = devWarn;
export const __resetThemeDevWarnSeen = __resetDevWarnSeen;

/**
 * Placeholder must not be the only label.
 */
export function warnPlaceholderAsLabel(args: {
  placeholder?: string | null;
  label?: unknown;
  ariaLabel?: string | null;
  id?: string;
  component?: string;
}): void {
  if (!isDev()) {
    return;
  }
  const placeholder = typeof args.placeholder === 'string' ? args.placeholder.trim() : '';
  if (!placeholder) {
    return;
  }
  if (args.label != null && args.label !== false && args.label !== '') {
    return;
  }
  const ariaLabel = typeof args.ariaLabel === 'string' ? args.ariaLabel.trim() : '';
  if (ariaLabel) {
    return;
  }
  devWarn('placeholder-as-label', {
    component: args.component ?? 'FieldLayout',
    id: args.id,
  });
}

const BANNED_ERROR_WORDS = ['invalid', 'error', 'please', 'sorry', 'oops'] as const;

/** Banned words in error copy. */
export function warnBannedErrorWords(message: string | null | undefined, detail: DevWarnDetail = {}): void {
  if (!isDev() || !message) {
    return;
  }
  const lower = message.toLowerCase();
  for (const word of BANNED_ERROR_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      devWarn('banned-error-word', { ...detail, word });
      return;
    }
  }
}

/** Bare `disabled` without reason / explain. */
export function warnBareDisabled(args: {
  disabled?: boolean;
  disabledReason?: string | null;
  skip?: boolean;
  component?: string;
  id?: string;
}): void {
  if (!isDev() || !args.disabled || args.skip) {
    return;
  }
  if (typeof args.disabledReason === 'string' && args.disabledReason.trim()) {
    return;
  }
  devWarn('bare-disabled', { component: args.component, id: args.id });
}

/**
 * Numeric `height` / `paddingHorizontal` on a size-recipe control
 * (Button, Input.Box) must opt in with `sizeRecipeEscape="reason"`. Warns
 * once per component+id like `warnBareDisabled`; does not invent a general
 * style escape.
 */
export function warnSizeRecipeEscape(args: {
  height?: unknown;
  paddingHorizontal?: unknown;
  sizeRecipeEscape?: string | null;
  component?: string;
  id?: string;
}): void {
  if (!isDev()) {
    return;
  }
  const numericHeight = typeof args.height === 'number';
  const numericPad = typeof args.paddingHorizontal === 'number';
  if (!numericHeight && !numericPad) {
    return;
  }
  if (typeof args.sizeRecipeEscape === 'string' && args.sizeRecipeEscape.trim()) {
    return;
  }
  devWarn('size-recipe-escape', { component: args.component, id: args.id });
}

/**
 * The cancel/dismiss action never renders disabled (while confirm
 * may be). Enforcing callers strip the prop and report the attempt here.
 */
export function warnCancelDisabled(args: { disabled?: boolean; component?: string; id?: string }): void {
  if (!isDev() || !args.disabled) {
    return;
  }
  devWarn('cancel-disabled', { component: args.component, id: args.id });
}

/** Dialog action rows cap at this many actions by default. */
export const DIALOG_MAX_ACTIONS = 2;

/**
 * Max 2 actions in a dialog by default. Warn-only (never a hard
 * block); `allowManyActions` is the explicit eject acknowledging the extra
 * actions.
 */
export function warnDialogTooManyActions(args: {
  count: number;
  allowManyActions?: boolean;
  component?: string;
  id?: string;
}): void {
  if (!isDev() || args.allowManyActions || args.count <= DIALOG_MAX_ACTIONS) {
    return;
  }
  devWarn('dialog-too-many-actions', {
    component: args.component,
    id: args.id,
    count: args.count,
  });
}

/**
 * DG-CTRL — Select with too few options; suggest RadioGroup / ToggleGroup.
 */
export function warnSelectTooFewOptions(args: {
  count: number;
  multiple?: boolean;
  component?: string;
  id?: string;
}): void {
  if (!isDev() || args.multiple || args.count > 5) {
    return;
  }
  const suggest = args.count <= 2 ? 'ToggleGroup' : 'RadioGroup';
  devWarn('select-too-few-options', {
    component: args.component,
    id: args.id,
    count: args.count,
    suggest,
  });
}

/** Never `tabIndex` > 0. */
export function warnPositiveTabIndex(args: { value?: number | string | null; component?: string; id?: string }): void {
  if (!isDev()) {
    return;
  }
  const n = typeof args.value === 'string' ? Number(args.value) : args.value;
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) {
    return;
  }
  devWarn('positive-tabindex', {
    component: args.component,
    id: args.id,
    value: n,
  });
}

/** No hover tooltip on disabled controls. */
export function warnTooltipOnDisabled(args: { childDisabled?: boolean; component?: string; id?: string }): void {
  if (!isDev() || !args.childDisabled) {
    return;
  }
  devWarn('tooltip-on-disabled', {
    component: args.component ?? 'Tooltip',
    id: args.id,
  });
}

type OutlineLike =
  | {
      outline?: string | number;
      outlineStyle?: string;
      outlineWidth?: number;
      outlineColor?: string;
    }
  | null
  | undefined;

/**
 * Warn when a focus style strips the outline.
 * Call on `focusVisibleStyle` / `focusStyle` only — not resting
 * `outlineWidth: 0` + transparent (border-flicker rest).
 */
export function warnOutlineNone(style: OutlineLike, detail: DevWarnDetail = {}): void {
  if (!isDev() || !style) {
    return;
  }
  const stripped = style.outline === 'none' || style.outlineStyle === 'none' || style.outlineWidth === 0;
  if (!stripped) {
    return;
  }
  devWarn('outline-none', detail);
}
