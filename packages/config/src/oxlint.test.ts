import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHROME_PROPS,
  GEOMETRY_PROPS,
  LAYOUT_PROPS,
  MARGIN_PROPS,
  findHexEscapes,
  isPaletteModule,
  matchColorLiteral,
  plugin,
} from '../oxlint.mjs';

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')) as {
  exports: Record<string, string | { import?: string; default?: string; types?: string }>;
  files: string[];
};

describe('matchColorLiteral', () => {
  it('matches hex and functional CSS colours, not a Pokedex number in isolation of AST', () => {
    expect(matchColorLiteral('#34c759')).toBe('#34c759');
    expect(matchColorLiteral('#fff')).toBe('#fff');
    expect(matchColorLiteral('rgba(0,0,0,0.35)')).toBe('rgba(0,0,0,0.35)');
    expect(matchColorLiteral('hsl(0, 0%, 50%)')).toBe('hsl(0, 0%, 50%)');
    expect(matchColorLiteral('$color10')).toBeUndefined();
    expect(matchColorLiteral('#025')).toBe('#025');
  });
});

describe('isPaletteModule', () => {
  it('exempts themes/base, themes/accent, and *palette* files', () => {
    expect(isPaletteModule('packages/themes/base.ts')).toBe(true);
    expect(isPaletteModule('packages/themes/accent.ts')).toBe(true);
    expect(isPaletteModule('src/brand-palette.ts')).toBe(true);
    expect(isPaletteModule('features/console/src/conditions/ConditionsIndicator.tsx')).toBe(false);
  });
});

describe('export surface', () => {
  it('exposes chrome vs layout vocabularies and the oxlint plugin', () => {
    expect(CHROME_PROPS).toContain('backgroundColor');
    expect(CHROME_PROPS).toContain('bg');
    expect(LAYOUT_PROPS).toContain('flex');
    expect(plugin.meta?.name).toBe('mpo-conventions');
    expect(plugin.rules?.['no-hex-literals']).toBeDefined();
    expect(plugin.rules?.['no-raw-typography']).toBeDefined();
    expect(plugin.rules?.['no-chrome-props']).toBeDefined();
    expect(plugin.rules?.['no-raw-geometry']).toBeDefined();
    expect(GEOMETRY_PROPS).toContain('height');
  });
});

/**
 * no-raw-typography behavioural teeth. The block above only asserts the rule
 * is DEFINED — a rule that never reports would pass it. These cases drive the
 * rule's own visitor and assert it reports on every raw typography hatch and
 * stays silent on the house names, so "the lint fails on raw typography in app
 * code" is a checked claim rather than a registration.
 */
describe('mpo-conventions/no-raw-typography', () => {
  const rule = plugin.rules?.['no-raw-typography'];

  interface Report {
    data?: { name?: string };
  }
  interface ImportVisitor {
    ImportDeclaration: (node: unknown) => void;
  }
  interface Creatable {
    create: (context: unknown) => ImportVisitor;
  }

  /** Minimal ESTree ImportDeclaration — the only node shape the rule visits. */
  function importDeclaration(source: string, names: string[]) {
    return {
      type: 'ImportDeclaration',
      source: { value: source },
      specifiers: names.map((name) => ({ type: 'ImportSpecifier', imported: { name } })),
    };
  }

  function reportedNames(source: string, names: string[]): string[] {
    const reports: Report[] = [];
    const context = {
      filename: 'apps/one/app/index.tsx',
      report: (report: Report) => reports.push(report),
    };
    const visitors = (rule as unknown as Creatable).create(context);
    visitors.ImportDeclaration(importDeclaration(source, names));
    return reports.map((report) => report.data?.name ?? '');
  }

  const hatches = [
    'TamaguiText',
    'TamaguiSizableText',
    'TamaguiParagraph',
    'TamaguiHeading',
    'TamaguiH1',
    'TamaguiH6',
    'TamaguiAnchor',
  ];

  it.each(hatches)('reports %s imported from the components barrel', (name) => {
    expect(reportedNames('@repo/ui', [name])).toEqual([name]);
  });

  it('stays silent on the house shadows — the bare names ARE the fix', () => {
    expect(reportedNames('@repo/ui', ['Text', 'SizableText', 'Paragraph', 'Heading', 'H1', 'H6', 'Anchor'])).toEqual(
      [],
    );
  });

  it('stays silent on non-typography hatches and on other packages', () => {
    expect(reportedNames('@repo/ui', ['TamaguiButton', 'TamaguiSeparator'])).toEqual([]);
    expect(reportedNames('some-other-package', ['TamaguiText'])).toEqual([]);
  });

  it('reports every offending specifier in one import, not just the first', () => {
    expect(reportedNames('@repo/ui', ['Text', 'TamaguiText', 'TamaguiHeading'])).toEqual([
      'TamaguiText',
      'TamaguiHeading',
    ]);
  });
});

interface Report {
  messageId?: string;
  data?: Record<string, string>;
}
interface HouseVisitors {
  ImportDeclaration: (node: unknown) => void;
  JSXOpeningElement: (node: unknown) => void;
}
interface Creatable {
  create: (context: unknown) => HouseVisitors;
}

function houseImport(source: string, names: string[]) {
  return {
    type: 'ImportDeclaration',
    source: { value: source },
    specifiers: names.map((name) => ({
      type: 'ImportSpecifier',
      imported: { name },
      local: { name },
    })),
  };
}

function jsxOpen(name: string, attrs: { prop: string; value: unknown }[]) {
  return {
    type: 'JSXOpeningElement',
    name: { type: 'JSXIdentifier', name },
    attributes: attrs.map((attr) => ({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: attr.prop },
      value: attr.value,
    })),
  };
}

function token(value: string) {
  return { type: 'Literal', value };
}

function numeric(value: number) {
  return { type: 'JSXExpressionContainer', expression: { type: 'Literal', value } };
}

function escaped(value: number) {
  return {
    type: 'JSXExpressionContainer',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'sizeRecipeEscape' },
      arguments: [{ type: 'Literal', value }],
    },
  };
}

function driveHouseRule(
  ruleName: 'no-chrome-props' | 'no-raw-geometry',
  filename: string,
  nodes: unknown[],
  options?: { drawings?: string[]; chromeAllow?: string[] },
): Report[] {
  const reports: Report[] = [];
  const rule = plugin.rules?.[ruleName] as unknown as Creatable;
  const visitors = rule.create({
    filename,
    options: options ? [options] : [],
    report: (report: Report) => reports.push(report),
  });
  for (const node of nodes) {
    const typed = node as { type?: string };
    if (typed.type === 'ImportDeclaration') {
      visitors.ImportDeclaration(node);
    }
    if (typed.type === 'JSXOpeningElement') {
      visitors.JSXOpeningElement(node);
    }
  }
  return reports;
}

describe('mpo-conventions/no-chrome-props', () => {
  const filename = 'features/lookout/src/WallScreen.tsx';
  const importCard = houseImport('@repo/ui', ['Card']);

  it('errors on Card backgroundColor=$color5 and stays silent on Card flex={1}', () => {
    const chrome = driveHouseRule('no-chrome-props', filename, [
      importCard,
      jsxOpen('Card', [{ prop: 'backgroundColor', value: token('$color5') }]),
    ]);
    expect(chrome.map((r) => r.data?.prop)).toEqual(['backgroundColor']);

    const layout = driveHouseRule('no-chrome-props', filename, [
      importCard,
      jsxOpen('Card', [{ prop: 'flex', value: numeric(1) }]),
    ]);
    expect(layout).toEqual([]);
  });

  it('stays silent on a CHROME-ALLOW member and on a non-house import', () => {
    expect(
      driveHouseRule(
        'no-chrome-props',
        filename,
        [importCard, jsxOpen('Card', [{ prop: 'bg', value: token('$color2') }])],
        { chromeAllow: ['Card'] },
      ),
    ).toEqual([]);
    expect(
      driveHouseRule('no-chrome-props', filename, [
        houseImport('somewhere-else', ['Card']),
        jsxOpen('Card', [{ prop: 'backgroundColor', value: token('$color5') }]),
      ]),
    ).toEqual([]);
  });
});

describe('mpo-conventions/no-raw-geometry', () => {
  const filename = 'features/lookout/src/WallScreen.tsx';
  const importCard = houseImport('@repo/ui', ['Card']);

  it('errors on a numeric height and stays silent behind sizeRecipeEscape()', () => {
    const raw = driveHouseRule('no-raw-geometry', filename, [
      importCard,
      jsxOpen('Card', [{ prop: 'height', value: numeric(20) }]),
    ]);
    expect(raw.map((r) => r.data?.prop)).toEqual(['height']);

    const wrapped = driveHouseRule('no-raw-geometry', filename, [
      importCard,
      jsxOpen('Card', [{ prop: 'height', value: escaped(20) }]),
    ]);
    expect(wrapped).toEqual([]);
  });

  it('never flags a zero-reset but still flags any other number', () => {
    const zero = driveHouseRule('no-raw-geometry', filename, [
      importCard,
      jsxOpen('Card', [
        { prop: 'minWidth', value: numeric(0) },
        { prop: 'padding', value: numeric(0) },
        {
          prop: 'minHeight',
          value: {
            type: 'JSXExpressionContainer',
            expression: {
              type: 'UnaryExpression',
              operator: '-',
              argument: { type: 'Literal', value: 0 },
            },
          },
        },
      ]),
    ]);
    expect(zero).toEqual([]);

    const small = driveHouseRule('no-raw-geometry', filename, [
      importCard,
      jsxOpen('Card', [
        { prop: 'padding', value: numeric(2) },
        { prop: 'minWidth', value: numeric(0.5) },
      ]),
    ]);
    expect(small.map((r) => r.data?.prop)).toEqual(['padding', 'minWidth']);
  });

  it('stays silent inside a registered drawing file', () => {
    expect(
      driveHouseRule(
        'no-raw-geometry',
        'packages/springboard-ui/src/StatusGlyphs.tsx',
        [importCard, jsxOpen('Card', [{ prop: 'height', value: numeric(14) }])],
        { drawings: ['springboard-ui/src/StatusGlyphs.tsx'] },
      ),
    ).toEqual([]);
  });
});

describe('no-hex-literals comments and palette', () => {
  it('does not visit comments, so a JSDoc #025 never reaches the matcher', () => {
    const rule = plugin.rules?.['no-hex-literals'] as { create: (c: unknown) => object };
    const visitors = rule.create({
      filename: 'features/pokemon/logic.ts',
      report() {},
    });
    expect(visitors).not.toHaveProperty('Comment');
    expect(visitors).not.toHaveProperty('Block');
    expect(visitors).toHaveProperty('Literal');
  });

  it('stays silent in packages/themes/base.ts even for rgba', () => {
    const reports: Report[] = [];
    const rule = plugin.rules?.['no-hex-literals'] as {
      create: (c: unknown) => { Literal?: (n: unknown) => void };
    };
    const visitors = rule.create({
      filename: 'packages/themes/base.ts',
      report: (report: Report) => reports.push(report),
    });
    visitors.Literal?.({ type: 'Literal', value: 'rgba(0,0,0,0.35)' });
    expect(reports).toEqual([]);
  });

  it('errors on an rgba() literal in features/**', () => {
    const reports: Report[] = [];
    const rule = plugin.rules?.['no-hex-literals'] as {
      create: (c: unknown) => { Literal: (n: unknown) => void };
    };
    const visitors = rule.create({
      filename: 'features/console/src/DeskShell.tsx',
      report: (report: Report) => reports.push(report),
    });
    visitors.Literal({ type: 'Literal', value: 'rgba(0,0,0,0.35)' });
    expect(reports.map((r) => r.data?.value ?? r.messageId)).toEqual(['rgba(0,0,0,0.35)']);
  });
});

describe('no-hex-literals hex-escape comment', () => {
  function reportsFor(filename: string, text: string) {
    const reports: Report[] = [];
    const rule = plugin.rules?.['no-hex-literals'] as {
      create: (c: unknown) => { Literal?: (n: unknown) => void };
    };
    const visitors = rule.create({
      filename,
      sourceCode: { text },
      report: (report: Report) => reports.push(report),
    });
    visitors.Literal?.({ type: 'Literal', value: '#ffffff' });
    return reports.map((r) => r.data?.value);
  }

  it('errors on a hex in apps/ when the file carries no hex-escape comment', () => {
    expect(reportsFor('apps/one/gnome/main.tsx', 'export const bg = "#ffffff";\n')).toEqual(['#ffffff']);
  });

  it('skips the file whose line comment writes a reason', () => {
    const text = '// hex-escape: GTK widget paint outside TamaguiProvider\nexport const bg = "#ffffff";\n';
    expect(reportsFor('apps/one/gnome/gtk-paint.ts', text)).toEqual([]);
  });

  it('does not take a comment with no reason, a JSDoc line or a backticked mention as the marker', () => {
    for (const text of [
      '// hex-escape:\nexport const bg = "#ffffff";\n',
      '/**\n * hex-escape: in prose\n */\nexport const bg = "#ffffff";\n',
      '// opt out with `// hex-escape: <reason>`\nexport const bg = "#ffffff";\n',
    ]) {
      expect(reportsFor('apps/one/spa/main.tsx', text)).toEqual(['#ffffff']);
    }
  });

  it('finds line and block comment markers with their reasons', () => {
    expect(
      findHexEscapes(
        [
          '// hex-escape: content script on third-party pages',
          'const a = 1;',
          '{/* hex-escape: Storybook manager panel */}',
          ' * hex-escape: JSDoc prose',
          '// hex-escape:',
        ].join('\n'),
      ),
    ).toEqual([
      { line: 1, reason: 'content script on third-party pages' },
      { line: 3, reason: 'Storybook manager panel' },
      { line: 5, reason: '' },
    ]);
  });
});

/**
 * no-child-margin behavioural teeth. The rule counts JSX depth on enter and
 * exit, so the driver walks a small tree the way the linter does: enter a
 * node, visit its children, then fire `<type>:exit`.
 */
describe('mpo-conventions/no-child-margin', () => {
  interface Node {
    type: string;
    [key: string]: unknown;
  }
  type Visitors = Record<string, ((node: Node) => void) | undefined>;

  function element(name: string, attrs: { prop: string; value: unknown }[], children: Node[] = []) {
    return {
      type: 'JSXElement',
      openingElement: jsxOpen(name, attrs),
      children,
    };
  }

  function fragment(children: Node[]) {
    return { type: 'JSXFragment', children };
  }

  function walk(visitors: Visitors, node: Node) {
    visitors[node.type]?.(node);
    if (node.type === 'JSXElement') {
      walk(visitors, node.openingElement as Node);
      for (const child of node.children as Node[]) {
        walk(visitors, child);
      }
    }
    if (node.type === 'JSXFragment') {
      for (const child of node.children as Node[]) {
        walk(visitors, child);
      }
    }
    visitors[`${node.type}:exit`]?.(node);
  }

  function lint(tree: Node, options?: { slotMargins?: string[] }) {
    const reports: Report[] = [];
    const rule = plugin.rules?.['no-child-margin'] as unknown as {
      create: (context: unknown) => Visitors;
    };
    walk(
      rule.create({
        filename: 'features/demo/screen.tsx',
        options: [options ?? { slotMargins: [] }],
        report: (report: Report) => reports.push(report),
      }),
      tree,
    );
    return reports.map((r) => `${r.data?.name}.${r.data?.prop}`);
  }

  it('covers every long margin prop and every Tamagui shorthand for one', () => {
    expect(MARGIN_PROPS).toEqual(
      expect.arrayContaining(['margin', 'marginTop', 'marginHorizontal', 'm', 'mt', 'mx', 'my']),
    );
    expect(plugin.rules?.['no-child-margin']).toBeDefined();
  });

  it('errors on a margin a child sets inside its parent, token or number, long or short', () => {
    const tree = element(
      'YStack',
      [{ prop: 'gap', value: token('$3') }],
      [
        element('Button', [{ prop: 'marginTop', value: token('$2') }]),
        element('Paragraph', [{ prop: 'mb', value: numeric(8) }]),
        element('Separator', [{ prop: 'marginHorizontal', value: token('$-4') }]),
        element('XStack', [{ prop: 'marginLeft', value: token('auto') }]),
      ],
    );
    expect(lint(tree)).toEqual(['Button.marginTop', 'Paragraph.mb', 'Separator.marginHorizontal', 'XStack.marginLeft']);
  });

  it("errors on a margin under a fragment too: a fragment's children are still siblings", () => {
    const tree = fragment([element('Card', [{ prop: 'margin', value: token('$4') }])]);
    expect(lint(tree)).toEqual(['Card.margin']);
  });

  it('leaves the outermost element alone and never flags a zero-reset', () => {
    const tree = element(
      'Screen',
      [{ prop: 'marginTop', value: token('$4') }],
      [
        element('H2', [{ prop: 'margin', value: numeric(0) }]),
        element('Paragraph', [{ prop: 'marginVertical', value: token('$0') }]),
        element('Paragraph', [{ prop: 'marginBottom', value: token('0') }]),
        element('XStack', [
          { prop: 'gap', value: token('$2') },
          { prop: 'flex', value: numeric(1) },
        ]),
      ],
    );
    expect(lint(tree)).toEqual([]);
  });

  it('stays silent on an element the spec declares a slot, by full or bare name', () => {
    const tree = element(
      'Card',
      [],
      [
        element('Card.Footer', [{ prop: 'marginTop', value: token('auto') }]),
        element('Header', [{ prop: 'marginBottom', value: token('auto') }]),
      ],
    );
    expect(lint(tree, { slotMargins: ['Card.Footer', 'Header'] })).toEqual([]);
    expect(lint(tree, { slotMargins: [] })).toEqual(['Card.Footer.marginTop', 'Header.marginBottom']);
  });
});
