/**
 * Style probes for the node-graph tests.
 *
 * Two kinds: DOM probes read what happy-dom computes from the stylesheets
 * Tamagui injects (custom properties are left unresolved, so a token-valued
 * declaration reads back as `var(--…)`), and sheet probes scan a raw CSS
 * string for its top-level rules.
 */

const commentPattern = /\/\*[\s\S]*?\*\//gu;
const hexLiteralPattern = /#[0-9a-f]{3,8}\b/iu;
const paintPropertyPattern = /(?:^|-)(?:color|fill|stroke|shadow)$|^background(?:-image)?$/u;

const styleRulesOf = (el: Element): CSSStyleRule[] =>
  [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && el.matches(rule.selectorText));

const declarationsIn = (style: CSSStyleDeclaration): [property: string, value: string][] =>
  Array.from({ length: style.length }, (_, index) => {
    const property = style.item(index);
    return [property, style.getPropertyValue(property).trim()];
  });

/**
 * Every declaration the stylesheets and the inline style emit for `el`, in
 * cascade order. Read from the rules rather than `getComputedStyle`, which
 * drops any declaration whose value is a `var(--…)` happy-dom cannot resolve.
 */
// ponytail: cascade order is source order, not specificity; Tamagui's atomic
// one-class rules make that the same thing. Rules inside `@media` are skipped.
const declarationsOf = (el: Element): [property: string, value: string][] => [
  ...styleRulesOf(el).flatMap((rule) => declarationsIn(rule.style)),
  ...(el instanceof HTMLElement ? declarationsIn(el.style) : []),
];

/** The declared value of `property` on `el`, or `undefined` when nothing declares it. */
export const declarationFor = (el: Element, property: string): string | undefined => {
  const declared = declarationsOf(el).findLast(([name, value]) => name === property && value !== '');
  if (declared) {
    return declared[1];
  }
  const computed = getComputedStyle(el).getPropertyValue(property).trim();
  return computed === '' ? undefined : computed;
};

const elementsOf = (root: Element): Element[] => [root, ...root.querySelectorAll('*')];

/** How many color-carrying declarations the tree paints — proof a hex sweep has something to sweep. */
export const paintDeclarationCount = (root: Element): number =>
  elementsOf(root)
    .flatMap(declarationsOf)
    .filter(([property]) => paintPropertyPattern.test(property)).length;

/** Every `property: value` in the tree's computed styles that carries a hex color literal. */
export const hexLiteralsIn = (root: Element): string[] =>
  elementsOf(root)
    .flatMap(declarationsOf)
    .filter(([, value]) => hexLiteralPattern.test(value))
    .map(([property, value]) => `${property}: ${value}`);

interface TopLevelBlocks {
  atRules: string[];
  selectors: string[];
}

// ponytail: at-rule bodies are skipped whole, so rules nested in `@media` are not
// listed; recurse into conditional at-rules if graph.css ever grows one.
const topLevelBlocks = (css: string): TopLevelBlocks => {
  const blocks: TopLevelBlocks = { atRules: [], selectors: [] };
  let depth = 0;
  let preamble = '';
  for (const char of css.replaceAll(commentPattern, '')) {
    if (char === '{') {
      if (depth === 0) {
        const head = preamble.replaceAll(/\s+/gu, ' ').trim();
        (head.startsWith('@') ? blocks.atRules : blocks.selectors).push(head);
        preamble = '';
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (depth === 0) {
      preamble = char === ';' ? '' : preamble + char;
    }
  }
  return blocks;
};

/** The selector list of each top-level rule, whitespace collapsed. */
export const topLevelSelectors = (css: string): string[] => topLevelBlocks(css).selectors;

/** The head of each top-level at-rule block, e.g. `@keyframes mp-graph-dash`. */
export const atRulePreambles = (css: string): string[] => topLevelBlocks(css).atRules;
