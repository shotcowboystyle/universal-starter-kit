import { getBroadName, getPreciseName, platformBase } from './platform-base';
import type { Platform } from './platform-base';

export const platform: Platform = {
  ...platformBase,
  isExpo: true,
  isIos: true,
  isNative: true,
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);
