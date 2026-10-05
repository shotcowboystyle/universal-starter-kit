import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as router from '../router';

import { useSearchParams, useTypedSearchParams, useUrlState } from './useUrlState';

// Mock the router module
vi.mock('../router', () => {
  const mockSetParams = vi.fn();
  return {
    useParams: vi.fn(() => ({})),
    useRouter: vi.fn(() => ({
      setParams: mockSetParams,
    })),
  };
});

// Get the mocked functions
const mockUseParams = router.useParams as ReturnType<typeof vi.fn>;
const mockUseRouter = router.useRouter as ReturnType<typeof vi.fn>;

describe('useUrlState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSearchParams', () => {
    it('should return current search params', () => {
      mockUseParams.mockReturnValue({ foo: 'bar', baz: 'qux' });

      const { result } = renderHook(() => useSearchParams());
      const [params] = result.current;

      expect(params).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should update search params', () => {
      const setParamsMock = vi.fn();
      mockUseRouter.mockReturnValue({ setParams: setParamsMock });

      const { result } = renderHook(() => useSearchParams());
      const [, setParams] = result.current;

      act(() => {
        setParams({ foo: 'bar' });
      });

      expect(setParamsMock).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should support function updates', () => {
      const setParamsMock = vi.fn();
      mockUseParams.mockReturnValue({ existing: 'value' });
      mockUseRouter.mockReturnValue({ setParams: setParamsMock });

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
      const setParamsMock = vi.fn();
      mockUseRouter.mockReturnValue({ setParams: setParamsMock });

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

  describe('useUrlState', () => {
    it('should initialize with default values', () => {
      mockUseParams.mockReturnValue({});

      const defaultValues = { name: '', age: 0, active: false };
      const { result } = renderHook(() => useUrlState(defaultValues));
      const [state] = result.current;

      expect(state).toEqual(defaultValues);
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

      expect(state).toEqual({
        name: 'John',
        age: 25,
        active: true,
      });
    });

    it('should serialize state to URL params', () => {
      const setParamsMock = vi.fn();
      mockUseParams.mockReturnValue({});
      mockUseRouter.mockReturnValue({ setParams: setParamsMock });

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

      expect(state).toEqual({
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

      expect(state).toEqual({
        config: { theme: 'dark', lang: 'en' },
      });
    });
  });

  describe('useTypedSearchParams', () => {
    it('should parse params with schema', () => {
      mockUseParams.mockReturnValue({
        page: '2',
        limit: '50',
        search: 'test',
      });

      const schema = {
        page: {
          default: 1,
          parse: (value: string | string[] | undefined) => (value ? Number.parseInt(String(value), 10) : 1),
        },
        limit: {
          default: 20,
          parse: (value: string | string[] | undefined) => (value ? Number.parseInt(String(value), 10) : 20),
        },
        search: {
          default: '',
        },
      };

      const { result } = renderHook(() => useTypedSearchParams(schema));

      expect(result.current).toEqual({
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

      expect(result.current).toEqual({
        page: 1,
        limit: 20,
        search: '',
      });
    });
  });
});
