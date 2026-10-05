import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { findSizeRecipeEscapes, resolveRoots, runConventionChecks } from '../lint.mjs';

const fixtures: string[] = [];

afterEach(() => {
  for (const dir of fixtures.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'mpo-lint-'));
  fixtures.push(root);
  mkdirSync(join(root, 'apps', 'demo'), { recursive: true });
  mkdirSync(join(root, 'features', 'demo'), { recursive: true });
  writeFileSync(join(root, 'apps', 'demo', 'App.tsx'), 'export const App = () => null;\n');
  return root;
}

describe('resolveRoots', () => {
  it('defaults apps/features/public roots under root', () => {
    const roots = resolveRoots({ root: '/tmp/app' });
    expect(roots.apps).toBe(join('/tmp/app', 'apps'));
    expect(roots.features).toBe(join('/tmp/app', 'features'));
    expect(roots.public).toBe(join('/tmp/app', 'packages'));
  });
});

describe('runConventionChecks', () => {
  it('fails on a .css file under apps/', () => {
    const root = makeTree();
    writeFileSync(join(root, 'apps', 'demo', 'bad.css'), 'body { color: red; }\n');
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
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  it('fails an app tsconfig that declares paths while extending tsconfig.base', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'apps', 'demo', 'tsconfig.json'),
      `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
`,
    );
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain('WORKSPACE PATHS SHADOW');
    expect(messages).toContain('apps/demo/tsconfig.json');
  });

  it('passes with no paths, with an escape comment, and when the config does not extend the base', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'apps', 'demo', 'tsconfig.json'),
      `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true }
}
`,
    );
    mkdirSync(join(root, 'features', 'escaped'), { recursive: true });
    mkdirSync(join(root, 'public', 'standalone'), { recursive: true });
    writeFileSync(
      join(root, 'public', 'standalone', 'tsconfig.json'),
      `{
  "compilerOptions": { "paths": { "@/*": ["./*"] } }
}
`,
    );
    mkdirSync(join(root, 'packages', 'escaped'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'escaped', 'tsconfig.json'),
      `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // workspace-paths-escape: this program deliberately owns its own map
    "paths": { "@/*": ["./*"] }
  }
}
`,
    );
    expect(run(root).code).toBe(0);
  });
});

describe('story file shape', () => {
  function storyTree() {
    const root = makeTree();
    mkdirSync(join(root, 'packages', 'ui', 'src'), { recursive: true });
    return root;
  }
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const lines = error.mock.calls.map((c) => String(c[0]));
    error.mockRestore();
    log.mockRestore();
    return { code, lines };
  }

  it('fails a story that exports a named `meta` beside `export default`', () => {
    const root = storyTree();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'Navbar.stories.tsx'),
      "export const meta = { title: 'Navbar' };\nexport default meta;\nexport const Default = {};\n",
    );
    const { code, lines } = run(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Navbar\.stories\.tsx:1 — exports a named `meta` beside `export default`/);
  });

  it('fails a story that re-exports `meta` through `export { meta }`', () => {
    const root = storyTree();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'Carousel.stories.tsx'),
      "const meta = { title: 'Carousel' };\nexport { meta };\nexport default meta;\n",
    );
    const { code, lines } = run(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Carousel\.stories\.tsx:2 — exports a named `meta`/);
  });

  it('fails a story with no default export', () => {
    const root = storyTree();
    writeFileSync(
      join(root, 'apps', 'demo', 'Orphan.stories.tsx'),
      "const meta = { title: 'Orphan' };\nexport const Default = {};\n",
    );
    const { code, lines } = run(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/Orphan\.stories\.tsx — no default export/);
  });

  it('passes classic CSF and a CSF factory file, and ignores non-story modules', () => {
    const root = storyTree();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'Button.stories.tsx'),
      "const meta = { title: 'Button' };\nexport default meta;\nexport const Default = {};\n",
    );
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'Factory.stories.tsx'),
      "import preview from '#.storybook/preview';\nexport const meta = preview.meta({ title: 'Factory' });\nexport const Default = meta.story({});\n",
    );
    writeFileSync(join(root, 'packages', 'ui', 'src', 'meta.ts'), 'export const meta = 1;\n');
    const { code } = run(root);
    expect(code).toBe(0);
  });
});

describe('undeclared drawing file', () => {
  function drawingSpec(root: string, drawingMember: string) {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'theme-propagation-spec.md'),
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
  }

  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const lines = error.mock.calls.map((c) => String(c[0]));
    error.mockRestore();
    log.mockRestore();
    return { code, lines };
  }

  it('fails a // mpo-drawing file that is not a DRAWING member', () => {
    const root = makeTree();
    drawingSpec(root, '*(none)*');
    writeFileSync(
      join(root, 'features', 'demo', 'CanvasGlyph.tsx'),
      '// mpo-drawing\nexport const Glyph = () => null;\n',
    );
    const { code, lines } = run(root);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/CanvasGlyph\.tsx — \/\/ mpo-drawing without a DRAWING Members row/);
  });

  it('passes a pragma whose path is listed as a DRAWING member', () => {
    const root = makeTree();
    drawingSpec(root, '**features/demo/CanvasGlyph.tsx**');
    writeFileSync(
      join(root, 'features', 'demo', 'CanvasGlyph.tsx'),
      '// mpo-drawing\nexport const Glyph = () => null;\n',
    );
    const { code } = run(root);
    expect(code).toBe(0);
  });
});

describe('metro subpath fallback', () => {
  function pkgTree(pkg: Record<string, unknown>) {
    const root = makeTree();
    mkdirSync(join(root, 'public', 'pkg', 'src'), { recursive: true });
    writeFileSync(join(root, 'public', 'pkg', 'src', 'thing.ts'), 'export const thing = 1;\n');
    writeFileSync(
      join(root, 'public', 'pkg', 'package.json'),
      JSON.stringify({ name: '@multiplatform.one/pkg', ...pkg }, null, 2),
    );
    return root;
  }
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const lines = error.mock.calls.map((c) => String(c[0]));
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, lines };
  }
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
    writeFileSync(join(root, 'public', 'pkg', 'thing.ts'), 'export * from "./src/thing";\n');
    expect(run(root).code).toBe(0);
  });

  it('passes a subpath whose first Metro condition already lands in src/ on every platform', () => {
    const root = pkgTree({
      ...sourceConsumed,
      exports: {
        ...sourceConsumed.exports,
        './thing': { source: './src/thing.ts', default: './src/thing.ts' },
      },
    });
    expect(run(root).code).toBe(0);
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
    expect(run(root).code).toBe(0);
  });
});

describe('react-native-web export guard', () => {
  /**
   * The vocabulary comes from the INSTALLED react-native-web, so the fixture
   * ships its own `dist/index.js` — that is also the proof the check reads the
   * list rather than carrying a hardcoded guess.
   */
  function rnwTree(exportNames: string[] = ['Platform', 'Pressable', 'View']) {
    const root = makeTree();
    const dist = join(root, 'node_modules', 'react-native-web', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(
      join(dist, 'index.js'),
      `${exportNames.map((name) => `export { default as ${name} } from './exports/${name}';`).join('\n')}\n`,
    );
    mkdirSync(join(root, 'public', 'forms', 'src', 'fields', 'Select'), { recursive: true });
    return root;
  }

  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  const selectFile = join('public', 'forms', 'src', 'fields', 'Select', 'index.tsx');

  it('passes the namespace read (8c62c2a6f), a type-only import, aliases and exported names', () => {
    const root = rnwTree();
    writeFileSync(
      join(root, selectFile),
      `import * as ReactNative from "react-native";
import { Platform, Pressable as RNPressable } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { View, type LayoutChangeEvent } from "react-native";

export const sheet = (ReactNative as { ActionSheetIOS?: unknown }).ActionSheetIOS;
export const parts = { Platform, RNPressable, View };
export type Events = GestureResponderEvent | LayoutChangeEvent;
`,
    );
    expect(run(root).code).toBe(0);
  });

  it('never flags a platform-suffixed file the web resolver cannot reach', () => {
    const root = rnwTree();
    mkdirSync(join(root, 'public', 'rich-text', 'src', 'toolbar'), { recursive: true });
    writeFileSync(
      join(root, 'public', 'rich-text', 'src', 'toolbar', 'ColorPicker.native.tsx'),
      'import { ActionSheetIOS, Alert, Platform } from "react-native";\nexport const p = { ActionSheetIOS, Alert, Platform };\n',
    );
    writeFileSync(
      join(root, 'public', 'forms', 'src', 'fields', 'Select', 'index.ios.tsx'),
      'import { ActionSheetIOS } from "react-native";\nexport const p = ActionSheetIOS;\n',
    );
    expect(run(root).code).toBe(0);
  });

  it("does not attribute a neighbouring import's names to react-native", () => {
    const root = rnwTree();
    writeFileSync(
      join(root, selectFile),
      `import { useCallback } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Platform } from "react-native";

export const parts = { useCallback, CaretDownIcon, Platform };
`,
    );
    expect(run(root).code).toBe(0);
  });
});

describe('no import.meta in public/*/src', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  function publicSrc(root: string, pkg: string, name: string, body: string) {
    mkdirSync(join(root, 'public', pkg, 'src'), { recursive: true });
    writeFileSync(join(root, 'public', pkg, 'src', name), body);
    return join('public', pkg, 'src', name);
  }

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
    expect(run(root).code).toBe(0);
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
    expect(run(root).code).toBe(0);
  });

  it('exempts specs, which vitest runs in node and hands a real import.meta.env', () => {
    const root = makeTree();
    publicSrc(root, 'markdown', 'nativeGraph.spec.ts', 'export const dir = new URL(".", import.meta.url).pathname;\n');
    expect(run(root).code).toBe(0);
  });
});

describe('a scaffolded project, where the template app is renamed and public/ is pruned', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const errors = error.mock.calls.map((c) => String(c[0])).join('\n');
    const warnings = warn.mock.calls.map((c) => String(c[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, errors, warnings };
  }

  function animationRegistry(root: string) {
    mkdirSync(join(root, 'public', 'theme', 'src', 'theme', 'animations'), { recursive: true });
    writeFileSync(
      join(root, 'public', 'theme', 'src', 'theme', 'animations', 'css.ts'),
      'export const animationConfig = {\n  medium: "ease-in 300ms",\n} as const;\n',
    );
  }

  it('passes the vscode webview fonts.css in a product app that is not called one', () => {
    const root = makeTree();
    mkdirSync(join(root, 'apps', 'demo', 'vscode', 'webview'), { recursive: true });
    writeFileSync(join(root, 'apps', 'demo', 'vscode', 'webview', 'fonts.css'), '@font-face {}\n');
    expect(run(root).code).toBe(0);
  });

  it('still fails any other .css in that vscode webview', () => {
    const root = makeTree();
    mkdirSync(join(root, 'apps', 'demo', 'vscode', 'webview'), { recursive: true });
    writeFileSync(join(root, 'apps', 'demo', 'vscode', 'webview', 'app.css'), 'body {}\n');
    const { code, errors } = run(root);
    expect(code).toBe(1);
    expect(errors).toMatch(/apps\/demo\/vscode\/webview\/app\.css/);
  });

  it('skips the transition check, and says so, when the animation registry is not in the tree', () => {
    const root = makeTree();
    writeFileSync(join(root, 'apps', 'demo', 'App.tsx'), 'export const App = () => <View transition="medium" />;\n');
    const { code, warnings } = run(root);
    expect(code).toBe(0);
    expect(warnings).toMatch(/skipped the animation token check/);
  });
});

describe('size-recipe escape registry', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  function escapeTree(rows: [string, string][]) {
    const root = makeTree();
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'theme-propagation-spec.md'),
      [
        '# Theme',
        '',
        '## Size-recipe escapes',
        '',
        '| File | Reason |',
        '| ---- | ------ |',
        ...(rows.length ? rows : [['_(none)_', ''] as [string, string]]).map(
          ([file, reason]) => `| \`${file}\` | \`${reason}\` |`,
        ),
        '',
      ].join('\n'),
    );
    mkdirSync(join(root, 'public', 'forms', 'src', 'Toolbar'), { recursive: true });
    return root;
  }

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
    expect(sites.map(({ line, form, reason }) => [line, form, reason])).toEqual([
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
    expect(sites.map(({ line, form, reason }) => [line, form, reason])).toEqual([
      [3, 'comment', 'square end-cap'],
      [4, 'prop', undefined],
      [5, 'prop', undefined],
    ]);
  });

  it('fails a declared row whose escape is gone, so the table cannot rot into a blanket pass', () => {
    const root = escapeTree([[toolbar, 'toolbar chrome match']]);
    writeFileSync(join(root, toolbar), 'export const T = () => null;\n');
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${toolbar} — declared escape "toolbar chrome match" has no site`);
  });

  it('does not let a row for one file license the same reason in another', () => {
    const root = escapeTree([[toolbar, 'toolbar chrome match']]);
    writeFileSync(
      join(root, toolbar),
      'export const T = () => <Button height={40} sizeRecipeEscape="toolbar chrome match" />;\n',
    );
    writeFileSync(
      join(root, 'features', 'demo', 'Bar.tsx'),
      'export const B = () => <Button height={40} sizeRecipeEscape="toolbar chrome match" />;\n',
    );
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain('features/demo/Bar.tsx:1 — undeclared escape "toolbar chrome match"');
    expect(messages).not.toContain(`${toolbar}:1`);
  });

  it('skips the check when the tree has no escape table, the same as the drawing registry', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'features', 'demo', 'Bar.tsx'),
      'export const B = () => <Button height={40} sizeRecipeEscape="anything" />;\n',
    );
    expect(run(root).code).toBe(0);
  });
});

describe('colour-literal escape registry', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  function escapeTree(rows: [string, string][]) {
    const root = makeTree();
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'theme-propagation-spec.md'),
      [
        '# Theme',
        '',
        '## Colour-literal escapes',
        '',
        '| File | Reason |',
        '| ---- | ------ |',
        ...(rows.length ? rows : [['_(none)_', ''] as [string, string]]).map(
          ([file, reason]) => `| \`${file}\` | \`${reason}\` |`,
        ),
        '',
      ].join('\n'),
    );
    mkdirSync(join(root, 'apps', 'demo', 'gnome'), { recursive: true });
    return root;
  }

  const paint = 'apps/demo/gnome/gtk-paint.ts';
  const reason = 'GTK widget paint outside TamaguiProvider';

  it('fails a hex-escape whose file and reason are not a row, naming the file, line and reason', () => {
    const root = escapeTree([]);
    writeFileSync(join(root, paint), `// hex-escape: ${reason}\nexport const bg = "#ffffff";\n`);
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain('COLOUR-LITERAL ESCAPE REGISTRY');
    expect(messages).toContain(`${paint}:1 — undeclared escape "${reason}"`);
  });

  it('fails a hex-escape with no reason', () => {
    const root = escapeTree([]);
    writeFileSync(join(root, paint), '// hex-escape:\nexport const bg = "#ffffff";\n');
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${paint}:1 — hex-escape with no written reason`);
  });

  it('fails a declared row whose comment is gone', () => {
    const root = escapeTree([[paint, reason]]);
    writeFileSync(join(root, paint), 'export const bg = 1;\n');
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain(`${paint} — declared escape "${reason}" has no comment in the code`);
  });

  it('does not let a row for one file license the same reason in another', () => {
    const root = escapeTree([[paint, reason]]);
    writeFileSync(join(root, paint), `// hex-escape: ${reason}\n`);
    writeFileSync(join(root, 'apps', 'demo', 'Other.tsx'), `// hex-escape: ${reason}\n`);
    const { code, messages } = run(root);
    expect(code).toBe(1);
    expect(messages).toContain(`apps/demo/Other.tsx:1 — undeclared escape "${reason}"`);
    expect(messages).not.toContain(`${paint}:1`);
  });

  it('passes a declared escape, and skips the check when the tree has no escape table', () => {
    const root = escapeTree([[paint, reason]]);
    writeFileSync(join(root, paint), `// hex-escape: ${reason}\nexport const bg = "#ffffff";\n`);
    expect(run(root).code).toBe(0);

    const bare = makeTree();
    writeFileSync(join(bare, 'apps', 'demo', 'Any.tsx'), '// hex-escape: anything\n');
    expect(run(bare).code).toBe(0);
  });
});

describe('enter/exit driver', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const errors = error.mock.calls.map((c) => String(c[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, errors };
  }

  it('fails an enterStyle with no transition on the same element', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'apps', 'demo', 'App.tsx'),
      'export const App = () => <View enterStyle={{ opacity: 0 }} />;\n',
    );
    const { code, errors } = run(root);
    expect(code).toBe(1);
    expect(errors).toMatch(/apps\/demo\/App\.tsx:1 — enter\/exitStyle with no `transition` driver/);
  });

  it('accepts the transitionProps spread as the driver', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'apps', 'demo', 'App.tsx'),
      'export const App = () => <View enterStyle={{ opacity: 0 }} {...transitionProps(knobProps.transition)} />;\n',
    );
    const { code, errors } = run(root);
    expect(errors).not.toMatch(/LC-24/);
    expect(code).toBe(0);
  });
});

describe('foreign control specimen in stories', () => {
  function run(root: string) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const code = runConventionChecks({ roots: { root } });
    const messages = error.mock.calls.map((call) => String(call[0])).join('\n');
    error.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    return { code, messages };
  }

  function story(root: string, rel: string, body: string) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
    return rel;
  }

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
    expect(run(root).code).toBe(0);
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
    expect(run(root).code).toBe(0);
  });

  it("leaves the frappe data client's hook demos alone, since it is not a catalog package", () => {
    const root = makeTree();
    story(
      root,
      'public/frappe/src/useFrappeCollection.stories.tsx',
      `import { Button, Text, YStack } from "tamagui";
${csfTail}`,
    );
    expect(run(root).code).toBe(0);
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
    expect(run(root).code).toBe(0);
  });
});
