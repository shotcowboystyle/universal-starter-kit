import { type Platform, getBroadName, getPreciseName, platformBase } from './platformBase';

export const platform: Platform = {
  ...platformBase,
  isExpo: true,
  isIos: true,
  isNative: true,
};
platform.preciseName = getPreciseName(platform);
platform.broadName = getBroadName(platform);
