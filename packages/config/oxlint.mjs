/**
 * Oxlint JS plugin — workspace convention rules.
 *
 * Consuming apps enable it with one config line:
 *
 *   { "jsPlugins": ["@repo/config/oxlint"] }
 *
 * Rules:
 *   mpo-conventions/no-hex-literals — ban #rgb/#rrggbb(/aa) and rgb()/hsl()
 *     string literals. Palette modules (themes/base, themes/accent, and
 *     files whose name contains "palette") are exempt: a 12-step ramp is
 *     the deliverable. So is a file with a `// hex-escape: <reason>`
 *     comment, a surface no theme token reaches; lint.mjs fails the comment
 *     unless the spec's `## Colour-literal escapes` table has that file and
 *     reason.
 *   mpo-conventions/no-raw-typography — app text never rides raw
 *     Tamagui*-prefixed typography escape hatches (TamaguiText, TamaguiHeading,
 *     TamaguiH1…, TamaguiParagraph, TamaguiSizableText, TamaguiAnchor) outside
 *     packages/. House Text/Heading shadows are the bare names.
 *   mpo-conventions/no-chrome-props — ban chrome (background, radius, type,
 *     shadow, elevation) as props on imported @repo/* components,
 *     even at a valid token. Layout props (flex, alignSelf, sibling margins)
 *     stay legal. Exceptions come from the spec DRAWING table's CHROME-ALLOW
 *     row, not from the code.
 *   mpo-conventions/no-raw-geometry — ban numeric height/width/padding/fontSize
 *     on those same imports. `0` is a zero-reset and stays legal. Silent
 *     behind sizeRecipeEscape() and inside a file listed as DRAWING. An
 *     undeclared `// mpo-drawing` pragma is a lint.mjs failure, not a skip
 *     here.
 *   mpo-conventions/no-child-margin — the parent owns the gap. Ban a
 *     non-zero margin* prop on any element nested inside another element's
 *     JSX. The outermost element of a tree is left alone (a file cannot see
 *     whether its root is a screen's), and element names the spec's
 *     `## Slot margins` SLOT-MARGIN row lists are the declared slots.
 *   mpo-conventions/no-parameter-properties — ban TypeScript constructor
 *     parameter properties (`constructor(readonly hash: Hash)`). vxrn's
 *     native dev bundle lowers a class to a function and can leave the
 *     modifier on that function's parameter, and rolldown then refuses the
 *     whole bundle with `'readonly' modifier cannot appear on a parameter`.
 *     Declare the field and assign it in the constructor.
 */

import { isDrawingFile, readDrawingRegistry } from './drawing-registry.mjs';
import { readSlotMarginRegistry } from './spec-registry.mjs';

/** Hex + functional CSS colour literals. AST-visited only (not a text scan). */
export const COLOR_LITERAL = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgba?|hsla?)\([^)]*\)/iu;

/** Palette modules where a 12-step ramp in hex/hsl is the deliverable (EN-2). */
export const PALETTE_FILE =
  /(?:^|\/)themes\/(?:base|accent)\.(?:tsx?|jsx?)$|(?:^|\/)[^/]*palette[^/]*\.(?:tsx?|jsx?)$/iu;

/**
 * A `hex-escape: <reason>` line or block comment. A JSDoc `*` line or a
 * backticked mention is prose about the marker, not the marker.
 */
const HEX_ESCAPE_COMMENT = /(?<!`)(?:\/\/|\/\*)\s*hex-escape:(?<rest>.*)$/u;

/**
 * Every `hex-escape:` comment in a source file, with the reason it writes.
 * @param {string} src source text of one file
 * @returns {{ line: number, reason: string }[]} one entry per marker comment, with its trimmed reason
 */
export const findHexEscapes = (src) => {
  if (!src.includes('hex-escape:')) {
    return [];
  }
  /** @type {{ line: number, reason: string }[]} */
  const sites = [];
  for (const [index, text] of src.split('\n').entries()) {
    const match = text.trim().startsWith('*') ? null : HEX_ESCAPE_COMMENT.exec(text);
    if (match) {
      const [reason] = (match.groups?.rest ?? '').split('*/');
      sites.push({ line: index + 1, reason: reason.trim() });
    }
  }
  return sites;
};

/**
 * @typedef {string | number | boolean | bigint | RegExp | null} LiteralValue
 */

/**
 * The slice of an ESTree / JSX node that these rules read.
 * @typedef {object} AstNode
 * @property {string} [type] node kind
 * @property {string | AstNode} [name] identifier name, or the name node of a JSX attribute
 * @property {AstNode | LiteralValue} [value] literal value, JSX attribute value or template element value
 * @property {string | null} [cooked] template element text
 * @property {string} [operator] unary operator
 * @property {AstNode} [argument] unary operand
 * @property {AstNode} [expression] JSX expression container content
 * @property {AstNode} [callee] call target
 * @property {AstNode} [object] member object
 * @property {AstNode} [property] member property
 * @property {AstNode} [imported] imported binding
 * @property {AstNode} [local] local binding
 * @property {AstNode} [source] import source
 * @property {AstNode[]} [specifiers] import specifiers
 * @property {AstNode[]} [attributes] JSX attributes
 * @property {AstNode} [parameter] TS parameter property target
 * @property {AstNode} [left] default-valued parameter target
 */

/**
 * A node field that may hold a literal as well as a node.
 * @typedef {AstNode | LiteralValue | undefined} NodeValue
 */

/**
 * @typedef {object} RuleOptions
 * @property {string[]} [slotMargins] element names that may carry a margin
 * @property {string[]} [drawings] files allowed raw geometry
 * @property {string[]} [chromeAllow] elements allowed chrome props
 */

/**
 * The slice of the rule context that these rules use.
 * @typedef {object} RuleContext
 * @property {string} [filename] file being linted
 * @property {() => string} [getFilename] legacy accessor for the file being linted
 * @property {{ text?: string }} [sourceCode] source of the file being linted
 * @property {() => { text?: string }} [getSourceCode] legacy accessor for the source
 * @property {(RuleOptions | undefined)[]} [options] rule options
 * @property {(report: { node: AstNode, messageId: string, data?: Record<string, string> }) => void} report reports a violation
 */

/**
 * @typedef {Record<string, (node: AstNode) => void>} Visitors
 */

/**
 * @param {RuleContext} context rule context
 * @returns {string} source text of the linted file
 */
const sourceText = (context) => context.sourceCode?.text ?? context.getSourceCode?.()?.text ?? '';

/**
 * @param {RuleContext} context rule context
 * @returns {string} path of the linted file
 */
const filenameOf = (context) => context.filename ?? context.getFilename?.() ?? '';

/**
 * ESTree literal values are only distinguishable at runtime, so the guards
 * below are the one place that inspects their JS type.
 * @param {NodeValue} value a node field
 * @returns {value is string} true for a string literal value
 */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- ESTree literal values carry no static type; this guard is the single boundary check
const isString = (value) => typeof value === 'string';

/**
 * @param {NodeValue} value a node field
 * @returns {value is number} true for a numeric literal value
 */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- ESTree literal values carry no static type; this guard is the single boundary check
const isNumber = (value) => typeof value === 'number';

/**
 * @param {NodeValue} value a node field
 * @returns {value is AstNode} true when the field holds a node rather than a literal
 */
// oxlint-disable-next-line anti-slop/no-runtime-typeof -- ESTree literal values carry no static type; this guard is the single boundary check
const isNode = (value) => typeof value === 'object' && value !== null && !(value instanceof RegExp);

const RAW_TYPOGRAPHY_HATCH = /^Tamagui(?:Text|SizableText|Paragraph|Heading|H[1-6]|Anchor)$/u;

/**
 * Chrome props banned on imported `@repo/*` components
 * (including Tamagui shorthands). Layout composition through `{...props}`
 * stays legal.
 */
export const CHROME_PROPS = Object.freeze([
  'backgroundColor',
  'bg',
  'borderColor',
  'bc',
  'borderWidth',
  'bw',
  'borderRadius',
  'br',
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'elevation',
  'fontFamily',
  'ff',
  'fontWeight',
  'fow',
  'color',
]);

/**
 * Layout props callers may pass through the sanctioned `{...props}` hatch.
 * Sibling margins are layout; chrome (background, radius, type) is not.
 */
export const LAYOUT_PROPS = Object.freeze([
  'flex',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'alignSelf',
  'alignItems',
  'justifyContent',
  'position',
  'zIndex',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
]);

/**
 * Numeric geometry no-raw-geometry flags on imported house components.
 * Token strings (`"$4"`) and identifiers do not match; only a numeric
 * literal (or one wrapped in sizeRecipeEscape) is in scope.
 */
export const GEOMETRY_PROPS = Object.freeze([
  'height',
  'minHeight',
  'maxHeight',
  'width',
  'minWidth',
  'maxWidth',
  'paddingHorizontal',
  'paddingVertical',
  'padding',
  'fontSize',
]);

/**
 * Every spelling of an outer margin: the long props @tamagui/helpers registers
 * and the Tamagui shorthands for them. `00` L9a overrules the LAYOUT_PROPS
 * allowance for sibling margins above: the place among siblings is the
 * parent's `gap`.
 */
export const MARGIN_PROPS = Object.freeze([
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
  'm',
  'mt',
  'mr',
  'mb',
  'ml',
  'mx',
  'my',
]);

const CHROME_PROP_SET = new Set(CHROME_PROPS);
const MARGIN_PROP_SET = new Set(MARGIN_PROPS);
const ZERO_VALUE = /^(?:-?0(?:\.0+)?(?:px)?|\$0)$/u;
const GEOMETRY_PROP_SET = new Set(GEOMETRY_PROPS);

const RULE_OPTIONS_SCHEMA = [
  {
    type: 'object',
    additionalProperties: false,
    properties: {
      drawings: { type: 'array', items: { type: 'string' } },
      chromeAllow: { type: 'array', items: { type: 'string' } },
    },
  },
];

const SLOT_MARGIN_OPTIONS_SCHEMA = [
  {
    type: 'object',
    additionalProperties: false,
    properties: {
      slotMargins: { type: 'array', items: { type: 'string' } },
    },
  },
];

/**
 * @param {AstNode | undefined} node a node that may carry a plain-string name
 * @returns {string} the node's own name, or '' when it has none
 */
const nameOf = (node) => {
  const name = node?.name;
  return isString(name) ? name : '';
};

/**
 * @param {RuleContext} context rule context
 * @returns {Set<string>} element names allowed a margin, from the rule option or the spec registry
 */
const resolveSlotMargins = (context) => {
  const opt = context.options?.[0] ?? {};
  if (Array.isArray(opt.slotMargins)) {
    return new Set(opt.slotMargins);
  }
  try {
    return new Set(readSlotMarginRegistry().members);
  } catch {
    return new Set();
  }
};

/**
 * @param {NodeValue} value a JSX attribute value
 * @returns {NodeValue} the expression inside any `{…}` containers
 */
const unwrapJsxValue = (value) => {
  if (isNode(value) && value.type === 'JSXExpressionContainer') {
    return unwrapJsxValue(value.expression);
  }
  return value;
};

/**
 * `0` is `00` L8 E1, legal anywhere: a zero-reset is the absence of an outer
 * margin or a size, not one (Tamagui's own headings ship `margin: 0`, and
 * `minWidth={0}` is what lets a flex child shrink below its content).
 * @param {NodeValue} value a JSX attribute value
 * @returns {boolean} true when the value is a zero literal
 */
const isZeroReset = (value) => {
  const node = unwrapJsxValue(value);
  if (!isNode(node)) {
    return false;
  }
  if (node.type === 'Literal') {
    if (isNumber(node.value)) {
      return node.value === 0;
    }
    if (isString(node.value)) {
      return ZERO_VALUE.test(node.value.trim());
    }
  }
  return node.type === 'UnaryExpression' && node.operator === '-' && isZeroReset(node.argument);
};

/**
 * @param {RuleContext} context rule context
 * @returns {{ drawings: string[], chromeAllow: Set<string> }} the files allowed raw geometry and the elements allowed chrome props
 */
const resolveAllowlists = (context) => {
  const opt = context.options?.[0] ?? {};
  if (Array.isArray(opt.drawings) || Array.isArray(opt.chromeAllow)) {
    return {
      drawings: Array.isArray(opt.drawings) ? opt.drawings : [],
      chromeAllow: new Set(Array.isArray(opt.chromeAllow) ? opt.chromeAllow : []),
    };
  }
  try {
    const registry = readDrawingRegistry();
    return { drawings: registry.files, chromeAllow: new Set(registry.chromeAllow) };
  } catch {
    return { drawings: [], chromeAllow: new Set() };
  }
};

/**
 * @param {NodeValue} source an import source value
 * @returns {boolean} true for an `@repo/*` specifier
 */
const isHousePackage = (source) => isString(source) && source.startsWith('@repo/');

/**
 * @param {AstNode} specifier an import specifier
 * @returns {NodeValue} the local binding name, falling back to the imported name
 */
const specifierLocalName = (specifier) =>
  specifier.local?.name ?? specifier.imported?.name ?? specifier.imported?.value;

/**
 * Walk a JSX name node into "Card" or "Menu.Content".
 * @param {AstNode | undefined} name a JSX element name node
 * @returns {string} the dotted component name, or '' when the node is not a name
 */
const jsxName = (name) => {
  if (name == null) {
    return '';
  }
  if (name.type === 'JSXIdentifier') {
    return nameOf(name);
  }
  if (name.type === 'JSXMemberExpression') {
    const object = jsxName(name.object);
    const property = nameOf(name.property);
    return object && property ? `${object}.${property}` : object || property;
  }
  return '';
};

/**
 * @param {AstNode} attr a JSX attribute or spread attribute
 * @returns {string} the attribute name, or '' for a spread
 */
const jsxAttrName = (attr) => (attr.type === 'JSXAttribute' && isNode(attr.name) ? nameOf(attr.name) : '');

/**
 * @param {NodeValue} value a JSX attribute value
 * @returns {boolean} true for a (possibly negated) numeric literal
 */
const isNumericLiteral = (value) => {
  const node = unwrapJsxValue(value);
  if (!isNode(node)) {
    return false;
  }
  if (node.type === 'Literal' && isNumber(node.value)) {
    return true;
  }
  return node.type === 'UnaryExpression' && node.operator === '-' && isNumericLiteral(node.argument);
};

/**
 * @param {NodeValue} value a JSX attribute value
 * @returns {boolean} true for a `sizeRecipeEscape(...)` call
 */
const isSizeRecipeEscape = (value) => {
  const node = unwrapJsxValue(value);
  if (!isNode(node) || node.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (callee == null) {
    return false;
  }
  if (callee.type === 'Identifier' && callee.name === 'sizeRecipeEscape') {
    return true;
  }
  return callee.type === 'MemberExpression' && callee.property?.name === 'sizeRecipeEscape';
};

/**
 * @param {AstNode} importNode an import declaration
 * @param {Set<string>} locals receives the named bindings imported from `@repo/*`
 * @param {Set<string>} namespaces receives the namespace bindings imported from `@repo/*`
 */
const collectHouseLocals = (importNode, locals, namespaces) => {
  if (!isHousePackage(importNode.source?.value)) {
    return;
  }
  for (const specifier of importNode.specifiers ?? []) {
    const namespaceName = specifier.type === 'ImportNamespaceSpecifier' ? nameOf(specifier.local) : '';
    if (namespaceName === '') {
      const local = specifierLocalName(specifier);
      if (isString(local) && local !== '') {
        locals.add(local);
      }
    } else {
      namespaces.add(namespaceName);
    }
  }
};

/**
 * @param {string} name a JSX element name
 * @param {Set<string>} locals named `@repo/*` bindings
 * @param {Set<string>} namespaces namespace `@repo/*` bindings
 * @returns {boolean} true when the element is an `@repo/*` component
 */
const isHouseElement = (name, locals, namespaces) => {
  if (!name) {
    return false;
  }
  if (locals.has(name)) {
    return true;
  }
  const dot = name.indexOf('.');
  if (dot === -1) {
    return false;
  }
  return namespaces.has(name.slice(0, dot));
};

/**
 * Bare component name for CHROME-ALLOW matching (`Menu.Item` → `Item` and `Menu.Item`).
 * @param {string} name a JSX element name
 * @returns {string[]} the full name, plus the last segment when dotted
 */
const elementAllowKeys = (name) => {
  const keys = [name];
  const dot = name.lastIndexOf('.');
  if (dot !== -1) {
    keys.push(name.slice(dot + 1));
  }
  return keys;
};

/**
 * @typedef {object} HouseElement
 * @property {AstNode} node the JSX opening element
 * @property {string} name its dotted component name
 * @property {string} filename the linted file
 * @property {string[]} drawings files allowed raw geometry
 * @property {Set<string>} chromeAllow elements allowed chrome props
 */

/**
 * @param {RuleContext} context rule context
 * @param {(element: HouseElement) => void} onHouseElement called for every JSX element that is an `@repo/*` component
 * @returns {{ drawings: string[], chromeAllow: Set<string>, filename: string, visitors: Visitors }} the allowlists and the visitors to register
 */
const houseJsxVisitors = (context, onHouseElement) => {
  const filename = filenameOf(context);
  const { drawings, chromeAllow } = resolveAllowlists(context);
  /** @type {Set<string>} */
  const locals = new Set();
  /** @type {Set<string>} */
  const namespaces = new Set();
  /** @type {(node: AstNode) => void} */
  const onImportDeclaration = (node) => {
    collectHouseLocals(node, locals, namespaces);
  };
  /** @type {(node: AstNode) => void} */
  const onJsxOpeningElement = (node) => {
    const name = jsxName(node.name);
    if (isHouseElement(name, locals, namespaces)) {
      onHouseElement({ node, name, filename, drawings, chromeAllow });
    }
  };
  return {
    drawings,
    chromeAllow,
    filename,
    visitors: { ImportDeclaration: onImportDeclaration, JSXOpeningElement: onJsxOpeningElement },
  };
};

/**
 * @param {string | undefined} filename path being linted
 * @returns {boolean} true for a palette module, where colour literals are the deliverable
 */
export const isPaletteModule = (filename) => {
  if (filename === undefined || filename === '') {
    return false;
  }
  const normalized = filename.replaceAll('\\', '/');
  return PALETTE_FILE.test(normalized);
};

/**
 * @param {NodeValue} value a literal value
 * @returns {string | undefined} the matched literal, if any
 */
export const matchColorLiteral = (value) => (isString(value) ? COLOR_LITERAL.exec(value)?.[0] : undefined);

/**
 * @param {AstNode} attr a JSX attribute
 * @returns {boolean} true for a non-zero numeric geometry prop outside a size-recipe escape
 */
const isRawGeometry = (attr) => {
  if (!GEOMETRY_PROP_SET.has(jsxAttrName(attr))) {
    return false;
  }
  if (isSizeRecipeEscape(attr.value)) {
    return false;
  }
  return isNumericLiteral(attr.value) && !isZeroReset(attr.value);
};

/**
 * @typedef {object} RuleModule
 * @property {object} meta rule metadata
 * @property {(context: RuleContext) => Visitors} create builds the visitors for one file
 */

/**
 * @typedef {object} RulePlugin
 * @property {{ name: string }} meta plugin metadata
 * @property {Record<string, RuleModule>} rules the rules, by name
 */

/** @type {RulePlugin} */
export const plugin = {
  meta: {
    name: 'mpo-conventions',
  },
  rules: {
    'no-hex-literals': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hex / rgb / hsl color literals; use theme tokens / knob recipes instead.',
        },
        schema: [],
        messages: {
          hex: 'Color literal {{value}} is banned. Use theme tokens (e.g. $color10) or semantic ramps.',
        },
      },
      create(context) {
        if (isPaletteModule(filenameOf(context))) {
          return {};
        }
        if (findHexEscapes(sourceText(context)).some((site) => site.reason)) {
          return {};
        }

        /**
         * @param {AstNode} node the node holding the value
         * @param {NodeValue} value the value to test
         */
        const reportIfColor = (node, value) => {
          const matched = matchColorLiteral(value);
          if (matched !== undefined && matched !== '') {
            context.report({
              node,
              messageId: 'hex',
              data: { value: matched },
            });
          }
        };

        /** @type {(node: AstNode) => void} */
        const onLiteral = (node) => {
          if (isString(node.value)) {
            reportIfColor(node, node.value);
          }
        };
        /** @type {(node: AstNode) => void} */
        const onTemplateElement = (node) => {
          reportIfColor(node, isNode(node.value) ? (node.value.cooked ?? '') : '');
        };
        return { Literal: onLiteral, TemplateElement: onTemplateElement };
      },
    },
    'no-raw-typography': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Never render app text through raw typography. Use the house Text/SizableText/Paragraph/Anchor and Heading/H1-H6 (the bare @repo/ui names), which carry the typography knobs on every platform.',
        },
        schema: [],
        messages: {
          rawTypography:
            '{{name}} is a raw typography escape hatch — knob-dead on every platform. Import the bare house name from @repo/ui instead.',
        },
      },
      create(context) {
        /** @type {(node: AstNode) => void} */
        const onImportDeclaration = (node) => {
          if (node.source?.value !== '@repo/ui') {
            return;
          }
          for (const specifier of node.specifiers ?? []) {
            const imported = specifier.imported?.name ?? specifier.imported?.value;
            if (specifier.type === 'ImportSpecifier' && isString(imported) && RAW_TYPOGRAPHY_HATCH.test(imported)) {
              context.report({
                node: specifier,
                messageId: 'rawTypography',
                data: { name: imported },
              });
            }
          }
        };
        return { ImportDeclaration: onImportDeclaration };
      },
    },
    'no-chrome-props': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Ban chrome props (background, radius, type, shadow, elevation) on imported @repo/* components. Layout props stay legal.',
        },
        schema: RULE_OPTIONS_SCHEMA,
        messages: {
          chrome:
            '{{prop}} is chrome, not layout — it belongs to the system, not the caller. Pass layout (flex, alignSelf, sibling margin) or a named knob; do not restyle {{name}}.',
        },
      },
      create(context) {
        const { visitors } = houseJsxVisitors(context, ({ node, name, chromeAllow }) => {
          if (elementAllowKeys(name).some((key) => chromeAllow.has(key))) {
            return;
          }
          for (const attr of node.attributes ?? []) {
            const prop = jsxAttrName(attr);
            if (CHROME_PROP_SET.has(prop)) {
              context.report({
                node: attr,
                messageId: 'chrome',
                data: { prop, name },
              });
            }
          }
        });
        return visitors;
      },
    },
    'no-raw-geometry': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Ban non-zero numeric geometry on imported @repo/* components unless wrapped in sizeRecipeEscape or the file is a declared drawing.',
        },
        schema: RULE_OPTIONS_SCHEMA,
        messages: {
          geometry:
            'Numeric {{prop}} on {{name}} bypasses the size recipe. Wrap with sizeRecipeEscape() or move the drawing into a file listed under DRAWING in the spec.',
        },
      },
      create(context) {
        const { visitors } = houseJsxVisitors(context, ({ node, name, filename, drawings }) => {
          if (isDrawingFile(filename, drawings)) {
            return;
          }
          for (const attr of node.attributes ?? []) {
            if (isRawGeometry(attr)) {
              context.report({
                node: attr,
                messageId: 'geometry',
                data: { prop: jsxAttrName(attr), name },
              });
            }
          }
        });
        return visitors;
      },
    },
    'no-child-margin': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "The parent owns the gap. Ban a non-zero margin* prop on any element nested inside another element's JSX, unless the spec declares the element a slot.",
        },
        schema: SLOT_MARGIN_OPTIONS_SCHEMA,
        messages: {
          childMargin:
            "{{prop}} on {{name}} is an outer margin on a child. Set `gap` on the parent, express the slot as flex, or declare {{name}} in the spec's ## Slot margins table.",
        },
      },
      create(context) {
        const slotMargins = resolveSlotMargins(context);
        let depth = 0;
        const enter = () => {
          depth += 1;
        };
        const exit = () => {
          depth -= 1;
        };
        /** @type {(node: AstNode) => void} */
        const onJsxOpeningElement = (node) => {
          if (depth < 2) {
            return;
          }
          const name = jsxName(node.name);
          if (elementAllowKeys(name).some((key) => slotMargins.has(key))) {
            return;
          }
          for (const attr of node.attributes ?? []) {
            const prop = jsxAttrName(attr);
            if (MARGIN_PROP_SET.has(prop) && !isZeroReset(attr.value)) {
              context.report({
                node: attr,
                messageId: 'childMargin',
                data: { prop, name: name || 'element' },
              });
            }
          }
        };
        return {
          JSXElement: enter,
          'JSXElement:exit': exit,
          JSXFragment: enter,
          'JSXFragment:exit': exit,
          JSXOpeningElement: onJsxOpeningElement,
        };
      },
    },
    'no-parameter-properties': {
      meta: {
        type: 'problem',
        docs: {
          description:
            "Ban TypeScript constructor parameter properties, which vxrn's native dev bundle can leave on a lowered function parameter.",
        },
        schema: [],
        messages: {
          parameterProperty:
            "Constructor parameter property {{name}}. vxrn's native bundle can leave its modifier on a function parameter and rolldown then refuses the whole bundle. Declare the field and assign it in the constructor.",
        },
      },
      create(context) {
        /** @type {(node: AstNode) => void} */
        const onParameterProperty = (node) => {
          const name = nameOf(node.parameter) || nameOf(node.parameter?.left) || 'parameter';
          context.report({ node, messageId: 'parameterProperty', data: { name } });
        };
        return { TSParameterProperty: onParameterProperty };
      },
    },
  },
};

export default plugin;
