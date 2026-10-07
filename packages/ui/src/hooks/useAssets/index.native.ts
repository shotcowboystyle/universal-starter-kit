import type { Asset } from 'expo-asset';
import { useAssets as expoUseAssets } from 'expo-asset';

const logger = console;

export type AssetModule = number | { default: number };

interface StaticImageData {
  height: number | null;
  src: string;
  width: number | null;
}

const isEsmWrapper = (module: AssetModule): module is { default: number } => typeof module === 'object';

const unwrapModule = (module: AssetModule): number => (isEsmWrapper(module) ? module.default : module);

export const useAssets = (modules: AssetModule | AssetModule[]): (StaticImageData | undefined)[] => {
  const modulesArr = (Array.isArray(modules) ? modules : [modules]).map(unwrapModule);
  const [assets, err] = expoUseAssets(modulesArr);
  if (err) {
    logger.error(err);
  }
  if (!assets) {
    return Array.from<undefined>({ length: modulesArr.length });
  }
  return assets.map((asset: Asset) => ({
    height: asset.height,
    src: asset.uri,
    width: asset.width,
  }));
};
