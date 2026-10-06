import { Config } from './config';

const config = new Config();

export { config };
export { Config } from './config';
export { devHostFromHostUri, resolveDevOrigin } from './dev-origin';
export type { DevOriginSource } from './dev-origin';
export {
  bakedConfigEnvKey,
  bakedPublicConfig,
  publicConfigKeys,
  publicConfigKeysEnvKey,
  readRuntimePublicConfig,
  resolvePublicConfig,
  runtimePublicConfigKey,
  serializeRuntimePublicConfig,
} from './runtime-config';
