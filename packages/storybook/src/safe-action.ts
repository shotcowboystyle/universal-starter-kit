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

type SanitizedArg = bigint | boolean | number | string | symbol | null | undefined | SanitizedArg[] | SanitizedRecord;
interface SanitizedRecord {
  [key: string]: SanitizedArg;
}

/** Own properties of a host object, read by key (reads may throw). */
interface PropertyBag {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- values of arbitrary host objects are unknowable; sanitize() parses each one
  [key: string]: unknown;
}

// The guards and sanitizers below are the boundary parse for arbitrary action payloads, so their inputs are
// deliberately untyped; everything they return is a SanitizedArg.
const isFunction = (value: unknown): value is { readonly name: string } => typeof value === 'function';
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- sanitizer boundary
const summarize = (value: unknown): string | undefined => {
  if (isFunction(value)) {
    return `[Function ${value.name === '' ? 'anonymous' : value.name}]`;
  }
  if (isObject(value)) {
    // React elements — their props/children graphs reach fibers and cycle.
    if ('$$typeof' in value && Boolean(value.$$typeof)) {
      return '[ReactElement]';
    }
    // React fibers.
    if ('stateNode' in value && 'pendingProps' in value) {
      return '[Fiber]';
    }
    // DOM / host nodes.
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return `[<${value.tagName.toLowerCase()}>]`;
    }
  }
  return undefined;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- sanitizer boundary
const sanitize = (value: unknown, depth: number, seen: WeakSet<object>): SanitizedArg => {
  const summary = summarize(value);
  if (summary !== undefined) {
    return summary;
  }
  if (!isObject(value)) {
    // SAFETY: summarize() consumed functions and isObject() rejected objects, so only primitives and null remain.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unknown narrowed by the guards above
    return value as SanitizedArg;
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
    const out: SanitizedRecord = {};
    // SAFETY: obj is a non-null object and every key comes from Object.keys(obj), so each read targets an own property.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- object -> index-signature view for keyed reads
    const bag = obj as PropertyBag;
    for (const key of Object.keys(obj)) {
      let item: PropertyBag[string];
      try {
        item = bag[key];
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
};

export const action = (name: string, options?: Parameters<typeof addonAction>[1]): ReturnType<typeof addonAction> => {
  const fire = addonAction(name, options);
  return (...args: unknown[]) => {
    fire(...args.map((arg) => sanitize(arg, MAX_DEPTH, new WeakSet())));
  };
};
