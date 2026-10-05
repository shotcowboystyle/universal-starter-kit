import { describe, expect, it } from 'vitest';

import { createStorybookViteConfig } from './storybook';

describe('createStorybookViteConfig', () => {
  const config = createStorybookViteConfig();
  const include = config.optimizeDeps?.include ?? [];

  it('pre-includes the chart d3 deps so mid-session discovery cannot re-optimize', () => {
    // Regression: d3-shape/d3-scale sit behind dynamically imported story
    // modules (components/src/charts), so vite's initial crawl missed them.
    // Mid-session discovery triggered a re-optimization that bumped every
    // optimized-dep ?v= hash and 504ed ("Outdated Optimize Dep") module
    // graphs loaded before it — FrappeUI stories rendered blank.
    expect(include).toContain('d3-shape');
    expect(include).toContain('d3-scale');
  });

  it('pre-includes i18next so its late discovery cannot re-optimize', () => {
    expect(include).toContain('i18next');
    expect(include).toContain('react-i18next');
  });

  it('pre-includes every reachable @tamagui/* package so none lands in its own optimizer generation', () => {
    // A @tamagui/* package discovered after the boot crawl is pre-bundled in a
    // later generation carrying its own copy of the tamagui config registry.
    // Mounting a component from it then throws "Can't find Tamagui
    // configuration" and the story renders an empty #storybook-root —
    // measured against ColorPicker, Checkboxes and Calendar, where
    // @tamagui/lucide-icons-2 was served at a different ?v= hash from the
    // shared tamagui chunk.
    for (const dep of [
      '@tamagui/animations-css',
      '@tamagui/react-native-svg',
      '@tamagui/colors',
      '@tamagui/config',
      '@tamagui/config/v5',
      '@tamagui/constants',
      '@tamagui/font-inter',
      '@tamagui/get-font-sized',
      '@tamagui/get-token',
      '@tamagui/linear-gradient',
      '@tamagui/lucide-icons-2',
      '@tamagui/roving-focus',
      '@tamagui/shorthands',
      '@tamagui/theme-builder',
      '@tamagui/themes',
      '@tamagui/toast',
    ]) {
      expect(include, `optimizeDeps.include must pre-bundle ${dep}`).toContain(dep);
    }
  });
});
