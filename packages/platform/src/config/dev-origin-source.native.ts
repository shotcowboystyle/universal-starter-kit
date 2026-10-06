import constants from 'expo-constants';

import type { DevOriginSource } from './dev-origin';

export const devOriginSource = (): DevOriginSource => ({
  isWeb: false,
  hostUri: constants.expoConfig?.hostUri ?? constants.manifest2?.extra?.expoGo?.debuggerHost,
});
