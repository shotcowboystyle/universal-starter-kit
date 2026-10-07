import type { ImageURISource } from 'react-native';

type AssetSource = ImageURISource | number | string;

/** An asset module as bundlers emit it: the source itself, or an ESM wrapper exposing it as `default`. */
export type AssetModule = AssetSource | { default?: AssetSource } | undefined;

const isEsmWrapper = (module: AssetModule): module is { default: AssetSource } =>
  typeof module === 'object' && 'default' in module && module.default !== undefined;

export const useAssets = (modules: AssetModule[]): (ImageURISource | undefined)[] =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: bundler asset sources are passed through as-is; callers treat them as ImageURISource
  modules.map((module) => (isEsmWrapper(module) ? module.default : module) as ImageURISource | undefined);
