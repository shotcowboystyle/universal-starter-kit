import constants from 'expo-constants';

import type { DevOriginSource } from './dev-origin';

export const devOriginSource = (): DevOriginSource => ({
  isWeb: false,
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-member-access -- expo-manifests (the source of manifest2's type) is not installed, so oxlint sees an error type; tsc resolves it fine
  hostUri: constants.expoConfig?.hostUri ?? constants.manifest2?.extra?.expoGo?.debuggerHost,
});
