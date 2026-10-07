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

export type DependsDoc = Record<string, unknown>;
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

function tokenize(input: string): Token[] | undefined {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      tokens.push({ kind: 'lbracket' });
      i += 1;
      continue;
    }
    if (ch === ']') {
      tokens.push({ kind: 'rbracket' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = '';
      i += 1;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
          continue;
        }
        value += input[i];
        i += 1;
      }
      if (i >= input.length) {
        return undefined;
      } // unterminated string
      i += 1;
      tokens.push({ kind: 'string', value });
      continue;
    }
    const opMatch = OPERATORS.find((op) => input.startsWith(op, i));
    if (opMatch) {
      tokens.push({ kind: 'op', value: opMatch });
      i += opMatch.length;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) {
        j += 1;
      }
      const num = Number(input.slice(i, j));
      if (Number.isNaN(num)) {
        return undefined;
      }
      tokens.push({ kind: 'number', value: num });
      i = j;
      continue;
    }
    // Identifiers; a leading "." supports `[..].includes(..)` member access.
    if (/[A-Za-z_$]/.test(ch) || (ch === '.' && /[A-Za-z_$]/.test(input[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_$.]/.test(input[j])) {
        j += 1;
      }
      tokens.push({ kind: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }
    return undefined; // unknown character → unparseable
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent) → evaluator tree
// ---------------------------------------------------------------------------

/** Evaluation scope: the doc under evaluation + optional parent doc (child tables). */
interface DependsScope {
  doc: DependsDoc;
  parent?: DependsDoc;
}

type ValueNode = (scope: DependsScope) => unknown;

/** Frappe global coercion helpers available inside eval: expressions. */
const COERCE_FUNCTIONS: Record<string, (value: unknown) => unknown> = {
  cint: (value) => {
    const num = Number.parseInt(String(value ?? ''), 10);
    return Number.isNaN(num) ? 0 : num;
  },
  flt: (value) => {
    const num = Number.parseFloat(String(value ?? ''));
    return Number.isNaN(num) ? 0 : num;
  },
  cstr: (value) => (value === null || value === undefined ? '' : String(value)),
  cbool: (value) => !!value && value !== '0' && value !== 'false',
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
    return (doc, parent) => !!node({ doc, parent });
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
    while (this.takeOp('||')) {
      const right = this.parseAnd();
      if (!right) {
        return undefined;
      }
      const l = left;
      left = (scope) => (l(scope) as boolean) || (right(scope) as boolean);
    }
    return left;
  }

  private parseAnd(): ValueNode | undefined {
    let left = this.parseComparison();
    if (!left) {
      return undefined;
    }
    while (this.takeOp('&&')) {
      const right = this.parseComparison();
      if (!right) {
        return undefined;
      }
      const l = left;
      left = (scope) => (l(scope) as boolean) && (right(scope) as boolean);
    }
    return left;
  }

  private parseComparison(): ValueNode | undefined {
    const left = this.parseUnary();
    if (!left) {
      return undefined;
    }
    const op = this.takeOp('===', '!==', '==', '!=', '>=', '<=', '>', '<');
    if (!op) {
      return left;
    }
    const right = this.parseUnary();
    if (!right) {
      return undefined;
    }
    return (scope) => compare(op, left(scope), right(scope));
  }

  private parseUnary(): ValueNode | undefined {
    if (this.takeOp('!')) {
      const operand = this.parseUnary();
      if (!operand) {
        return undefined;
      }
      return (scope) => !operand(scope);
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

  private identNode(name: string): ValueNode | undefined {
    // `in_list([..], doc.x)` legacy membership helper
    if (name === 'in_list') {
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

    // Frappe coercion globals: `cint(doc.x)`, `flt(..)`, `cstr(..)`, `cbool(..)`.
    const coerce = COERCE_FUNCTIONS[name];
    if (coerce) {
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

    if (name === 'true') {
      return () => true;
    }
    if (name === 'false') {
      return () => false;
    }
    if (name === 'null' || name === 'undefined') {
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

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function getPath(doc: DependsDoc, path: string[]): unknown {
  let cur: unknown = doc;
  for (const key of path) {
    if (isNullish(cur)) {
      return undefined;
    }
    // `.length` works on strings and arrays too (real usage:
    // `eval:doc.restrict_ip && doc.restrict_ip.length`).
    if (key === 'length' && (typeof cur === 'string' || Array.isArray(cur))) {
      cur = cur.length;
      continue;
    }
    if (typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (isNullish(a) || isNullish(b)) {
    return isNullish(a) && isNullish(b);
  }
  // Frappe docs use `==` loosely: "1" == 1, 0 == false, etc.
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na === nb;
    }
  }
  return String(a) === String(b);
}

function compare(op: string, a: unknown, b: unknown): boolean {
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
export function compileDependsOn(expression: string | undefined, fallback = true): DependsEvaluator | undefined {
  if (!expression || !expression.trim()) {
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
      return value !== undefined && value !== null && value !== 0 && value !== '' && value !== false;
    };
  }
  compileCache.set(cacheKey, evaluator);
  return evaluator;
}

/** Evaluate an expression once against a doc (convenience wrapper). */
export function evaluateDependsOn(
  expression: string | undefined,
  doc: DependsDoc,
  fallback = true,
  parent?: DependsDoc,
): boolean {
  const evaluator = compileDependsOn(expression, fallback);
  if (!evaluator) {
    return true;
  }
  return evaluator(doc, parent);
}
