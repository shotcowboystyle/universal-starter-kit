'use dom';

/**
 * The package's OWN `'use dom'` entry — the reference a consumer copies, and
 * the shape `domEntry.spec.ts` guards.
 *
 * It is deliberately three lines of substance, because that is the whole point
 * of design §9.3's amendment: the entry is APP-OWNED. Everything that makes a
 * canvas work lives in `NodeGraphDomShell`, which this file renders; what an
 * app adds is the two things that cannot cross the bridge — its Tamagui config
 * and its schema registration — and this file, being inside the package, has
 * neither. Mounted on its own it can therefore only report that the config is
 * missing, which is why the native host draws `GraphFallback` naming that
 * instead of mounting it (see `native/NodeGraph.native.tsx`).
 *
 * `'use dom'` is the FIRST statement and Metro reads the directive
 * positionally, so a comment-first file still works while an import-first one
 * silently becomes an ordinary module.
 *
 * The top-level imports are `react` and the shell, and nothing else. The shell
 * itself imports only `react` and `expo/dom` at the top, so design §9.4 layer
 * 3's real invariant — no top-level import of anything that can THROW — still
 * holds through both files.
 */

import { createElement } from 'react';

import { NodeGraphDomShell } from './NodeGraphDomShell';
import type { NodeGraphDomProps } from './NodeGraphDomShell';

export type {
  GraphDomCommandSlot,
  GraphDomCommands,
  NodeGraphDomHandle,
  NodeGraphDomInnerProps,
  NodeGraphDomOptions,
  NodeGraphDomProps,
  NodeGraphDomRealmProps,
  NodeGraphDomShellProps,
} from './NodeGraphDomShell';

export default function NodeGraphDom(props: NodeGraphDomProps) {
  return createElement(NodeGraphDomShell, props);
}
