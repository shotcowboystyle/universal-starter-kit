import { createStorybookViteConfig } from '@repo/config/storybook';
import type { StorybookConfig } from '@storybook/react-native-web-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
  // The framework preset adds vite-tsconfig-paths, which crawls every tsconfig in the
  // workspace and errors on the CLI's placeholder templates (packages/cli/templates).
  // Workspace packages resolve via aliases and none declare tsconfig `paths`, so drop it.
  viteFinal: (viteConfig) =>
    mergeConfig(
      {
        ...viteConfig,
        plugins: viteConfig.plugins?.filter(
          (plugin) =>
            !(
              typeof plugin === 'object' &&
              plugin !== null &&
              'name' in plugin &&
              plugin.name === 'vite-tsconfig-paths'
            ),
        ),
      },
      createStorybookViteConfig(),
    ),
};

export default config;
