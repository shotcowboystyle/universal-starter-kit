import { resolveConfig, type Plugin } from 'vite';
/**
 * phosphorTokenColorPlugin: the one place web phosphor glyphs get a
 * Tamagui token resolved to a paint. The render proof lives in
 * packages/components/src/icons/phosphorTokenColor.test.tsx; these hold the
 * swap to phosphor's own IconBase and to every web config factory.
 */
import { describe, expect, it } from 'vitest';

import { phosphorTokenColorPlugin } from './phosphorTokenColor.js';
import { createStorybookViteConfig } from './storybook.js';
import { createViteConfig } from './vite.js';
import { createVitestConfig } from './vitest.js';

const dist = '/repo/node_modules/@phosphor-icons/react/dist';
const iconBase = `${dist}/lib/IconBase.es.js`;

type Handler = (id: string, importer?: string) => string | null;

function hook(plugin: { resolveId?: unknown; load?: unknown }, name: 'resolveId' | 'load') {
  const value = plugin[name] as { handler: Handler } | Handler;
  return typeof value === 'function' ? value : value.handler;
}

function hasPlugin(plugins: unknown): boolean {
  return (plugins as unknown[])
    .flat(Infinity)
    .some((p) => (p as { name?: string } | null)?.name === 'mpo-phosphor-token-color');
}

describe('phosphorTokenColorPlugin', () => {
  const plugin = phosphorTokenColorPlugin();
  const resolveId = hook(plugin, 'resolveId');
  const load = hook(plugin, 'load') as (id: string) => string | null;

  it('swaps the IconBase every csr glyph and the barrel import', () => {
    const fromIcon = resolveId('../lib/IconBase.es.js', `${dist}/csr/Heart.es.js`);
    const fromBarrel = resolveId('./lib/IconBase.es.js', `${dist}/index.es.js?v=1a2b`);
    expect(fromIcon?.startsWith('\0mpo-phosphor-token-icon-base:')).toBe(true);
    expect(fromIcon?.endsWith(iconBase)).toBe(true);
    expect(fromBarrel).toBe(fromIcon);
  });

  it('leaves other importers, the ssr base and its own wrapper alone', () => {
    expect(resolveId('../lib/IconBase.es.js', '/repo/src/icons/csr/Heart.es.js')).toBeNull();
    expect(resolveId('../lib/SSRBase.es.js', `${dist}/ssr/Heart.es.js`)).toBeNull();
    const wrapper = resolveId('../lib/IconBase.es.js', `${dist}/csr/Heart.es.js`) ?? '';
    expect(resolveId(iconBase, wrapper)).toBeNull();
  });

  it('loads a wrapper that resolves tokens through the theme and renders the original', () => {
    const wrapper = resolveId('../lib/IconBase.es.js', `${dist}/csr/Heart.es.js`) ?? '';
    const code = load(wrapper) ?? '';
    expect(code).toContain(`import IconBase from ${JSON.stringify(iconBase)}`);
    expect(code).toContain('import { useTheme } from "@tamagui/core"');
    expect(load('/repo/src/other.ts')).toBeNull();
  });

  it('reaches the dev dep optimizer, which bundles phosphor without Vite plugins', () => {
    const configEnvironment = plugin.configEnvironment as unknown as () => {
      optimizeDeps: { rolldownOptions: { plugins: Array<Plugin> } };
    };
    const [depPlugin] = configEnvironment().optimizeDeps.rolldownOptions.plugins;
    const depResolve = hook(depPlugin, 'resolveId');
    expect(depResolve('../lib/IconBase.es.js', `${dist}/csr/Heart.es.js`)).toBe(
      resolveId('../lib/IconBase.es.js', `${dist}/csr/Heart.es.js`),
    );
  });

  it('lands in the client and ssr optimizers once Vite resolves the config', async () => {
    const config = await resolveConfig(
      { configFile: false, logLevel: 'silent', plugins: [phosphorTokenColorPlugin()] },
      'serve',
    );
    for (const name of ['client', 'ssr']) {
      const plugins = (config.environments[name]?.optimizeDeps.rolldownOptions?.plugins ?? []) as Array<{
        name?: string;
      }>;
      expect(plugins.map((p) => p?.name)).toContain('mpo-phosphor-token-color:deps');
    }
  });

  it('is carried by every web config factory', () => {
    expect(hasPlugin(createViteConfig({ tamagui: false }).plugins)).toBe(true);
    expect(hasPlugin(createStorybookViteConfig().plugins)).toBe(true);
    const vitest = createVitestConfig({ tamaguiConfig: false, dedupeReact: false });
    expect(hasPlugin(vitest.plugins)).toBe(true);
    const inline = (vitest as { test: { server: { deps: { inline: unknown[] } } } }).test.server.deps.inline;
    expect(inline).toContain('@phosphor-icons/react');
  });
});
