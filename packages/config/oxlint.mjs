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

import { isDrawingFile, readDrawingRegistry } from './drawingRegistry.mjs';
import { readSlotMarginRegistry } from './specRegistry.mjs';

/** Hex + functional CSS colour literals. AST-visited only (not a text scan). */
export const COLOR_LITERAL = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgba?|hsla?)\([^)]*\)/i;

/** Palette modules where a 12-step ramp in hex/hsl is the deliverable (EN-2). */
export const PALETTE_FILE = /(?:^|\/)themes\/(base|accent)\.(tsx?|jsx?)$|(?:^|\/)[^/]*palette[^/]*\.(tsx?|jsx?)$/i;

/**
 * A `hex-escape: <reason>` line or block comment. A JSDoc `*` line or a
 * backticked mention is prose about the marker, not the marker.
 */
const HEX_ESCAPE_COMMENT = /(?<!`)(?:\/\/|\/\*)\s*hex-escape:\s*(.*?)\s*(?:\*\/.*)?$/;

/**
 * Every `hex-escape:` comment in a source file, with the reason it writes.
 * @param {string} src
 * @returns {{ line: number, reason: string }[]}
 */
export function findHexEscapes(src) {
  if (!src.includes('hex-escape:')) {return [];}
  /** @type {{ line: number, reason: string }[]} */
  const sites = [];
  src.split('\n').forEach((text, index) => {
    if (text.trim().startsWith('*')) {return;}
    const match = text.match(HEX_ESCAPE_COMMENT);
    if (match) {sites.push({ line: index + 1, reason: match[1].trim() });}
  });
  return sites;
}

/**
 * @param {unknown} context
 * @returns {string}
 */
function sourceText(context) {
  const ctx = /** @type {{ sourceCode?: { text?: string }, getSourceCode?: () => { text?: string } }} */ (context);
  return ctx?.sourceCode?.text ?? ctx?.getSourceCode?.()?.text ?? '';
}

const RAW_TYPOGRAPHY_HATCH = /^Tamagui(?:Text|SizableText|Paragraph|Heading|H[1-6]|Anchor)$/;
const HOUSE_PACKAGE = /^@repo\//;

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
const ZERO_VALUE = /^(?:-?0(?:\.0+)?(?:px)?|\$0)$/;
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
 * @param {unknown} context
 * @returns {Set<string>}
 */
function resolveSlotMargins(context) {
  const opt = context?.options?.[0] ?? {};
  if (Array.isArray(opt.slotMargins)) {return new Set(opt.slotMargins);}
  try {
    return new Set(readSlotMarginRegistry().members);
  } catch {
    return new Set();
  }
}

/**
 * `0` is `00` L8 E1, legal anywhere: a zero-reset is the absence of an outer
 * margin or a size, not one (Tamagui's own headings ship `margin: 0`, and
 * `minWidth={0}` is what lets a flex child shrink below its content).
 * @param {unknown} value
 */
function isZeroReset(value) {
  const node = unwrapJsxValue(value);
  if (!node || typeof node !== 'object') {return false;}
  const expr = /** @type {{ type?: string, value?: unknown, operator?: string, argument?: unknown }} */ (node);
  if (expr.type === 'Literal') {
    if (typeof expr.value === 'number') {return expr.value === 0;}
    if (typeof expr.value === 'string') {return ZERO_VALUE.test(expr.value.trim());}
  }
  if (expr.type === 'UnaryExpression' && expr.operator === '-') {return isZeroReset(expr.argument);}
  return false;
}

/**
 * @param {unknown} context
 * @returns {{ drawings: string[], chromeAllow: Set<string> }}
 */
function resolveAllowlists(context) {
  const opt = context?.options?.[0] ?? {};
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
}

/** @param {string | undefined} source */
function isHousePackage(source) {
  return typeof source === 'string' && HOUSE_PACKAGE.test(source);
}

/** @param {{ type?: string, imported?: { name?: string, value?: string }, local?: { name?: string } }} specifier */
function specifierLocalName(specifier) {
  return specifier.local?.name ?? specifier.imported?.name ?? specifier.imported?.value;
}

/**
 * Walk a JSX name node into "Card" or "Menu.Content".
 * @param {unknown} name
 * @returns {string}
 */
function jsxName(name) {
  if (!name || typeof name !== 'object') {return '';}
  const node = /** @type {{ type?: string, name?: string, object?: unknown, property?: { name?: string } }} */ (name);
  if (node.type === 'JSXIdentifier') {return node.name ?? '';}
  if (node.type === 'JSXMemberExpression') {
    const object = jsxName(node.object);
    const property = node.property?.name ?? '';
    return object && property ? `${object}.${property}` : object || property;
  }
  return '';
}

/** @param {unknown} attr */
function jsxAttrName(attr) {
  if (!attr || typeof attr !== 'object') {return '';}
  const node = /** @type {{ type?: string, name?: { type?: string, name?: string } }} */ (attr);
  if (node.type !== 'JSXAttribute') {return '';}
  return node.name?.name ?? '';
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function unwrapJsxValue(value) {
  if (!value || typeof value !== 'object') {return value;}
  const node = /** @type {{ type?: string, expression?: unknown }} */ (value);
  if (node.type === 'JSXExpressionContainer') {return unwrapJsxValue(node.expression);}
  return value;
}

/** @param {unknown} value */
function isNumericLiteral(value) {
  const node = unwrapJsxValue(value);
  if (!node || typeof node !== 'object') {return false;}
  const expr = /** @type {{ type?: string, value?: unknown, operator?: string, argument?: unknown }} */ (node);
  if (expr.type === 'Literal' && typeof expr.value === 'number') {return true;}
  if (expr.type === 'UnaryExpression' && expr.operator === '-' && isNumericLiteral(expr.argument)) {
    return true;
  }
  return false;
}

/** @param {unknown} value */
function isSizeRecipeEscape(value) {
  const node = unwrapJsxValue(value);
  if (!node || typeof node !== 'object') {return false;}
  const expr =
    /** @type {{ type?: string, callee?: { type?: string, name?: string, property?: { name?: string } } }} */ (node);
  if (expr.type !== 'CallExpression') {return false;}
  const callee = expr.callee;
  if (!callee) {return false;}
  if (callee.type === 'Identifier' && callee.name === 'sizeRecipeEscape') {return true;}
  if (callee.type === 'MemberExpression' && callee.property?.name === 'sizeRecipeEscape') {
    return true;
  }
  return false;
}

/**
 * @param {unknown} importNode
 * @param {Set<string>} locals
 * @param {Set<string>} namespaces
 */
function collectHouseLocals(importNode, locals, namespaces) {
  const node = /** @type {{ source?: { value?: string }, specifiers?: unknown[] }} */ (importNode);
  if (!isHousePackage(node.source?.value)) {return;}
  for (const specifier of node.specifiers ?? []) {
    const spec = /** @type {{ type?: string, local?: { name?: string } }} */ (specifier);
    if (spec.type === 'ImportNamespaceSpecifier' && spec.local?.name) {
      namespaces.add(spec.local.name);
      continue;
    }
    const local = specifierLocalName(spec);
    if (typeof local === 'string' && local) {locals.add(local);}
  }
}

/**
 * @param {string} name
 * @param {Set<string>} locals
 * @param {Set<string>} namespaces
 */
function isHouseElement(name, locals, namespaces) {
  if (!name) {return false;}
  if (locals.has(name)) {return true;}
  const dot = name.indexOf('.');
  if (dot === -1) {return false;}
  return namespaces.has(name.slice(0, dot));
}

/**
 * Bare component name for CHROME-ALLOW matching (`Menu.Item` → `Item` and `Menu.Item`).
 * @param {string} name
 */
function elementAllowKeys(name) {
  const keys = [name];
  const dot = name.lastIndexOf('.');
  if (dot !== -1) {keys.push(name.slice(dot + 1));}
  return keys;
}

/**
 * @param {unknown} context
 */
function houseJsxVisitors(context, onHouseElement) {
  const filename = context.filename ?? context.getFilename?.() ?? '';
  const { drawings, chromeAllow } = resolveAllowlists(context);
  const locals = new Set();
  const namespaces = new Set();
  return {
    drawings,
    chromeAllow,
    filename,
    visitors: {
      ImportDeclaration(node) {
        collectHouseLocals(node, locals, namespaces);
      },
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        if (!isHouseElement(name, locals, namespaces)) {return;}
        onHouseElement({ node, name, filename, drawings, chromeAllow });
      },
    },
  };
}

/**
 * @param {string | undefined} filename
 * @returns {boolean}
 */
export function isPaletteModule(filename) {
  if (!filename) {return false;}
  const normalized = filename.replaceAll('\\', '/');
  return PALETTE_FILE.test(normalized);
}

/**
 * @param {unknown} value
 * @returns {string | undefined} the matched literal, if any
 */
export function matchColorLiteral(value) {
  if (typeof value !== 'string') {return undefined;}
  const match = value.match(COLOR_LITERAL);
  return match?.[0];
}

/** @type {import("eslint").ESLint.Plugin} */
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
        const filename = context.filename ?? context.getFilename?.() ?? '';
        if (isPaletteModule(filename)) {
          return {};
        }
        if (findHexEscapes(sourceText(context)).some((site) => site.reason)) {
          return {};
        }

        function reportIfColor(node, value) {
          const matched = matchColorLiteral(value);
          if (!matched) {return;}
          context.report({
            node,
            messageId: 'hex',
            data: { value: matched },
          });
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              reportIfColor(node, node.value);
            }
          },
          TemplateElement(node) {
            reportIfColor(node, node.value?.cooked ?? '');
          },
        };
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
        return {
          ImportDeclaration(node) {
            if (node.source?.value !== '@repo/ui') {return;}
            for (const specifier of node.specifiers ?? []) {
              if (specifier.type !== 'ImportSpecifier') {continue;}
              const imported = specifier.imported?.name ?? specifier.imported?.value;
              if (typeof imported === 'string' && RAW_TYPOGRAPHY_HATCH.test(imported)) {
                context.report({
                  node: specifier,
                  messageId: 'rawTypography',
                  data: { name: imported },
                });
              }
            }
          },
        };
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
          if (elementAllowKeys(name).some((key) => chromeAllow.has(key))) {return;}
          for (const attr of node.attributes ?? []) {
            const prop = jsxAttrName(attr);
            if (!CHROME_PROP_SET.has(prop)) {continue;}
            context.report({
              node: attr,
              messageId: 'chrome',
              data: { prop, name },
            });
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
          if (isDrawingFile(filename, drawings)) {return;}
          for (const attr of node.attributes ?? []) {
            const prop = jsxAttrName(attr);
            if (!GEOMETRY_PROP_SET.has(prop)) {continue;}
            if (isSizeRecipeEscape(attr.value)) {continue;}
            if (!isNumericLiteral(attr.value)) {continue;}
            if (isZeroReset(attr.value)) {continue;}
            context.report({
              node: attr,
              messageId: 'geometry',
              data: { prop, name },
            });
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
        return {
          JSXElement: enter,
          'JSXElement:exit': exit,
          JSXFragment: enter,
          'JSXFragment:exit': exit,
          JSXOpeningElement(node) {
            if (depth < 2) {return;}
            const name = jsxName(node.name);
            if (elementAllowKeys(name).some((key) => slotMargins.has(key))) {return;}
            for (const attr of node.attributes ?? []) {
              const prop = jsxAttrName(attr);
              if (!MARGIN_PROP_SET.has(prop)) {continue;}
              if (isZeroReset(attr.value)) {continue;}
              context.report({
                node: attr,
                messageId: 'childMargin',
                data: { prop, name: name || 'element' },
              });
            }
          },
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
        return {
          TSParameterProperty(node) {
            const parameter = node.parameter ?? {};
            const name = parameter.name ?? parameter.left?.name ?? 'parameter';
            context.report({ node, messageId: 'parameterProperty', data: { name } });
          },
        };
      },
    },
  },
};

export default plugin;
