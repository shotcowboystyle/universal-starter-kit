import { devOriginSource } from './devOriginSource';

/**
 * Where the running app learns the dev machine's address from.
 *
 * On native, `hostUri` is Expo's `Constants.expoConfig.hostUri`: the
 * `host:port` the device fetched its manifest from, which @expo/cli fills in
 * from the request's Host header. It is therefore the one address the device
 * is already proven to reach, whatever the machine's LAN IP happens to be,
 * and it is absent in a release build, where nothing points at localhost.
 */
export interface DevOriginSource {
  isWeb: boolean;
  hostUri?: string;
}

const loopbackOrigin = /^([a-z][a-z0-9+.-]*:\/\/)(localhost|127\.0\.0\.1)(?=[:/?#]|$)/i;

/** The host part of a `host:port`, `scheme://host:port/path` or `[v6]:port` value. */
export function devHostFromHostUri(hostUri: string | undefined): string | undefined {
  if (!hostUri) {
    return undefined;
  }
  const authority = hostUri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/, 1)[0];
  const host = authority.startsWith('[') ? authority.slice(0, authority.indexOf(']') + 1) : authority.split(':', 1)[0];
  return host || undefined;
}

/**
 * Point a loopback-configured origin at the dev machine on native.
 *
 * `http://localhost:8000` in .env means "the machine running the dev server"
 * on every platform. In a browser that is the page host; on a simulator, an
 * emulator or a phone it is the host the bundle came from, so the same .env
 * serves all of them. Web, and anything without a hostUri, is returned as is.
 *
 * String-based on purpose: React Native's URL polyfill has no `hostname`
 * setter, so a new-URL-and-assign rewrite silently no-ops on device.
 */
export function resolveDevOrigin(url: string, source: DevOriginSource = devOriginSource()): string {
  if (source.isWeb) {
    return url;
  }
  const host = devHostFromHostUri(source.hostUri);
  if (!host) {
    return url;
  }
  return url.replace(loopbackOrigin, `$1${host}`);
}
