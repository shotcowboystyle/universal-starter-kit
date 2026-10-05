import constants from 'expo-constants';

import type { DevOriginSource } from './devOrigin';

export function devOriginSource(): DevOriginSource {
  return {
    isWeb: false,
    hostUri: constants.expoConfig?.hostUri ?? constants.manifest2?.extra?.expoGo?.debuggerHost,
  };
}
