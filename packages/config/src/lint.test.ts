import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { findSizeRecipeEscapes, resolveRoots, runConventionChecks } from '../lint.mjs';

import type { ExportTarget } from './workspace-public-packages.ts';

const makeTree = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'mpo-lint-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(path.join(root, 'apps', 'demo'), { recursive: true });
  mkdirSync(path.join(root, 'features', 'demo'), { recursive: true });
  writeFileSync(path.join(root, 'apps', 'demo', 'App.tsx'), 'export const App = () => null;\n');
  return root;
};

interface CheckRun {
  code: number;
  /** Each console.error call's first argument. */
  lines: string[];
  /** The console.error lines joined with newlines. */
  messages: string;
  /** The console.warn lines joined with newlines. */
  warnings: string;
}

const runChecks = (root: string): CheckRun => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const code = runConventionChecks({ roots: { root } });
  const lines = error.mock.calls.map((call) => String(call[0]));
  const warnings = warn.mock.calls.map((call) => String(call[0])).join('\n');
  error.mockRestore();
  log.mockRestore();
  warn.mockRestore();
  return { code, lines, messages: lines.join('\n'), warnings };
};

interface PackageOverrides {
  source?: string;
  main?: string;
  exports?: { [subpath: string]: ExportTarget };
}

const storyTree = () => {
  const root = makeTree();
  mkdirSync(path.join(root, 'packages', 'ui', 'src'), { recursive: true });
  return root;
};

const drawingSpec = (root: string, drawingMember: string) => {
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(
    path.join(root, 'docs', 'theme-propagation-spec.md'),
    [
      '# Theme',
      '',
      '## Drawing files',
      '',
      '| Class        | Normative meaning |',
      '| ------------ | ----------------- |',
      `| DRAWING      | Glyphs. Members: ${drawingMember} |`,
      '| CHROME-ALLOW | Exceptions. Members: *(none)* |',
      '',
    ].join('\n'),
  );
};

const pkgTree = (pkg: PackageOverrides) => {
  const root = makeTree();
  mkdirSync(path.join(root, 'public', 'pkg', 'src'), { recursive: true });
  writeFileSync(path.join(root, 'public', 'pkg', 'src', 'thing.ts'), 'export const thing = 1;\n');
  writeFileSync(
    path.join(root, 'public', 'pkg', 'package.json'),
    JSON.stringify({ name: '@repo/pkg', ...pkg }, null, 2),
  );
  return root;
};

const rnwTree = (exportNames: string[] = ['Platform', 'Pressable', 'View']) => {
  const root = makeTree();
  const dist = path.join(root, 'node_modules', 'react-native-web', 'dist');
  const exportLines = exportNames.map((name) => `export { default as ${name} } from './exports/${name}';`).join('\n');
  mkdirSync(dist, { recursive: true });
  writeFileSync(path.join(dist, 'index.js'), `${exportLines}\n`);
  mkdirSync(path.join(root, 'public', 'forms', 'src', 'fields', 'Select'), { recursive: true });
  return root;
};

const publicSrc = (root: string, pkg: string, name: string, body: string) => {
  mkdirSync(path.join(root, 'public', pkg, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'public', pkg, 'src', name), body);
  return path.join('public', pkg, 'src', name);
};

const story = (root: string, rel: string, body: string) => {
  const full = path.join(root, rel);
  mkdirSync(path.join(full, '..'), { recursive: true });
  writeFileSync(full, body);
  return rel;
};

const escapeRegistryTree = (heading: string, extraDir: string[], rows: [string, string][]) => {
  const root = makeTree();
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(
    path.join(root, 'docs', 'theme-propagation-spec.md'),
    [
      '# Theme',
      '',
      heading,
      '',
      '| File | Reason |',
      '| ---- | ------ |',
      ...(rows.length > 0 ? rows : [['_(none)_', ''] as [string, string]]).map(
        ([file, reason]) => `| \`${file}\` | \`${reason}\` |`,
      ),
      '',
    ].join('\n'),
  );
  mkdirSync(path.join(root, ...extraDir), { recursive: true });
  return root;
};

const sizeEscapeTree = (rows: [string, string][]) =>
  escapeRegistryTree('## Size-recipe escapes', ['public', 'forms', 'src', 'Toolbar'], rows);

const colorEscapeTree = (rows: [string, string][]) =>
  escapeRegistryTree('## Colour-literal escapes', ['apps', 'demo', 'canvas'], rows);

describe(resolveRoots, () => {
  it('defaults apps/features/public roots under root', () => {
    const roots = resolveRoots({ root: '/srv/app' });
    expect(roots.apps).toBe(path.join('/srv/app', 'apps'));
    expect(roots.features).toBe(path.join('/srv/app', 'features'));
    expect(roots.public).toBe(path.join('/srv/app', 'packages'));
  });
});

describe(runConventionChecks, () => {
  it('fails on a .css file under apps/', () => {
    const root = makeTree();
    writeFileSync(path.join(root, 'apps', 'demo', 'bad.css'), 'body { color: red; }\n');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    error.mockRestore();
    expect(code).toBe(1);
  });

  it('passes a product app with a features twin and no css', () => {
    const root = makeTree();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    log.mockRestore();
    warn.mockRestore();
    expect(code).toBe(0);
  });
});

describe('workspace paths shadow', () => {
  it('fails an app tsconfig that declares paths while extending tsconfig.base', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'tsconfig.json'),
      `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
`,
    );
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain('WORKSPACE PATHS SHADOW');
    expect(messages).toContain('apps/demo/tsconfig.json');
  });

  it('passes with no paths, with an escape comment, and when the config does not extend the base', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'tsconfig.json'),
      `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true }
}
`,
    );
    mkdirSync(path.join(root, 'features', 'escaped'), { recursive: true });
    mkdirSync(path.join(root, 'public', 'standalone'), { recursive: true });
    writeFileSync(
      path.join(root, 'public', 'standalone', 'tsconfig.json'),
      `{
  "compilerOptions": { "paths": { "@/*": ["./*"] } }
}
`,
    );
    mkdirSync(path.join(root, 'packages', 'escaped'), { recursive: true });
    writeFileSync(
      path.join(root, 'packages', 'escaped', 'tsconfig.json'),
      `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // workspace-paths-escape: this program deliberately owns its own map
    "paths": { "@/*": ["./*"] }
  }
}
`,
    );
    expect(runChecks(root).code).toBe(0);
  });
});

describe('story file shape', () => {
  it('fails a story that exports a named `meta` beside `export default`', () => {
    const root = storyTree();
    writeFileSync(
      path.join(root, 'packages', 'ui', 'src', 'Navbar.stories.tsx'),
      "export const meta = { title: 'Navbar' };\nexport default meta;\nexport const Default = {};\n",
    );
    const { code, lines } = runChecks(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Navbar\.stories\.tsx:1 — exports a named `meta` beside `export default`/u);
  });

  it('fails a story that re-exports `meta` through `export { meta }`', () => {
    const root = storyTree();
    writeFileSync(
      path.join(root, 'packages', 'ui', 'src', 'Carousel.stories.tsx'),
      "const meta = { title: 'Carousel' };\nexport { meta };\nexport default meta;\n",
    );
    const { code, lines } = runChecks(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Carousel\.stories\.tsx:2 — exports a named `meta`/u);
  });

  it('fails a story with no default export', () => {
    const root = storyTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'Orphan.stories.tsx'),
      "const meta = { title: 'Orphan' };\nexport const Default = {};\n",
    );
    const { code, lines } = runChecks(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Orphan\.stories\.tsx — no default export/u);
  });

  it('passes classic CSF and a CSF factory file, and ignores non-story modules', () => {
    const root = storyTree();
    writeFileSync(
      path.join(root, 'packages', 'ui', 'src', 'Button.stories.tsx'),
      "const meta = { title: 'Button' };\nexport default meta;\nexport const Default = {};\n",
    );
    writeFileSync(
      path.join(root, 'packages', 'ui', 'src', 'Factory.stories.tsx'),
      "import preview from '#.storybook/preview';\nexport const meta = preview.meta({ title: 'Factory' });\nexport const Default = meta.story({});\n",
    );
    writeFileSync(path.join(root, 'packages', 'ui', 'src', 'meta.ts'), 'export const meta = 1;\n');
    const { code } = runChecks(root);
    expect(code).toBe(0);
  });
});

describe('undeclared drawing file', () => {
  it('fails a // mpo-drawing file that is not a DRAWING member', () => {
    const root = makeTree();
    drawingSpec(root, '*(none)*');
    writeFileSync(
      path.join(root, 'features', 'demo', 'CanvasGlyph.tsx'),
      '// mpo-drawing\nexport const Glyph = () => null;\n',
    );
    const { code, lines } = runChecks(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/CanvasGlyph\.tsx — \/\/ mpo-drawing without a DRAWING Members row/u);
  });

  it('passes a pragma whose path is listed as a DRAWING member', () => {
    const root = makeTree();
    drawingSpec(root, '**features/demo/CanvasGlyph.tsx**');
    writeFileSync(
      path.join(root, 'features', 'demo', 'CanvasGlyph.tsx'),
      '// mpo-drawing\nexport const Glyph = () => null;\n',
    );
    const { code } = runChecks(root);
    expect(code).toBe(0);
  });
});

describe('metro subpath fallback', () => {
  const sourceConsumed = {
    source: 'src/index.ts',
    main: 'src/index.ts',
    exports: {
      './package.json': './package.json',
      './src/*': './src/*',
      '.': { source: './src/index.ts', import: './dist/esm/index.mjs' },
    },
  };

  it('passes once <pkg>/<subpath>.ts exists on disk', () => {
    const root = pkgTree({
      ...sourceConsumed,
      exports: {
        ...sourceConsumed.exports,
        './thing': { source: './src/thing.ts', import: './dist/esm/thing.mjs' },
      },
    });
    writeFileSync(path.join(root, 'public', 'pkg', 'thing.ts'), 'export * from "./src/thing";\n');
    expect(runChecks(root).code).toBe(0);
  });

  it('passes a subpath whose first Metro condition already lands in src/ on every platform', () => {
    const root = pkgTree({
      ...sourceConsumed,
      exports: {
        ...sourceConsumed.exports,
        './thing': { source: './src/thing.ts', default: './src/thing.ts' },
      },
    });
    expect(runChecks(root).code).toBe(0);
  });

  it('skips a built package with no source condition (keycloak-js shape) and ignores `.` and wildcards', () => {
    const root = pkgTree({
      main: './dist/index.js',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
        './authz': { types: './dist/authz.d.ts', import: './dist/authz.js' },
        './dist/*': './dist/*',
      },
    });
    expect(runChecks(root).code).toBe(0);
  });
});

describe('react-native-web export guard', () => {
  /**
   * The vocabulary comes from the INSTALLED react-native-web, so the fixture
   * ships its own `dist/index.js` — that is also the proof the check reads the
   * list rather than carrying a hardcoded guess.
   */
  const selectFile = path.join('public', 'forms', 'src', 'fields', 'Select', 'index.tsx');

  it('passes the namespace read (8c62c2a6f), a type-only import, aliases and exported names', () => {
    const root = rnwTree();
    writeFileSync(
      path.join(root, selectFile),
      `import * as ReactNative from "react-native";
import { Platform, Pressable as RNPressable } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { View, type LayoutChangeEvent } from "react-native";

export const sheet = (ReactNative as { ActionSheetIOS?: unknown }).ActionSheetIOS;
export const parts = { Platform, RNPressable, View };
export type Events = GestureResponderEvent | LayoutChangeEvent;
`,
    );
    expect(runChecks(root).code).toBe(0);
  });

  it('never flags a platform-suffixed file the web resolver cannot reach', () => {
    const root = rnwTree();
    mkdirSync(path.join(root, 'public', 'rich-text', 'src', 'toolbar'), { recursive: true });
    writeFileSync(
      path.join(root, 'public', 'rich-text', 'src', 'toolbar', 'ColorPicker.native.tsx'),
      'import { ActionSheetIOS, Alert, Platform } from "react-native";\nexport const p = { ActionSheetIOS, Alert, Platform };\n',
    );
    writeFileSync(
      path.join(root, 'public', 'forms', 'src', 'fields', 'Select', 'index.ios.tsx'),
      'import { ActionSheetIOS } from "react-native";\nexport const p = ActionSheetIOS;\n',
    );
    expect(runChecks(root).code).toBe(0);
  });

  it("does not attribute a neighboring import's names to react-native", () => {
    const root = rnwTree();
    writeFileSync(
      path.join(root, selectFile),
      `import { useCallback } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Platform } from "react-native";

export const parts = { useCallback, CaretDownIcon, Platform };
`,
    );
    expect(runChecks(root).code).toBe(0);
  });
});

describe('no import.meta in public/*/src', () => {
  it('ignores the token inside comments and strings, which is how the fix documents itself', () => {
    const root = makeTree();
    publicSrc(
      root,
      'platform',
      'runtimeConfig.ts',
      `/**
 * Build-time config with no import.meta anywhere: in a classic script
 * import.meta is a parse-time SyntaxError.
 */
// a bare \`typeof import.meta\` guard is NOT replaced
export const why = "import.meta is banned here";
export function bakedEnv() {
  try {
    return { VITE_MP_CONFIG: process.env.VITE_MP_CONFIG };
  } catch {
    return {};
  }
}
`,
    );
    expect(runChecks(root).code).toBe(0);
  });

  it('exempts Node-only build tooling by construction: a value import of a node: builtin', () => {
    const root = makeTree();
    publicSrc(
      root,
      'config',
      'vitest.ts',
      `import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
`,
    );
    expect(runChecks(root).code).toBe(0);
  });

  it('exempts specs, which vitest runs in node and hands a real import.meta.env', () => {
    const root = makeTree();
    publicSrc(root, 'markdown', 'nativeGraph.spec.ts', 'export const dir = new URL(".", import.meta.url).pathname;\n');
    expect(runChecks(root).code).toBe(0);
  });
});

describe('a scaffolded project, where the template app is renamed and public/ is pruned', () => {
  it('skips the transition check, and says so, when the animation registry is not in the tree', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'App.tsx'),
      'export const App = () => <View transition="medium" />;\n',
    );
    const { code, warnings } = runChecks(root);
    expect(code).toBe(0);
    expect(warnings).toMatch(/skipped the animation token check/u);
  });
});

describe('size-recipe escape registry', () => {
  const toolbar = 'public/forms/src/Toolbar/index.tsx';

  it('finds every escape form with its written reason, and ignores docs about the marker', () => {
    const sites = findSizeRecipeEscapes(`/**
 * Opt in with \`sizeRecipeEscape="reason"\` or \`// size-recipe-escape:\` above.
 */
export const a = <Button height={40} sizeRecipeEscape="toolbar chrome match" />;
export const b = <Button height={40} sizeRecipeEscape={"toolbar chrome match"} />;
export const c = { paddingHorizontal: 0, sizeRecipeEscape: "LC-81 edges" };
export const d = sizeRecipeEscape(20, "hairline glyph");
export const e = sizeRecipeEscape(20);
export const f = <XStack
  paddingHorizontal={0} // size-recipe-escape: square end-cap
/>;
`);
    expect(sites.map(({ line, form, reason }) => [line, form, reason])).toStrictEqual([
      [4, 'prop', 'toolbar chrome match'],
      [5, 'prop', 'toolbar chrome match'],
      [6, 'prop', 'LC-81 edges'],
      [7, 'call', 'hairline glyph'],
      [8, 'call', undefined],
      [10, 'comment', 'square end-cap'],
    ]);
  });

  it('reads a JSX block-comment reason without its closer, and cannot read a reason held in a variable', () => {
    const sites = findSizeRecipeEscapes(`export const a = (
  <XStack>
    {/* size-recipe-escape: square end-cap */}
    <Button height={40} sizeRecipeEscape={reason} />
    <Button height={40} sizeRecipeEscape={\`chrome \${n}\`} />
  </XStack>
);
`);
    expect(sites.map(({ line, form, reason }) => [line, form, reason])).toStrictEqual([
      [3, 'comment', 'square end-cap'],
      [4, 'prop', undefined],
      [5, 'prop', undefined],
    ]);
  });

  it('fails a declared row whose escape is gone, so the table cannot rot into a blanket pass', () => {
    const root = sizeEscapeTree([[toolbar, 'toolbar chrome match']]);
    writeFileSync(path.join(root, toolbar), 'export const T = () => null;\n');
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${toolbar} — declared escape "toolbar chrome match" has no site`);
  });

  it('does not let a row for one file license the same reason in another', () => {
    const root = sizeEscapeTree([[toolbar, 'toolbar chrome match']]);
    writeFileSync(
      path.join(root, toolbar),
      'export const T = () => <Button height={40} sizeRecipeEscape="toolbar chrome match" />;\n',
    );
    writeFileSync(
      path.join(root, 'features', 'demo', 'Bar.tsx'),
      'export const B = () => <Button height={40} sizeRecipeEscape="toolbar chrome match" />;\n',
    );
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain('features/demo/Bar.tsx:1 — undeclared escape "toolbar chrome match"');
    expect(messages).not.toContain(`${toolbar}:1`);
  });

  it('skips the check when the tree has no escape table, the same as the drawing registry', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'features', 'demo', 'Bar.tsx'),
      'export const B = () => <Button height={40} sizeRecipeEscape="anything" />;\n',
    );
    expect(runChecks(root).code).toBe(0);
  });
});

describe('color-literal escape registry', () => {
  const paint = 'apps/demo/canvas/canvas-paint.ts';
  const reason = 'canvas paint outside TamaguiProvider';

  it('fails a hex-escape whose file and reason are not a row, naming the file, line and reason', () => {
    const root = colorEscapeTree([]);
    writeFileSync(path.join(root, paint), `// hex-escape: ${reason}\nexport const bg = "#ffffff";\n`);
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain('COLOR-LITERAL ESCAPE REGISTRY');
    expect(messages).toContain(`${paint}:1 — undeclared escape "${reason}"`);
  });

  it('fails a hex-escape with no reason', () => {
    const root = colorEscapeTree([]);
    writeFileSync(path.join(root, paint), '// hex-escape:\nexport const bg = "#ffffff";\n');
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${paint}:1 — hex-escape with no written reason`);
  });

  it('fails a declared row whose comment is gone', () => {
    const root = colorEscapeTree([[paint, reason]]);
    writeFileSync(path.join(root, paint), 'export const bg = 1;\n');
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${paint} — declared escape "${reason}" has no comment in the code`);
  });

  it('does not let a row for one file license the same reason in another', () => {
    const root = colorEscapeTree([[paint, reason]]);
    writeFileSync(path.join(root, paint), `// hex-escape: ${reason}\n`);
    writeFileSync(path.join(root, 'apps', 'demo', 'Other.tsx'), `// hex-escape: ${reason}\n`);
    const { code, messages } = runChecks(root);
    expect(code).toBe(1);
    expect(messages).toContain(`apps/demo/Other.tsx:1 — undeclared escape "${reason}"`);
    expect(messages).not.toContain(`${paint}:1`);
  });

  it('passes a declared escape, and skips the check when the tree has no escape table', () => {
    const root = colorEscapeTree([[paint, reason]]);
    writeFileSync(path.join(root, paint), `// hex-escape: ${reason}\nexport const bg = "#ffffff";\n`);
    expect(runChecks(root).code).toBe(0);

    const bare = makeTree();
    writeFileSync(path.join(bare, 'apps', 'demo', 'Any.tsx'), '// hex-escape: anything\n');
    expect(runChecks(bare).code).toBe(0);
  });
});

describe('enter/exit driver', () => {
  it('fails an enterStyle with no transition on the same element', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'App.tsx'),
      'export const App = () => <View enterStyle={{ opacity: 0 }} />;\n',
    );
    const { code, messages: errors } = runChecks(root);
    expect(code).toBe(1);
    expect(errors).toMatch(/apps\/demo\/App\.tsx:1 — enter\/exitStyle with no `transition` driver/u);
  });

  it('accepts the transitionProps spread as the driver', () => {
    const root = makeTree();
    writeFileSync(
      path.join(root, 'apps', 'demo', 'App.tsx'),
      'export const App = () => <View enterStyle={{ opacity: 0 }} {...transitionProps(knobProps.transition)} />;\n',
    );
    const { code, messages: errors } = runChecks(root);
    expect(errors).not.toMatch(/LC-24/u);
    expect(code).toBe(0);
  });
});

describe('foreign control specimen in stories', () => {
  const csfTail = `
const meta = { title: "Forms/Demo" };
export default meta;
export const Basic = { render: () => null };
`;

  it('passes once the story carries parameters.foreignContrastSpecimen: true', () => {
    const root = makeTree();
    story(
      root,
      'public/forms/src/fields/Input/Input.stories.tsx',
      `import { Input as TamaguiInput, XStack } from "tamagui";
const meta = { title: "Forms/Input" };
export default meta;
export const Comparison = {
  parameters: { foreignContrastSpecimen: true },
  render: () => null,
};
`,
    );
    expect(runChecks(root).code).toBe(0);
  });

  it('ignores layout and text primitives, type-only imports and default imports', () => {
    const root = makeTree();
    story(
      root,
      'public/forms/src/FormGrid.stories.tsx',
      `import { Paragraph, XStack, YStack, Text, View, SizableText, Label } from "tamagui";
import type { Input, Button } from "tamagui";
import tamagui from "tamagui";
import { Input } from "./fields/Input";
${csfTail}`,
    );
    expect(runChecks(root).code).toBe(0);
  });

  it("does not let an earlier import's names leak into the tamagui clause", () => {
    const root = makeTree();
    story(
      root,
      'public/forms/src/Leak.stories.tsx',
      `import { Button } from "./Button";
import { YStack } from "tamagui";
${csfTail}`,
    );
    expect(runChecks(root).code).toBe(0);
  });
});
