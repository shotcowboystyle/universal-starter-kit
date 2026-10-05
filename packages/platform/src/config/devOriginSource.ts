import type { DevOriginSource } from './devOrigin';

export function devOriginSource(): DevOriginSource {
  return { isWeb: true };
}
