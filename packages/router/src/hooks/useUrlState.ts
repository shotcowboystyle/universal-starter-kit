import { isWeb } from '@repo/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useParams, useRouter } from '../router';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface SetSearchParamsOptions {
  replace?: boolean;
  debounceMs?: number;
}

// The router is optional. Hosts that have none (storybook-expo, expo go) resolve these
// bindings to undefined, so treat a missing or throwing router as "no url sync" instead
// of crashing at mount. The branch is decided once at module load, so hook order is stable.
const hasRouter = typeof useRouter === 'function' && typeof useParams === 'function';

const emptyParams: SearchParams = {};

interface OptionalRouter {
  router?: ReturnType<typeof useRouter>;
  params?: SearchParams;
}

function useOptionalRouter(): OptionalRouter {
  if (!hasRouter) {
    return {};
  }
  try {
    return { router: useRouter(), params: useParams() as SearchParams };
  } catch {
    return {};
  }
}

/**
 * Cross-platform hook for managing URL search parameters
 * Works with both React Router (web) and React Navigation (native)
 */
export function useSearchParams(): [
  SearchParams,
  (params: SearchParams | ((prev: SearchParams) => SearchParams), options?: SetSearchParamsOptions) => void,
] {
  const [localParams, setLocalParams] = useState<SearchParams>({});
  const { router, params } = useOptionalRouter();
  const currentParams = params ?? localParams;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Parse current params into a more usable format
  const searchParams = useMemo<SearchParams>(() => {
    const params: SearchParams = {};
    Object.entries(currentParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params[key] = value;
      }
    });
    return params;
  }, [currentParams]);

  const setSearchParams = useCallback(
    (newParams: SearchParams | ((prev: SearchParams) => SearchParams), options: SetSearchParamsOptions = {}) => {
      const { replace: _replace = true, debounceMs = 0 } = options;

      const updateParams = () => {
        const updatedParams = typeof newParams === 'function' ? newParams(searchParams) : newParams;

        // Filter out undefined values
        const cleanParams: Record<string, string | string[]> = {};
        Object.entries(updatedParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            cleanParams[key] = value;
          }
        });

        // Use router.setParams to update the URL, or keep it local when routerless
        if (router && params) {
          router.setParams(cleanParams as any);
        } else {
          setLocalParams(cleanParams);
        }
      };

      if (debounceMs > 0) {
        if (debounceTimerRef.current) {
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
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return [searchParams, setSearchParams];
}

/**
 * Hook for syncing form state with URL parameters
 * Provides automatic serialization/deserialization and debouncing
 */
export function useUrlState<T extends Record<string, any>>(
  defaultValues: T,
  options: {
    debounceMs?: number;
    serialize?: (value: T) => SearchParams;
    deserialize?: (params: SearchParams) => T;
  } = {},
): [T, (newState: Partial<T> | ((prev: T) => Partial<T>)) => void] {
  const {
    debounceMs = 500,
    serialize = (value) => {
      // Default serialization: convert to string
      const params: SearchParams = {};
      Object.entries(value).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          if (Array.isArray(val)) {
            params[key] = val.map(String);
          } else if (typeof val === 'object') {
            params[key] = JSON.stringify(val);
          } else {
            params[key] = String(val);
          }
        }
      });
      return params;
    },
    deserialize = (params) => {
      // Default deserialization: parse JSON for objects
      const result: any = {};
      Object.entries(params).forEach(([key, value]) => {
        if (key in defaultValues) {
          const defaultValue = defaultValues[key];
          if (value === undefined) {
            result[key] = defaultValue;
          } else if (Array.isArray(defaultValue)) {
            result[key] = Array.isArray(value) ? value : [value];
          } else if (typeof defaultValue === 'boolean') {
            result[key] = value === 'true';
          } else if (typeof defaultValue === 'number') {
            result[key] = Number(value);
          } else if (typeof defaultValue === 'object' && defaultValue !== null) {
            try {
              result[key] = JSON.parse(String(value));
            } catch {
              result[key] = defaultValue;
            }
          } else {
            result[key] = value;
          }
        }
      });
      // Fill in missing keys with defaults
      Object.keys(defaultValues).forEach((key) => {
        if (!(key in result)) {
          result[key] = defaultValues[key];
        }
      });
      return result as T;
    },
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL or defaults
  const currentState = useMemo(() => {
    return deserialize(searchParams);
  }, [searchParams, deserialize]);

  const setState = useCallback(
    (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
      const updatedState = typeof newState === 'function' ? newState(currentState) : newState;

      const mergedState = { ...currentState, ...updatedState };
      const serialized = serialize(mergedState);

      setSearchParams(serialized, { debounceMs });
    },
    [currentState, serialize, setSearchParams, debounceMs],
  );

  return [currentState, setState];
}

/**
 * Hook for creating shareable URLs with current state
 */
export function useShareableUrl(): string {
  const params = useOptionalRouter().params ?? emptyParams;

  const shareableUrl = useMemo(() => {
    if (!isWeb || typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.search = '';

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach((v) => {
            url.searchParams.append(key, String(v));
          });
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    });

    return url.toString();
  }, [params]);

  return shareableUrl;
}

/**
 * Hook for parsing URL parameters with type safety
 */
export function useTypedSearchParams<T extends Record<string, any>>(schema: {
  [K in keyof T]: {
    default: T[K];
    parse?: (value: string | string[] | undefined) => T[K];
  };
}): T {
  const params = useOptionalRouter().params ?? emptyParams;

  const typedParams = useMemo(() => {
    const result: any = {};

    Object.entries(schema).forEach(([key, config]) => {
      const rawValue = params[key];

      if (config.parse) {
        result[key] = config.parse(rawValue);
      } else if (rawValue === undefined) {
        result[key] = config.default;
      } else {
        result[key] = rawValue;
      }
    });

    return result as T;
  }, [params, schema]);

  return typedParams;
}
