import path from 'node:path';

import type { Plugin } from 'vite';

const virtualPrefix = '\0mpo-phosphor-token-icon-base:';
const iconBaseFilter = /IconBase\.es\.js$/;
const phosphorLibFile = /\/@phosphor-icons\/react\/dist\/lib\/IconBase\.es\.js$/;
const virtualIdFilter = new RegExp(`^${virtualPrefix}`);

/**
 * Where a caller's `color` becomes a paint. Tamagui tokens ("$color9",
 * "$red11") resolve through the theme in scope, as the native IconBase shim
 * does; anything else passes through untouched. A token the theme
 * does not carry takes the theme's ink, the fallback resolveGlyphPaint
 * uses, instead of reaching `fill` as an invalid paint that draws black. The
 * rule is inlined, not imported from @repo/theme: this module is
 * bundled into the optimized phosphor chunk, where a workspace import would
 * freeze a stale second copy of the theme package.
 */
function tokenColorIconBaseSource(originalIconBase: string): string {
  return `import { createElement, forwardRef } from "react";
import { useTheme } from "@tamagui/core";
import IconBase from ${JSON.stringify(originalIconBase)};

const isToken = (color) => typeof color === "string" && color.charAt(0) === "$";

const paintOf = (entry) => {
  const value = entry != null && typeof entry === "object" ? entry.val : entry;
  return typeof value === "string" && value.length > 0 && !isToken(value) ? value : undefined;
};

const ThemeColorIconBase = forwardRef(function ThemeColorIconBase(props, ref) {
  const theme = useTheme() || {};
  const color =
    paintOf(theme[props.color.slice(1)]) ??
    paintOf(theme.color) ??
    paintOf(theme.color12) ??
    paintOf(theme.color11);
  return createElement(IconBase, { ...props, ref, color });
});

const TokenColorIconBase = forwardRef(function TokenColorIconBase(props, ref) {
  return createElement(isToken(props.color) ? ThemeColorIconBase : IconBase, { ...props, ref });
});
TokenColorIconBase.displayName = "IconBase";

export default TokenColorIconBase;
`;
}

function toPosix(file: string): string {
  return file.replace(/\\/g, '/');
}

function resolvePhosphorIconBase(id: string, importer: string | undefined): string | null {
  if (!importer || importer.startsWith('\0')) {
    return null;
  }
  const importerPath = toPosix(importer);
  if (!importerPath.includes('/@phosphor-icons/react/dist/')) {
    return null;
  }
  const target = toPosix(id.startsWith('.') ? path.resolve(path.dirname(importer), id) : id);
  // The virtual id drops the `.js` so extension-filtered loaders that run
  // first in the dep optimizer (vite-plugin-rnw's flow stripper,
  // /\.(flow|jsx?)$/) don't claim it and readFile a `\0` path.
  return phosphorLibFile.test(target) ? virtualPrefix + target.replace(/\.js$/, '') : null;
}

function loadTokenColorIconBase(id: string): string | null {
  return id.startsWith(virtualPrefix) ? tokenColorIconBaseSource(`${id.slice(virtualPrefix.length)}.js`) : null;
}

function rolldownTokenColorPlugin() {
  return {
    name: 'mpo-phosphor-token-color:deps',
    resolveId: {
      filter: { id: iconBaseFilter },
      handler: resolvePhosphorIconBase,
    },
    load: {
      filter: { id: virtualIdFilter },
      handler: loadTokenColorIconBase,
    },
  };
}

/**
 * Resolves Tamagui tokens handed to `@phosphor-icons/react` glyphs on web,
 * the web twin of apps/storybook-expo's native IconBase shim.
 *
 * Every phosphor icon renders through `dist/lib/IconBase.es.js`, which writes
 * its `color` prop straight into `<svg fill>`. Callers across the catalog pass
 * Tamagui tokens there, and a browser drops "$color9" as a paint, so the glyph
 * fell back to black and vanished on the dark scheme. This swaps that one
 * module for a wrapper that resolves the token first, so no call site has to.
 *
 * The swap runs in the plugin pipeline (build, vitest with phosphor inlined)
 * and inside the dev dep optimizer, which bundles phosphor with rolldown and
 * never consults Vite plugins for a dependency's relative imports.
 */
export function phosphorTokenColorPlugin(): Plugin {
  return {
    name: 'mpo-phosphor-token-color',
    enforce: 'pre',
    configEnvironment() {
      return { optimizeDeps: { rolldownOptions: { plugins: [rolldownTokenColorPlugin()] } } };
    },
    resolveId: {
      filter: { id: iconBaseFilter },
      handler: resolvePhosphorIconBase,
    },
    load: {
      filter: { id: virtualIdFilter },
      handler: loadTokenColorIconBase,
    },
  };
}
