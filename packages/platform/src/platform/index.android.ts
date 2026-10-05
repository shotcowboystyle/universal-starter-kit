import { type Platform, getBroadName, getPreciseName, platformBase } from './platformBase';

export const platform: Platform = {
  ...platformBase,
  isAndroid: true,
  isExpo: true,
  isNative: true,
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);
