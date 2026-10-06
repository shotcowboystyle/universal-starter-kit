import type { DevOriginSource } from './dev-origin';

export const devOriginSource = (): DevOriginSource => {
  return { isWeb: true };
};
