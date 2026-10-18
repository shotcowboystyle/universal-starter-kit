import type { SyncOptions } from './sync/types';

type StableScalar = number | string;
type StableEntry = readonly [string, StableValue];
type StableValue = readonly [string, StableScalar | readonly (StableEntry | StableValue)[]];

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
// oxlint-disable-next-line anti-slop/no-object-parameters -- keyed by reference: any object or function gets a stable id
const identity = (value: object): StableValue => {
  let id = identities.get(value);
  if (id === undefined) {
    nextIdentity += 1;
    id = nextIdentity;
    identities.set(value, id);
  }
  return ['reference', id];
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serializes arbitrary option values; branching on representation is the point
const stableValue = (value: unknown, ancestors = new Set<object>()): StableValue => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- functions are keyed by identity, not serialized
  if (typeof value === 'function') {
    return identity(value);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- primitives are tagged with their runtime type
  if (value === null || typeof value !== 'object') {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the runtime type tag keeps 1 and '1' distinct
    return [typeof value, String(value)];
  }
  const prototype: unknown = Object.getPrototypeOf(value);
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
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array; toSorted is not guaranteed on every GJS/Hermes runtime this ships to
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]): StableEntry => [key, stableValue(item, nested)]),
  ];
};

export const syncOptionsKey = (options: SyncOptions = {}): string => {
  const { storage, ...values } = options;
  return JSON.stringify([
    stableValue({
      ...values,
      catchUpStrategy: options.catchUpStrategy ?? 'cdc',
      writeStrategy: options.writeStrategy ?? 'live',
      cdcInterval: options.cdcInterval !== undefined && options.cdcInterval > 0 ? options.cdcInterval : 0,
    }),
    storage ? identity(storage) : null,
  ]);
};
