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
  viteFinal: (viteConfig) => mergeConfig(viteConfig, createStorybookViteConfig()),
};

export default config;
