/**
 * Where an app parks its `'use dom'` entry so the PACKAGE's own stories can
 * reach it (design §9.3).
 *
 * Same move as `registerGraphSchema`, one realm out. A schema registers by id
 * because a `render` is a component and cannot be JSON; a DOM entry registers
 * here because it is a component too — but this side of the bridge, so nothing
 * is serialized and nothing is looked up by string. `NodeGraphNative` takes the
 * entry as a prop first and reads this only when it was given none.
 *
 * It exists for exactly one shape of consumer: a story that lives inside this
 * package and therefore cannot import the app's config. `public/*` may not
 * depend on `@package/themes`, so `NodeGraph/NodeGraph` on device had no way to
 * get a Tamagui config into the WebView at all — which is what it died of.
 * `apps/storybook-expo` calls `setNodeGraphDomEntry` from its Storybook preview,
 * and every story in the gallery then renders against the app's real config.
 *
 * An app with its own screens never needs this: it passes `domEntry` to
 * `<NodeGraph />` and skips the global entirely.
 */

import type { ComponentType } from 'react';

import type { NodeGraphDomProps } from '../dom/NodeGraphDomShell';

/** What a `'use dom'` module's default export looks like from the Hermes side. */
export type NodeGraphDomEntry = ComponentType<NodeGraphDomProps>;

let registered: NodeGraphDomEntry | null = null;

/**
 * Last writer wins, deliberately. An app has one entry; a second call is a hot
 * reload replacing the first, not two apps competing.
 */
export function setNodeGraphDomEntry(entry: NodeGraphDomEntry | null): void {
  registered = entry;
}

export function getNodeGraphDomEntry(): NodeGraphDomEntry | null {
  return registered;
}

/** Test seam, matching `clearGraphSchemas`. */
export function clearNodeGraphDomEntry(): void {
  registered = null;
}
