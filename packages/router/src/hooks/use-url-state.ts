import { isWeb } from '@repo/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useParams, useRouter } from '../router';
import type { InputRouteParamsBlank } from '../types';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface SetSearchParamsOptions {
  replace?: boolean;
  debounceMs?: number;
}

// The router is optional. Hosts that have none (storybook-expo, expo go) resolve these
// bindings to undefined, so treat a missing or throwing router as "no url sync" instead
// of crashing at mount. The branch is decided once at module load, so hook order is stable.
const hasRouter = Boolean(useRouter) && Boolean(useParams);

const emptyParams: SearchParams = {};

interface OptionalRouter {
  router?: ReturnType<typeof useRouter>;
  params?: SearchParams;
}

const useOptionalRouter = (): OptionalRouter => {
  if (!hasRouter) {
    return {};
  }
  try {
    // oxlint-disable-next-line react/rule-suppression -- the suppression below is deliberate
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- hasRouter is fixed at module load, so call order is stable; the catch covers a host with no router context
    return { router: useRouter(), params: useParams() };
  } catch {
    return {};
  }
};

// oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- caller-supplied generic values have no schema; their runtime kind drives (de)serialization
const kindOf = (value: unknown) => typeof value;

const isObject = (value: unknown): value is object => kindOf(value) === 'object' && value !== null;

const serializeEntries = (entries: [string, unknown][]): SearchParams => {
  // Default serialization: convert to string
  const params = new Map<string, string | string[]>();
  for (const [key, val] of entries) {
    if (val === undefined || val === null || val === '') {
      continue;
    }
    if (Array.isArray(val)) {
      params.set(key, val.map(String));
    } else if (isObject(val)) {
      params.set(key, JSON.stringify(val));
    } else {
      // oxlint-disable-next-line typescript/no-base-to-string -- objects were handled by the branch above, so val is a primitive here
      params.set(key, String(val));
    }
  }
  return Object.fromEntries(params);
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- the default's type is only known at runtime
const deserializeValue = (defaultValue: unknown, value: string | string[] | undefined): unknown => {
  if (value === undefined) {
    return defaultValue;
  }
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) ? value : [value];
  }
  const kind = kindOf(defaultValue);
  if (kind === 'boolean') {
    return value === 'true';
  }
  if (kind === 'number') {
    return Number(value);
  }
  if (isObject(defaultValue)) {
    try {
      return JSON.parse(Array.isArray(value) ? value.join(',') : value);
    } catch {
      return defaultValue;
    }
  }
  return value;
};

// Default deserialization: parse JSON for objects
const defaultDeserialize = <T extends object>(defaultValues: T, params: SearchParams): T => {
  const defaults = new Map<string, unknown>(Object.entries(defaultValues));
  const result = new Map<string, unknown>();
  for (const [key, value] of Object.entries(params)) {
    if (defaults.has(key)) {
      result.set(key, deserializeValue(defaults.get(key), value));
    }
  }
  // Fill in missing keys with defaults
  for (const [key, value] of defaults) {
    if (!result.has(key)) {
      result.set(key, value);
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: result holds exactly the keys of defaultValues, each parsed against that key's default
  return Object.fromEntries(result) as T;
};

/**
 * Cross-platform hook for managing URL search parameters
 * Works with both React Router (web) and React Navigation (native)
 */
export const useSearchParams = (): [
  SearchParams,
  (params: SearchParams | ((prev: SearchParams) => SearchParams), options?: SetSearchParamsOptions) => void,
] => {
  const [localParams, setLocalParams] = useState<SearchParams>({});
  const { router, params } = useOptionalRouter();
  const currentParams = params ?? localParams;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse current params into a more usable format
  const searchParams = useMemo<SearchParams>(() => {
    const parsed: SearchParams = {};
    for (const [key, value] of Object.entries(currentParams)) {
      if (value !== undefined && value !== null) {
        parsed[key] = value;
      }
    }
    return parsed;
  }, [currentParams]);

  const setSearchParams = useCallback(
    (newParams: SearchParams | ((prev: SearchParams) => SearchParams), options: SetSearchParamsOptions = {}) => {
      const { debounceMs = 0 } = options;

      const updateParams = () => {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates a value from its updater function
        const updatedParams = typeof newParams === 'function' ? newParams(searchParams) : newParams;

        // Filter out undefined values
        const cleanParams: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(updatedParams)) {
          if (value !== undefined && value !== null && value !== '') {
            cleanParams[key] = value;
          }
        }

        // Use router.setParams to update the URL, or keep it local when routerless
        if (router != null && params != null) {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: One's setParams typing omits array values, but repeated query keys are passed as string[] and every router implementation here accepts them
          router.setParams(cleanParams as InputRouteParamsBlank);
        } else {
          setLocalParams(cleanParams);
        }
      };

      if (debounceMs > 0) {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(updateParams, debounceMs);
      } else {
        updateParams();
      }
    },
    [router, params, searchParams],
  );

  // Cleanup debounce timer on unmount
  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  return [searchParams, setSearchParams];
};

/**
 * Hook for syncing form state with URL parameters
 * Provides automatic serialization/deserialization and debouncing
 */
export const useUrlState = <T extends object>(
  defaultValues: T,
  options: {
    debounceMs?: number;
    serialize?: (value: T) => SearchParams;
    deserialize?: (params: SearchParams) => T;
  } = {},
): [T, (newState: Partial<T> | ((prev: T) => Partial<T>)) => void] => {
  const { debounceMs = 500 } = options;
  const { serialize: customSerialize, deserialize: customDeserialize } = options;
  const serialize = useMemo(
    () => customSerialize ?? ((value: T) => serializeEntries(Object.entries(value))),
    [customSerialize],
  );
  const deserialize = useMemo(
    () => customDeserialize ?? ((params: SearchParams) => defaultDeserialize(defaultValues, params)),
    [customDeserialize, defaultValues],
  );

  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL or defaults
  const currentState = useMemo(() => deserialize(searchParams), [searchParams, deserialize]);

  const setState = useCallback(
    (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates a value from its updater function
      const updatedState = typeof newState === 'function' ? newState(currentState) : newState;

      const mergedState = { ...currentState, ...updatedState };
      const serialized = serialize(mergedState);

      setSearchParams(serialized, { debounceMs });
    },
    [currentState, serialize, setSearchParams, debounceMs],
  );

  return [currentState, setState];
};

/**
 * Hook for creating shareable URLs with current state
 */
export const useShareableUrl = (): string => {
  const params = useOptionalRouter().params ?? emptyParams;

  const shareableUrl = useMemo(() => {
    if (!isWeb || typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.search = '';

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        } else {
          url.searchParams.set(key, value);
        }
      }
    }

    return url.toString();
  }, [params]);

  return shareableUrl;
};

/**
 * Hook for parsing URL parameters with type safety
 */
export const useTypedSearchParams = <T extends object>(schema: {
  [K in keyof T]: {
    default: T[K];
    parse?: (value: string | string[] | undefined) => T[K];
  };
}): T => {
  const params = useOptionalRouter().params ?? emptyParams;

  const typedParams = useMemo(() => {
    const result: Partial<T> = {};
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: Object.keys(schema) yields the schema's own string keys, which are keys of T
    const keys = Object.keys(schema) as (keyof T & string)[];

    for (const key of keys) {
      const config = schema[key];
      const rawValue = params[key];

      if (config.parse) {
        result[key] = config.parse(rawValue);
      } else if (rawValue === undefined) {
        result[key] = config.default;
      } else {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: with no parse function the raw URL value is passed through, as the schema contract documents
        result[key] = rawValue as T[typeof key];
      }
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: every key of schema (and so of T) was assigned above
    return result as T;
  }, [params, schema]);

  return typedParams;
};
