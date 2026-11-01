/**
 * Safe evaluator for Frappe `depends_on` / `mandatory_depends_on` /
 * `read_only_depends_on` expressions — the ONE parser for every surface
 * (SchemaForm here, and the desk form engine next door in ./formEngine;
 * `@repo/backoffice` re-exports it from its old path).
 *
 * Frappe's desk evaluates these with JS `eval`; Hermes (React Native), GJS,
 * and CSP-restricted webviews cannot construct functions from strings, so
 * this module implements a tiny recursive-descent parser covering the
 * standard forms:
 *
 *   - bare fieldname:              `status`             → truthy check
 *   - eval with comparisons:       `eval:doc.status == "Open"`
 *     operators: == != === !== > < >= <=
 *   - boolean composition:         `eval:doc.a && (doc.b || !doc.c)`
 *   - unary negation:              `eval:!doc.archived`
 *   - literals: 'single'/"double" strings, numbers, true/false/null/undefined
 *   - membership: `eval:["A","B"].includes(doc.status)`
 *     and the legacy `eval:in_list(["A","B"], doc.status)`
 *   - coercion helpers frappe exposes as globals: `cint(x)`, `flt(x)`,
 *     `cstr(x)`, `cbool(x)` (real usage: User.change_password depends_on)
 *   - `.length` on string/array doc values
 *     (real usage: User.bypass_restrict_ip_check_if_2fa_enabled)
 *   - `parent.fieldname` — child-table rows evaluate with the parent doc in
 *     scope (desk passes `{doc, parent}` to `frappe.utils.eval`)
 *   - `frappe.session.user` — resolved from the injected `__session_user`
 *     doc key (callers inject it; absent → whole expression falls back)
 *
 * Desk also injects `__islocal` on unsaved docs; callers here do the same on
 * the doc they pass in (see DocFormScreen/useFormEngine), so `doc.__islocal`
 * needs no parser support beyond ordinary path lookup.
 *
 * NOT covered (documented gap): method calls other than the forms above,
 * arithmetic, template literals, other `frappe.*` globals. Unparseable
 * expressions fall back to the provided default so a bad expression can
 * never hide required desk functionality silently.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a Frappe doc of any doctype; expressions read its fields by name at runtime
export type DependsDoc = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- DependsDoc is the any-doctype doc above
export type DependsEvaluator = (doc: DependsDoc, parent?: DependsDoc) => boolean;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'lbracket' }
  | { kind: 'rbracket' }
  | { kind: 'comma' }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string };

const OPERATORS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!'];

interface TokenRead {
  /** Absent for skipped whitespace. */
  token?: Token;
  /** Input index just past the read. */
  end: number;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const PUNCTUATION = new Map<string, Token>([
  ['(', { kind: 'lparen' }],
  [')', { kind: 'rparen' }],
  ['[', { kind: 'lbracket' }],
  [']', { kind: 'rbracket' }],
  [',', { kind: 'comma' }],
]);
const DIGIT = /[0-9]/u;
const NUMBER_CHAR = /[0-9.]/u;
const IDENT_START = /[A-Za-z_$]/u;
const IDENT_CHAR = /[A-Za-z0-9_$.]/u;

const scanWhile = (input: string, start: number, pattern: RegExp): number => {
  let j = start;
  while (j < input.length && pattern.test(input[j])) {
    j += 1;
  }
  return j;
};

/** A quoted string starting at `start`; `undefined` when unterminated. */
const readString = (input: string, start: number): TokenRead | undefined => {
  const quote = input[start];
  let value = '';
  let i = start + 1;
  while (i < input.length && input[i] !== quote) {
    if (input[i] === '\\' && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
    } else {
      value += input[i];
      i += 1;
    }
  }
  if (i >= input.length) {
    return undefined;
  }
  return { token: { kind: 'string', value }, end: i + 1 };
};

/** The token at `i`; `undefined` when the input is unparseable there. */
const readToken = (input: string, i: number): TokenRead | undefined => {
  const ch = input[i];
  if (WHITESPACE.has(ch)) {
    return { end: i + 1 };
  }
  const punctuation = PUNCTUATION.get(ch);
  if (punctuation !== undefined) {
    return { token: punctuation, end: i + 1 };
  }
  if (ch === '"' || ch === "'") {
    return readString(input, i);
  }
  const opMatch = OPERATORS.find((op) => input.startsWith(op, i));
  if (opMatch !== undefined) {
    return { token: { kind: 'op', value: opMatch }, end: i + opMatch.length };
  }
  const next = input[i + 1] ?? '';
  if (DIGIT.test(ch) || (ch === '-' && DIGIT.test(next))) {
    const end = scanWhile(input, i + 1, NUMBER_CHAR);
    const num = Number(input.slice(i, end));
    return Number.isNaN(num) ? undefined : { token: { kind: 'number', value: num }, end };
  }
  // Identifiers; a leading "." supports `[..].includes(..)` member access.
  if (IDENT_START.test(ch) || (ch === '.' && IDENT_START.test(next))) {
    const end = scanWhile(input, i + 1, IDENT_CHAR);
    return { token: { kind: 'ident', value: input.slice(i, end) }, end };
  }
  // Unknown character → unparseable.
  return undefined;
};

const tokenize = (input: string): Token[] | undefined => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const read = readToken(input, i);
    if (read === undefined) {
      return undefined;
    }
    if (read.token !== undefined) {
      tokens.push(read.token);
    }
    i = read.end;
  }
  return tokens;
};

// ---------------------------------------------------------------------------
// Parser (recursive descent) → evaluator tree
// ---------------------------------------------------------------------------

/** Evaluation scope: the doc under evaluation + optional parent doc (child tables). */
interface DependsScope {
  doc: DependsDoc;
  parent?: DependsDoc;
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- expression values are whatever the doc holds; the evaluator mirrors JS dynamic typing
type ValueNode = (scope: DependsScope) => unknown;

/** Frappe global coercion helpers available inside eval: expressions. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- coercion helpers take and return arbitrary doc values, as desk's globals do
type CoerceFunction = (value: unknown) => unknown;

const COERCE_FUNCTIONS = new Map<string, CoerceFunction>([
  [
    'cint',
    (value) => {
      // oxlint-disable-next-line unicorn/prefer-number-coercion, typescript/no-base-to-string -- parseInt reads a leading integer ("12px" → 12) like Frappe's cint; Number() would give NaN
      const num = Number.parseInt(String(value ?? ''), 10);
      return Number.isNaN(num) ? 0 : num;
    },
  ],
  [
    'flt',
    (value) => {
      // oxlint-disable-next-line unicorn/prefer-number-coercion, typescript/no-base-to-string -- parseFloat reads a leading number ("1.5kg" → 1.5) like Frappe's flt; Number() would give NaN
      const num = Number.parseFloat(String(value ?? ''));
      return Number.isNaN(num) ? 0 : num;
    },
  ],
  // oxlint-disable-next-line typescript/no-base-to-string -- cstr is JS String() coercion of any doc value, as Frappe's cstr
  ['cstr', (value) => (value === null || value === undefined ? '' : String(value))],
  ['cbool', (value) => Boolean(value) && value !== '0' && value !== 'false'],
]);

/** JS truthiness, as desk eval applies it to any expression value. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- expression values are arbitrary doc values
const isTruthy: (value: unknown) => boolean = Boolean;

const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined;

// oxlint-disable-next-line anti-slop/no-unknown-returns -- a doc path resolves to whatever the doc holds; the evaluator mirrors JS dynamic typing
const getPath = (doc: DependsDoc, path: string[]): unknown => {
  let cur: unknown = doc;
  for (const key of path) {
    if (isNullish(cur)) {
      return undefined;
    }
    // `.length` works on strings and arrays too (real usage:
    // `eval:doc.restrict_ip && doc.restrict_ip.length`).
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- mirrors desk eval: `.length` reads on any string or array doc value
    if (key === 'length' && (typeof cur === 'string' || Array.isArray(cur))) {
      cur = cur.length;
      continue;
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- mirrors desk eval: only objects have fields to step into
    if (typeof cur !== 'object') {
      return undefined;
    }
    // SAFETY: cur is a non-null object here; reading an absent key yields undefined, which the next step handles
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above; doc values have no schema here
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares arbitrary doc and literal values with JS `==` semantics
const looseEquals = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (isNullish(a) || isNullish(b)) {
    return isNullish(a) && isNullish(b);
  }
  // Frappe docs use `==` loosely: "1" == 1, 0 == false, etc.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JS `==` coerces to number when either side is a number
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na === nb;
    }
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- JS `==` compares the string forms, as desk eval does
  return String(a) === String(b);
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- compares arbitrary doc and literal values with JS operator semantics
const compare = (op: string, a: unknown, b: unknown): boolean => {
  switch (op) {
    case '==': {
      return looseEquals(a, b);
    }
    case '!=': {
      return !looseEquals(a, b);
    }
    case '===': {
      return a === b;
    }
    case '!==': {
      return a !== b;
    }
    case '>':
    case '<':
    case '>=':
    case '<=': {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isNaN(na) || Number.isNaN(nb)) {
        return false;
      }
      if (op === '>') {
        return na > nb;
      }
      if (op === '<') {
        return na < nb;
      }
      if (op === '>=') {
        return na >= nb;
      }
      return na <= nb;
    }
    default: {
      return false;
    }
  }
};

class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): DependsEvaluator | undefined {
    const node = this.parseOr();
    if (!node || this.pos !== this.tokens.length) {
      return undefined;
    }
    return (doc, parent) => Boolean(node({ doc, parent }));
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private takeOp(...values: string[]): string | undefined {
    const tok = this.peek();
    if (tok?.kind === 'op' && values.includes(tok.value)) {
      this.pos += 1;
      return tok.value;
    }
    return undefined;
  }

  private parseOr(): ValueNode | undefined {
    let left = this.parseAnd();
    if (!left) {
      return undefined;
    }
    while (this.takeOp('||') !== undefined) {
      const right = this.parseAnd();
      if (!right) {
        return undefined;
      }
      const l: ValueNode = left;
      // JS `||`: the left value when truthy, else the right value.
      left = (scope) => {
        const value = l(scope);
        return isTruthy(value) ? value : right(scope);
      };
    }
    return left;
  }

  private parseAnd(): ValueNode | undefined {
    let left = this.parseComparison();
    if (!left) {
      return undefined;
    }
    while (this.takeOp('&&') !== undefined) {
      const right = this.parseComparison();
      if (!right) {
        return undefined;
      }
      const l: ValueNode = left;
      // JS `&&`: the right value when the left is truthy, else the left value.
      left = (scope) => {
        const value = l(scope);
        return isTruthy(value) ? right(scope) : value;
      };
    }
    return left;
  }

  private parseComparison(): ValueNode | undefined {
    const left = this.parseUnary();
    if (!left) {
      return undefined;
    }
    const op = this.takeOp('===', '!==', '==', '!=', '>=', '<=', '>', '<');
    if (op === undefined) {
      return left;
    }
    const right = this.parseUnary();
    if (!right) {
      return undefined;
    }
    return (scope) => compare(op, left(scope), right(scope));
  }

  private parseUnary(): ValueNode | undefined {
    if (this.takeOp('!') !== undefined) {
      const operand = this.parseUnary();
      if (!operand) {
        return undefined;
      }
      return (scope) => !isTruthy(operand(scope));
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ValueNode | undefined {
    const tok = this.peek();
    if (!tok) {
      return undefined;
    }

    if (tok.kind === 'lparen') {
      this.pos += 1;
      const inner = this.parseOr();
      if (!inner) {
        return undefined;
      }
      if (this.peek()?.kind !== 'rparen') {
        return undefined;
      }
      this.pos += 1;
      return inner;
    }

    // Array literal → only valid followed by .includes(operand)
    if (tok.kind === 'lbracket') {
      const items = this.parseArrayLiteral();
      if (!items) {
        return undefined;
      }
      const next = this.peek();
      if (next?.kind === 'ident' && next.value.startsWith('.includes')) {
        // tokenizer folds ".includes" into the ident stream only when glued;
        // handle both ".includes" ident and separate forms
        this.pos += 1;
        return this.finishIncludesCall(items);
      }
      // tokenizer produced ident "includes"? ".includes" starts with "." which
      // idents can't start with — the "." gets absorbed only after identifiers.
      return undefined;
    }

    if (tok.kind === 'string') {
      this.pos += 1;
      return () => tok.value;
    }
    if (tok.kind === 'number') {
      this.pos += 1;
      return () => tok.value;
    }
    if (tok.kind === 'ident') {
      this.pos += 1;
      return this.identNode(tok.value);
    }
    return undefined;
  }

  /** After `[...] .includes` — expects `( operand )`. */
  private finishIncludesCall(items: unknown[]): ValueNode | undefined {
    if (this.peek()?.kind !== 'lparen') {
      return undefined;
    }
    this.pos += 1;
    const operand = this.parseOr();
    if (!operand) {
      return undefined;
    }
    if (this.peek()?.kind !== 'rparen') {
      return undefined;
    }
    this.pos += 1;
    return (scope) => items.some((item) => looseEquals(item, operand(scope)));
  }

  private parseArrayLiteral(): unknown[] | undefined {
    if (this.peek()?.kind !== 'lbracket') {
      return undefined;
    }
    this.pos += 1;
    const items: unknown[] = [];
    for (;;) {
      const tok = this.peek();
      if (!tok) {
        return undefined;
      }
      if (tok.kind === 'rbracket') {
        this.pos += 1;
        return items;
      }
      if (tok.kind === 'string' || tok.kind === 'number') {
        items.push(tok.value);
        this.pos += 1;
      } else {
        return undefined;
      }
      if (this.peek()?.kind === 'comma') {
        this.pos += 1;
      }
    }
  }

  /** After `in_list` — expects `( [..], operand )`. */
  private finishInListCall(): ValueNode | undefined {
    if (this.peek()?.kind !== 'lparen') {
      return undefined;
    }
    this.pos += 1;
    const items = this.parseArrayLiteral();
    if (!items) {
      return undefined;
    }
    if (this.peek()?.kind !== 'comma') {
      return undefined;
    }
    this.pos += 1;
    const operand = this.parseOr();
    if (!operand) {
      return undefined;
    }
    if (this.peek()?.kind !== 'rparen') {
      return undefined;
    }
    this.pos += 1;
    return (scope) => items.some((item) => looseEquals(item, operand(scope)));
  }

  /** After a coercion global's name — expects `( operand )`. */
  private finishCoerceCall(coerce: CoerceFunction): ValueNode | undefined {
    if (this.peek()?.kind !== 'lparen') {
      return undefined;
    }
    this.pos += 1;
    const operand = this.parseOr();
    if (!operand) {
      return undefined;
    }
    if (this.peek()?.kind !== 'rparen') {
      return undefined;
    }
    this.pos += 1;
    return (scope) => coerce(operand(scope));
  }

  private identNode(name: string): ValueNode | undefined {
    // `in_list([..], doc.x)` legacy membership helper
    if (name === 'in_list') {
      return this.finishInListCall();
    }

    // Frappe coercion globals: `cint(doc.x)`, `flt(..)`, `cstr(..)`, `cbool(..)`.
    const coerce = COERCE_FUNCTIONS.get(name);
    if (coerce) {
      return this.finishCoerceCall(coerce);
    }

    if (name === 'true') {
      return () => true;
    }
    if (name === 'false') {
      return () => false;
    }
    if (name === 'null' || name === 'undefined') {
      // oxlint-disable-next-line react/function-component-definition -- the null-literal evaluator, not a React component
      return () => null;
    }

    // Desk evaluates with the global `frappe` in scope; the only pattern seen
    // in stock meta is `frappe.session.user`. Callers inject it as the
    // `__session_user` doc key; when absent the node throws so the compiled
    // wrapper falls back instead of silently comparing against undefined.
    if (name === 'frappe.session.user') {
      return (scope) => {
        const user = scope.doc.__session_user;
        if (user === undefined) {
          throw new Error('session user not injected');
        }
        return user;
      };
    }

    // `[..].includes(doc.x)` — the tokenizer glues ".includes" onto nothing;
    // arrays are handled in parsePrimary. Here handle `doc.field` and
    // `doc.field.includes` is unsupported (returns path value only).
    if (name.startsWith('doc.')) {
      const path = name.slice(4).split('.');
      return (scope) => getPath(scope.doc, path);
    }

    // `parent.fieldname` — child-table rows evaluate with the parent doc in
    // scope (desk hands the evaluator both doc and parent). No parent
    // provided → throw so the fallback applies (falling back is the safe
    // superset for visibility).
    if (name.startsWith('parent.')) {
      const path = name.slice(7).split('.');
      return (scope) => {
        if (!scope.parent) {
          throw new Error('parent doc not in scope');
        }
        return getPath(scope.parent, path);
      };
    }

    // Dotted access on anything else (other `frappe.*` globals etc.) is
    // outside the safe subset — treat the whole expression as unparseable
    // so the caller's fallback applies instead of a silently-wrong lookup.
    if (name.includes('.')) {
      return undefined;
    }

    // Bare fieldname (rare inside eval:, but harmless as a doc lookup).
    return (scope) => scope.doc[name];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const compileCache = new Map<string, DependsEvaluator | undefined>();

/**
 * Compile a depends_on expression into a safe evaluator.
 *
 * @param expression - Raw expression (`eval:doc.x == 'y'` or bare fieldname)
 * @param fallback - Result when the expression cannot be parsed (visibility
 *   defaults to `true` so a field is never silently lost; mandatory /
 *   read-only callers pass `false`).
 */
export const compileDependsOn = (expression: string | undefined, fallback = true): DependsEvaluator | undefined => {
  if (expression === undefined || expression.trim() === '') {
    return undefined;
  }
  const trimmed = expression.trim();
  const cacheKey = `${fallback ? 1 : 0}:${trimmed}`;
  if (compileCache.has(cacheKey)) {
    return compileCache.get(cacheKey);
  }

  let evaluator: DependsEvaluator | undefined;
  if (trimmed.startsWith('eval:')) {
    const tokens = tokenize(trimmed.slice(5).trim());
    const parsed = tokens ? new Parser(tokens).parse() : undefined;
    evaluator = parsed
      ? (doc, parent) => {
          try {
            return parsed(doc, parent);
          } catch {
            return fallback;
          }
        }
      : () => fallback;
  } else {
    // Bare fieldname truthiness (Frappe treats 0 / "" / null as falsy;
    // array values count their rows — desk: `$.isArray(v) ? !!v.length`).
    const fieldname = trimmed;
    evaluator = (doc) => {
      const value = doc[fieldname];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (value === undefined || value === null) {
        return false;
      }
      return value !== 0 && value !== '' && value !== false;
    };
  }
  compileCache.set(cacheKey, evaluator);
  return evaluator;
};

/** Evaluate an expression once against a doc (convenience wrapper). */
export const evaluateDependsOn = (
  expression: string | undefined,
  doc: DependsDoc,
  fallback = true,
  parent?: DependsDoc,
): boolean => {
  const evaluator = compileDependsOn(expression, fallback);
  if (!evaluator) {
    return true;
  }
  return evaluator(doc, parent);
};
