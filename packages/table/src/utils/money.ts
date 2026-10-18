/**
 * Money — exact decimal arithmetic on the wire strings (MPO-252).
 *
 * A Currency field arrives as a decimal STRING ("-455.87"). That is
 * deliberate: a float would round it, and money that rounds is money that
 * disagrees with the ledger. The consequence is that money is not `number`
 * and it is not `text` either, and treating it as text is silently wrong in
 * one specific way that nothing on screen reveals:
 *
 *     "9.00" > "10.00"   // true, for strings
 *
 * So a table sorted on an amount column is not approximately right, it is
 * nonsense. The answer downstream was to make NO money column sortable
 * anywhere, which gives up a real capability to avoid a wrong answer. These
 * helpers exist so the kit can offer the capability instead: a comparator
 * that orders decimal strings numerically, and exact add/sum so anything
 * folding money client-side (a running balance, a tree rolling leaves into
 * parents, a per-currency total) never touches a float.
 *
 * ─── The mixed-currency rule ──────────────────────────────────────────────
 *
 * TWO CURRENCIES ARE TWO FIGURES, AND NEITHER CONVERTS. There is no rate in
 * the table, no rate on the row, and a sum that silently added USD to INR
 * would produce a number that is wrong in a way nobody can see. So:
 *
 *  - `addMoney` and `sumMoney` take amounts ONLY. They do not know about
 *    currency and will happily add two figures — it is the caller's job not
 *    to hand them different currencies.
 *  - `sumMoneyByCurrency` is the safe total: it returns one exact figure PER
 *    currency code. A ledger that genuinely mixes currencies gets N figures
 *    and prints them all.
 *  - `compareMoney` orders by magnitude only. Sorting a mixed-currency column
 *    by amount is meaningful only if the reader can see the codes differ,
 *    which is why a money column formats from the row's own currency.
 *
 * ─── Implementation ───────────────────────────────────────────────────────
 *
 * Each operand is scaled to an integer of its own fraction length, the two
 * are combined as BigInt at the wider scale, and the result renders back at
 * that scale: "10.50" + "0.125" is "10.625", never 10.625000000000002.
 * BigInt is ES2020 and Hermes has shipped it since RN 0.70. The `BigInt()`
 * call form is used instead of `10n` literals so no transform in the chain
 * has to know the syntax.
 *
 * Malformed input throws. A NaN folded quietly into a running balance is the
 * one outcome worse than a crash.
 */

// Matched against the trimmed string: `String#trim` strips the same whitespace
// set as `\s`, and anchoring without `\s*` avoids backtracking.
const moneyPattern = /^(?<sign>[+-]?)(?<whole>\d*)(?:\.(?<fraction>\d*))?$/u;

interface ScaledMoney {
  units: bigint;
  scale: number;
}

const scaleMoney = (raw: string): ScaledMoney => {
  const match = moneyPattern.exec(raw.trim());
  const whole = match?.groups?.whole ?? '';
  const fraction = match?.groups?.fraction ?? '';
  if (!match || (whole === '' && fraction === '')) {
    throw new Error(`money: not a decimal string: ${JSON.stringify(raw)}`);
  }
  const magnitude = BigInt((whole === '' ? '0' : whole) + fraction);
  return { units: match.groups?.sign === '-' ? -magnitude : magnitude, scale: fraction.length };
};

const atScale = (money: ScaledMoney, scale: number): bigint => money.units * 10n ** BigInt(scale - money.scale);

const renderScaled = (units: bigint, scale: number): string => {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const split = digits.length - scale;
  const whole = digits.slice(0, split);
  const fraction = digits.slice(split);
  const fractionPart = scale > 0 ? `.${fraction}` : '';
  return `${negative ? '-' : ''}${whole}${fractionPart}`;
};

/** True when `raw` is a decimal string these helpers can operate on. */
export const isMoneyString = (raw: unknown): raw is string => {
  if (typeof raw !== 'string') {
    return false;
  }
  const match = moneyPattern.exec(raw.trim());
  return !!match && !(match.groups?.whole === '' && (match.groups.fraction ?? '') === '');
};

/** `a + b`, exact, at the wider of the two scales. Amounts only — see the mixed-currency rule. */
export const addMoney = (a: string, b: string): string => {
  const x = scaleMoney(a);
  const y = scaleMoney(b);
  const scale = Math.max(x.scale, y.scale);
  return renderScaled(atScale(x, scale) + atScale(y, scale), scale);
};

/** `a - b`, exact, at the wider of the two scales. */
export const subtractMoney = (a: string, b: string): string => {
  const x = scaleMoney(a);
  const y = scaleMoney(b);
  const scale = Math.max(x.scale, y.scale);
  return renderScaled(atScale(x, scale) - atScale(y, scale), scale);
};

/**
 * Exact sum of decimal strings, at the widest scale present. `[]` sums to
 * `"0"`. Amounts only: this does not look at currency, so do not hand it two.
 */
export const sumMoney = (values: readonly string[]): string => {
  if (values.length === 0) {
    return '0';
  }
  const scaled = values.map(scaleMoney);
  let scale = 0;
  for (const m of scaled) {
    scale = Math.max(scale, m.scale);
  }
  let total = 0n;
  for (const m of scaled) {
    total += atScale(m, scale);
  }
  return renderScaled(total, scale);
};

/**
 * One exact total PER currency code — the safe total for a ledger that mixes
 * currencies, because two currencies are two figures and neither converts.
 * Rows whose amount is not a decimal string are skipped, not coerced.
 *
 * @param rows - Anything carrying an amount and a currency
 * @param amountOf - Reads the decimal-string amount off a row
 * @param currencyOf - Reads the currency code off a row. Rows carrying none
 *   group under "—", so an unlabelled figure is never merged into a labelled
 *   one.
 */
export const sumMoneyByCurrency = <TRow>(
  rows: readonly TRow[],
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- reads an arbitrary row cell; isMoneyString below is the parse boundary
  amountOf: (row: TRow) => unknown,
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- reads an arbitrary row cell; narrowed to a non-empty string below
  currencyOf: (row: TRow) => unknown,
): Record<string, string> => {
  const totals: Record<string, string> = {};
  for (const row of rows) {
    const amount = amountOf(row);
    if (!isMoneyString(amount)) {
      continue;
    }
    const raw = currencyOf(row);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this is the parse boundary for the arbitrary currency cell
    const code = typeof raw === 'string' && raw !== '' ? raw : '—';
    const running = totals[code];
    totals[code] = running ? addMoney(running, amount) : amount;
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- keys are runtime currency codes, an open dictionary is the contract
  return totals;
};

/**
 * Numeric ordering of two money strings: negative, zero or positive.
 * `compareMoney("9.00", "10.00")` is negative — which string comparison gets
 * backwards, and which is the whole reason this type exists.
 */
export const compareMoney = (a: string, b: string): number => {
  const x = scaleMoney(a);
  const y = scaleMoney(b);
  const scale = Math.max(x.scale, y.scale);
  const delta = atScale(x, scale) - atScale(y, scale);
  if (delta < 0n) {
    return -1;
  }
  if (delta > 0n) {
    return 1;
  }
  return 0;
};

/**
 * Sort comparator for a money column: `compareMoney`, but total over anything
 * a row can hold. Blanks and non-decimal values sort BEFORE every real figure
 * rather than throwing, because a sort must not crash the table on one bad
 * row; the value is still visible in its own cell.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- sort comparator over arbitrary cell values; isMoneyString is the parse boundary
export const moneyComparator = (a: unknown, b: unknown): number => {
  const left = isMoneyString(a) ? a : null;
  const right = isMoneyString(b) ? b : null;
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return compareMoney(left, right);
};

/** True when the money string is negative — for colour, not for arithmetic. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- arbitrary cell value; the typeof check is the parse boundary
export const isNegativeMoney = (raw: unknown): boolean => typeof raw === 'string' && raw.trimStart().startsWith('-');

/**
 * Locale-formatted money for DISPLAY. Parsing here goes one way only: the
 * parsed number is never written back into the data.
 *
 * A non-decimal value comes back as its own string rather than as "NaN" or
 * "0.00", so a bad row reads as bad instead of as zero.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- arbitrary cell value; narrowed to a decimal string below
export const formatMoney = (raw: unknown, currency?: string, locale?: string): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- parse boundary for the arbitrary cell value
  if (typeof raw !== 'string' || raw === '') {
    return '';
  }
  if (!isMoneyString(raw)) {
    return raw;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return raw;
  }
  if (currency === undefined || currency === '') {
    return value.toLocaleString(locale, { minimumFractionDigits: 2 });
  }
  try {
    return value.toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  } catch {
    // An unknown / non-ISO code (Intl throws RangeError) still has to render
    // the figure. Prefix the code rather than dropping it.
    return `${currency} ${value.toLocaleString(locale, { minimumFractionDigits: 2 })}`;
  }
};
