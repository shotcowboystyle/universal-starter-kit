import type { DevOriginSource } from './dev-origin';

export function devOriginSource(): DevOriginSource {
  return { isWeb: true };
}
