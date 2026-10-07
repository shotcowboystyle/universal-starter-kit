import type { SyncOptions } from './sync/types';

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identity(value: object) {
  let id = identities.get(value);
  if (id === undefined) {
    id = ++nextIdentity;
    identities.set(value, id);
  }
  return ['reference', id];
}

function stableValue(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === 'function') {
    return identity(value);
  }
  if (value === null || typeof value !== 'object') {
    return [typeof value, String(value)];
  }
  const prototype = Object.getPrototypeOf(value);
  if (ancestors.has(value) || (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)) {
    return identity(value);
  }
  const nested = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return ['array', value.map((item) => stableValue(item, nested))];
  }
  return [
    'record',
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item, nested)]),
  ];
}

export function syncOptionsKey(options: SyncOptions = {}): string {
  const { storage, ...values } = options;
  return JSON.stringify([
    stableValue({
      ...values,
      catchUpStrategy: options.catchUpStrategy ?? 'cdc',
      writeStrategy: options.writeStrategy ?? 'live',
      cdcInterval: options.cdcInterval && options.cdcInterval > 0 ? options.cdcInterval : 0,
    }),
    storage ? identity(storage) : null,
  ]);
}
