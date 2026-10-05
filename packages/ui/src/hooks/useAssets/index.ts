import type { ImageURISource } from 'react-native';

export function useAssets(modules: any[]): (ImageURISource | undefined)[] {
  const modulesArr: (ImageURISource | undefined)[] = modules.map((module: any) => {
    if (module && typeof module.default !== 'undefined') {
      return module.default;
    }
    return module;
  });
  if (!modulesArr.length) {
    return [];
  }
  return modulesArr;
}
