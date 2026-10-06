/**
 * Cycle-safe `action` wrapper.
 *
 * Stories commonly wire handlers straight through (`onPress={action("onPress")}`),
 * which hands the raw press event / live-query docs to the actions channel.
 * Storybook's PostMessageTransport JSON.stringifies the payload, and React
 * synthetic events / elements are cyclic (element → props → children → …
 * fiber → stateNode closes the circle), so the send throws
 * `TypeError: Converting circular structure to JSON` as an uncaught pageerror
 * (seen in the DebugLayout and FrappeListView stories).
 *
 * This wrapper sanitizes args before they reach the channel: cycles become
 * "[Circular]", React elements/fibers/DOM nodes become short summaries, and
 * depth is capped so the Actions panel stays readable.
 */
import { action as addonAction } from 'storybook/actions';

const MAX_DEPTH = 5;

function summarize(value: unknown): string | undefined {
  if (typeof value === 'function') {
    return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // React elements — their props/children graphs reach fibers and cycle.
    if (obj.$$typeof) {
      return '[ReactElement]';
    }
    // React fibers.
    if ('stateNode' in obj && 'pendingProps' in obj) {
      return '[Fiber]';
    }
    // DOM / host nodes.
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return `[<${value.tagName.toLowerCase()}>]`;
    }
  }
  return undefined;
}

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  const summary = summarize(value);
  if (summary !== undefined) {
    return summary;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const obj = value;
  if (seen.has(obj)) {
    return '[Circular]';
  }
  if (depth <= 0) {
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }
  seen.add(obj);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, depth - 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      let item: unknown;
      try {
        item = (obj as Record<string, unknown>)[key];
      } catch {
        // Getters on host/proxy objects may throw when read.
        item = '[Unreadable]';
      }
      out[key] = sanitize(item, depth - 1, seen);
    }
    return out;
  } finally {
    // Only path cycles are circular — the same object may legitimately
    // appear in sibling branches (DAG).
    seen.delete(obj);
  }
}

export function action(name: string, options?: Parameters<typeof addonAction>[1]): ReturnType<typeof addonAction> {
  const fire = addonAction(name, options);
  return (...args: unknown[]) => fire(...args.map((arg) => sanitize(arg, MAX_DEPTH, new WeakSet())));
}
