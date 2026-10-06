/**
 * Field anatomy defaults.
 *
 * Character widths follow the GOV.UK / USWDS convention: short expected
 * content → short control (`ch`), free-text description → full width.
 */

export type FieldPurpose = 'postalCode' | 'year' | 'phone' | 'email' | 'description';

export type FieldWidth = number | 'full';

/** Default max character widths keyed by semantic purpose. */
export const FIELD_WIDTH_BY_PURPOSE: Record<FieldPurpose, FieldWidth> = {
  postalCode: 12,
  year: 4,
  phone: 16,
  email: 24,
  description: 'full',
};

/**
 * Term / side-label column cap (D-desclist). Widest purpose width so
 * the read and edit faces share one label column (`min(max-content, 24ch)`).
 */
export const LABEL_COLUMN_MAX_CH = Math.max(
  ...Object.values(FIELD_WIDTH_BY_PURPOSE).filter((width): width is number => typeof width === 'number'),
);

/** CSS track for a shared label column — content-sized, capped at {@link LABEL_COLUMN_MAX_CH}. */
export const LABEL_COLUMN_WIDTH = `min(max-content, ${LABEL_COLUMN_MAX_CH}ch)` as const;

/** HTML `autocomplete` tokens → purpose keys. */
const AUTOCOMPLETE_TO_PURPOSE: Record<string, FieldPurpose> = {
  'postal-code': 'postalCode',
  postalcode: 'postalCode',
  zip: 'postalCode',
  'zip-code': 'postalCode',
  year: 'year',
  'bday-year': 'year',
  'cc-exp-year': 'year',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-local': 'phone',
  'tel-country-code': 'phone',
  phone: 'phone',
  email: 'email',
  description: 'description',
};

const PURPOSE_KEYS = new Set<string>(Object.keys(FIELD_WIDTH_BY_PURPOSE));

export function isFieldPurpose(value: string | undefined | null): value is FieldPurpose {
  return typeof value === 'string' && PURPOSE_KEYS.has(value);
}

/**
 * Resolve a purpose key from an explicit `purpose` prop or an HTML
 * `autoComplete` / `autocomplete` token.
 */
export function resolveFieldPurpose(purpose?: string | null, autoComplete?: string | null): FieldPurpose | undefined {
  if (isFieldPurpose(purpose ?? undefined)) {
    return purpose as FieldPurpose;
  }
  if (!autoComplete) {
    return undefined;
  }
  const normalized = autoComplete.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (isFieldPurpose(normalized)) {
    return normalized;
  }
  return AUTOCOMPLETE_TO_PURPOSE[normalized];
}

/** Character width (or `"full"`) for a purpose / autocomplete pair. */
export function resolveFieldWidth(purpose?: string | null, autoComplete?: string | null): FieldWidth | undefined {
  const resolved = resolveFieldPurpose(purpose, autoComplete);
  if (!resolved) {
    return undefined;
  }
  return FIELD_WIDTH_BY_PURPOSE[resolved];
}

export interface FieldWidthStyle {
  maxWidth?: string;
  width?: string;
}

export interface FieldInputProps {
  /** HTML autocomplete token (web) — also feeds RNW textContentType mapping. */
  autoComplete?: string;
  /** HTML inputmode (web keyboard hint). */
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search' | 'url';
  /** React Native keyboardType (native keyboard hint). */
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad' | 'numeric' | 'url';
}

/**
 * Purpose → keyboard/autofill input props (DG research §32).
 *
 * - email → autocomplete `email`, inputmode `email`, keyboardType `email-address`
 * - phone → autocomplete `tel`, inputmode `tel`, keyboardType `phone-pad`
 * - postalCode → autocomplete `postal-code`; keyboard stays text (postal codes
 *   are alphanumeric in UK/CA/NL — never force numeric)
 * - year → numeric via text + inputmode `numeric` (no `type=number` spinner)
 */
const INPUT_PROPS_BY_PURPOSE: Record<FieldPurpose, FieldInputProps> = {
  email: { autoComplete: 'email', inputMode: 'email', keyboardType: 'email-address' },
  phone: { autoComplete: 'tel', inputMode: 'tel', keyboardType: 'phone-pad' },
  postalCode: { autoComplete: 'postal-code' },
  year: { inputMode: 'numeric', keyboardType: 'number-pad' },
  description: {},
};

/**
 * Resolve keyboard/autofill props from `purpose` / `autoComplete`.
 * An explicit `autoComplete` always passes through verbatim (eject); the
 * purpose only fills the token when the consumer did not provide one.
 */
export function resolveFieldInputProps(purpose?: string | null, autoComplete?: string | null): FieldInputProps {
  const resolved = resolveFieldPurpose(purpose, autoComplete);
  const base = resolved ? INPUT_PROPS_BY_PURPOSE[resolved] : {};
  if (autoComplete) {
    return { ...base, autoComplete };
  }
  return { ...base };
}

/**
 * Style props for FieldLayout / Input Box. Numeric widths become `Nch`
 * maxWidth; `"full"` stretches to 100%.
 */
export function fieldWidthStyle(purpose?: string | null, autoComplete?: string | null): FieldWidthStyle | undefined {
  const width = resolveFieldWidth(purpose, autoComplete);
  if (width === undefined) {
    return undefined;
  }
  if (width === 'full') {
    return { width: '100%', maxWidth: '100%' };
  }
  return { maxWidth: `${width}ch` };
}
