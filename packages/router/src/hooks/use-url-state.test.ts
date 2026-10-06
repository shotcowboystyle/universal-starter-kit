import { act, renderHook, waitFor } from '@testing-library/react';
import type { OneRouter } from 'one';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useParams, useRouter } from '../router';

import { useSearchParams, useTypedSearchParams, useUrlState } from './use-url-state';

// Mock the router module
vi.mock(import('../router'), () => ({
  useParams: vi.fn<typeof useParams>(),
  useRouter: vi.fn<typeof useRouter>(),
}));

const noop = (): void => {
  // intentionally empty
};

const createRouter = (
  setParams: OneRouter.Router['setParams'] = vi.fn<OneRouter.Router['setParams']>(),
): OneRouter.Router => ({
  back: vi.fn<OneRouter.Router['back']>(),
  canGoBack: vi.fn<OneRouter.Router['canGoBack']>(() => false),
  push: vi.fn<OneRouter.Router['push']>(),
  navigate: vi.fn<OneRouter.Router['navigate']>(),
  replace: vi.fn<OneRouter.Router['replace']>(),
  dismiss: vi.fn<OneRouter.Router['dismiss']>(),
  dismissAll: vi.fn<OneRouter.Router['dismissAll']>(),
  canDismiss: vi.fn<OneRouter.Router['canDismiss']>(() => false),
  setParams,
  subscribe: vi.fn<OneRouter.Router['subscribe']>(() => noop),
  onLoadState: vi.fn<OneRouter.Router['onLoadState']>(() => noop),
});

// Get the mocked functions
const mockUseParams = vi.mocked(useParams);
const mockUseRouter = vi.mocked(useRouter);

describe(useUrlState, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({});
    mockUseRouter.mockReturnValue(createRouter());
  });

  describe(useSearchParams, () => {
    it('should return current search params', () => {
      mockUseParams.mockReturnValue({ foo: 'bar', baz: 'qux' });

      const { result } = renderHook(() => useSearchParams());
      const [params] = result.current;

      expect(params).toStrictEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should update search params', () => {
      const setParamsMock = vi.fn<OneRouter.Router['setParams']>();
      mockUseRouter.mockReturnValue(createRouter(setParamsMock));

      const { result } = renderHook(() => useSearchParams());
      const [, setParams] = result.current;

      act(() => {
        setParams({ foo: 'bar' });
      });

      expect(setParamsMock).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should support function updates', () => {
      const setParamsMock = vi.fn<OneRouter.Router['setParams']>();
      mockUseParams.mockReturnValue({ existing: 'value' });
      mockUseRouter.mockReturnValue(createRouter(setParamsMock));

      const { result } = renderHook(() => useSearchParams());
      const [, setParams] = result.current;

      act(() => {
        setParams((prev) => ({ ...prev, new: 'param' }));
      });

      expect(setParamsMock).toHaveBeenCalledWith({
        existing: 'value',
        new: 'param',
      });
    });

    it('should debounce updates when specified', async () => {
      const setParamsMock = vi.fn<OneRouter.Router['setParams']>();
      mockUseRouter.mockReturnValue(createRouter(setParamsMock));

      const { result } = renderHook(() => useSearchParams());
      const [, setParams] = result.current;

      act(() => {
        setParams({ foo: 'bar' }, { debounceMs: 100 });
      });

      expect(setParamsMock).not.toHaveBeenCalled();

      await waitFor(
        () => {
          expect(setParamsMock).toHaveBeenCalledWith({ foo: 'bar' });
        },
        { timeout: 200 },
      );
    });
  });

  describe(useUrlState, () => {
    it('should initialize with default values', () => {
      mockUseParams.mockReturnValue({});

      const defaultValues = { name: '', age: 0, active: false };
      const { result } = renderHook(() => useUrlState(defaultValues));
      const [state] = result.current;

      expect(state).toStrictEqual(defaultValues);
    });

    it('should deserialize URL params', () => {
      mockUseParams.mockReturnValue({
        name: 'John',
        age: '25',
        active: 'true',
      });

      const defaultValues = { name: '', age: 0, active: false };
      const { result } = renderHook(() => useUrlState(defaultValues));
      const [state] = result.current;

      expect(state).toStrictEqual({
        name: 'John',
        age: 25,
        active: true,
      });
    });

    it('should serialize state to URL params', () => {
      const setParamsMock = vi.fn<OneRouter.Router['setParams']>();
      mockUseParams.mockReturnValue({});
      mockUseRouter.mockReturnValue(createRouter(setParamsMock));

      const defaultValues = { name: '', age: 0, active: false };
      const { result } = renderHook(() => useUrlState(defaultValues, { debounceMs: 0 }));
      const [, setState] = result.current;

      act(() => {
        setState({ name: 'John', age: 25, active: true });
      });

      expect(setParamsMock).toHaveBeenCalledWith({
        name: 'John',
        age: '25',
        active: 'true',
      });
    });

    it('should handle arrays', () => {
      mockUseParams.mockReturnValue({
        tags: ['react', 'typescript'],
      });

      const defaultValues = { tags: [] as string[] };
      const { result } = renderHook(() => useUrlState(defaultValues));
      const [state] = result.current;

      expect(state).toStrictEqual({
        tags: ['react', 'typescript'],
      });
    });

    it('should handle objects with JSON serialization', () => {
      mockUseParams.mockReturnValue({
        config: '{"theme":"dark","lang":"en"}',
      });

      const defaultValues = { config: { theme: 'light', lang: 'en' } };
      const { result } = renderHook(() => useUrlState(defaultValues));
      const [state] = result.current;

      expect(state).toStrictEqual({
        config: { theme: 'dark', lang: 'en' },
      });
    });
  });

  describe(useTypedSearchParams, () => {
    it('should parse params with schema', () => {
      mockUseParams.mockReturnValue({
        page: '2',
        limit: '50',
        search: 'test',
      });

      const schema = {
        page: {
          default: 1,
          parse: (value: string | string[] | undefined) =>
            value === undefined || value === '' ? 1 : Math.trunc(Number(String(value))),
        },
        limit: {
          default: 20,
          parse: (value: string | string[] | undefined) =>
            value === undefined || value === '' ? 20 : Math.trunc(Number(String(value))),
        },
        search: {
          default: '',
        },
      };

      const { result } = renderHook(() => useTypedSearchParams(schema));

      expect(result.current).toStrictEqual({
        page: 2,
        limit: 50,
        search: 'test',
      });
    });

    it('should use defaults for missing params', () => {
      mockUseParams.mockReturnValue({});

      const schema = {
        page: { default: 1 },
        limit: { default: 20 },
        search: { default: '' },
      };

      const { result } = renderHook(() => useTypedSearchParams(schema));

      expect(result.current).toStrictEqual({
        page: 1,
        limit: 20,
        search: '',
      });
    });
  });
});
