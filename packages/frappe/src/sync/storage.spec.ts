import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformStorageKV, IndexedDBKV } from './storage';

vi.mock(import('@repo/store'), () => {
  const mockStorage = new Map<string, string>();
  return {
    storage: {
      getItem: vi.fn((key: string) => mockStorage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => mockStorage.set(key, value)),
      removeItem: vi.fn((key: string) => mockStorage.delete(key)),
    },
    __mockStorage: mockStorage,
  };
});

describe(PlatformStorageKV, () => {
  let kv: PlatformStorageKV;
  let mockStorageMap: Map<string, string>;

  beforeEach(async () => {
    const mod = await import('@repo/store');
    mockStorageMap = (mod as any).__mockStorage;
    mockStorageMap.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    kv = new PlatformStorageKV();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should get items from platform storage', async () => {
    mockStorageMap.set('test-key', 'test-value');
    const result = await kv.getItem('test-key');
    expect(result).toBe('test-value');
  });

  it('should return null for missing keys', async () => {
    const result = await kv.getItem('non-existent');
    expect(result).toBeNull();
  });

  it('should set items in platform storage', async () => {
    await kv.setItem('test-key', 'test-value');
    expect(mockStorageMap.get('test-key')).toBe('test-value');
  });

  it('should remove items from platform storage', async () => {
    mockStorageMap.set('test-key', 'test-value');
    await kv.removeItem('test-key');
    expect(mockStorageMap.has('test-key')).toBe(false);
  });

  it('should handle getItem errors gracefully', async () => {
    const { storage } = await import('@repo/store');
    vi.mocked(storage.getItem).mockImplementation(() => {
      throw new Error('Storage error');
    });
    const result = await kv.getItem('test-key');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith();
  });

  it('should handle setItem errors gracefully', async () => {
    const { storage } = await import('@repo/store');
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('Storage error');
    });
    await kv.setItem('test-key', 'test-value');
    expect(console.warn).toHaveBeenCalledWith();
  });

  it('should handle removeItem errors gracefully', async () => {
    const { storage } = await import('@repo/store');
    vi.mocked(storage.removeItem).mockImplementation(() => {
      throw new Error('Storage error');
    });
    await kv.removeItem('test-key');
    expect(console.warn).toHaveBeenCalledWith();
  });
});

describe(IndexedDBKV, () => {
  let storage: IndexedDBKV;
  let mockDatabase: {
    transaction: ReturnType<typeof vi.fn>;
    objectStoreNames: {
      contains: ReturnType<typeof vi.fn>;
    };
    createObjectStore: ReturnType<typeof vi.fn>;
  };
  let mockTransaction: IDBTransaction;
  let mockObjectStore: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockRequest: IDBRequest;

  beforeEach(() => {
    mockRequest = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
    } as unknown as IDBRequest;
    mockObjectStore = {
      get: vi.fn().mockReturnValue(mockRequest),
      put: vi.fn().mockReturnValue(mockRequest),
      delete: vi.fn().mockReturnValue(mockRequest),
    };
    mockTransaction = {
      objectStore: vi.fn().mockReturnValue(mockObjectStore),
      error: null,
      onerror: null,
    } as unknown as IDBTransaction;
    mockDatabase = {
      transaction: vi.fn().mockReturnValue(mockTransaction),
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
      createObjectStore: vi.fn(),
    };
    const mockOpenRequest = {
      result: mockDatabase,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    } as unknown as IDBOpenDBRequest;
    const mockIndexedDB = {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockOpenRequest.onsuccess) {
            mockOpenRequest.onsuccess(new Event('success'));
          }
        }, 0);
        return mockOpenRequest;
      }),
    } as unknown as IDBFactory;
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = mockIndexedDB;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = undefined;
  });

  describe('initialization', () => {
    it('should initialize with default database name', async () => {
      storage = new IndexedDBKV();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(vi.mocked(globalThis.indexedDB.open)).toHaveBeenCalledWith('frappe-sync', 1);
    });

    it('should initialize with custom database name', async () => {
      storage = new IndexedDBKV('custom-db', 'custom-store');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(vi.mocked(globalThis.indexedDB.open)).toHaveBeenCalledWith('custom-db', 1);
    });

    it('should create object store on upgrade', async () => {
      const mockOpenRequest = {
        result: mockDatabase,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      vi.mocked(globalThis.indexedDB.open).mockReturnValue(mockOpenRequest);
      mockDatabase.objectStoreNames.contains.mockReturnValue(false);
      storage = new IndexedDBKV();
      if (mockOpenRequest.onupgradeneeded) {
        mockOpenRequest.onupgradeneeded({
          type: 'upgradeneeded',
          newVersion: 1,
          oldVersion: 0,
        } as IDBVersionChangeEvent);
      }
      expect(mockDatabase.createObjectStore).toHaveBeenCalledWith('kv');
    });

    it('should handle IndexedDB not available', async () => {
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = undefined;
      storage = new IndexedDBKV();
      await expect(storage.getItem('test')).rejects.toThrow('IndexedDB not available in this environment');
    });

    it('should handle database open errors', async () => {
      const mockOpenRequest = {
        result: null,
        error: new Error('Failed to open'),
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      } as unknown as IDBOpenDBRequest;
      vi.mocked(globalThis.indexedDB.open).mockReturnValue(mockOpenRequest);
      storage = new IndexedDBKV();
      setTimeout(() => {
        if (mockOpenRequest.onerror) {
          mockOpenRequest.onerror(new Event('error'));
        }
      }, 0);
      await expect(storage.getItem('test')).rejects.toThrow('Failed to open');
    });
  });

  describe('getItem', () => {
    beforeEach(async () => {
      storage = new IndexedDBKV();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should retrieve existing value', async () => {
      const testValue = 'test-value';
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          result: testValue,
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, 0);
        return request;
      });
      const result = await storage.getItem('test-key');
      expect(result).toBe(testValue);
      expect(mockDatabase.transaction).toHaveBeenCalledWith('kv', 'readonly');
      expect(mockObjectStore.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existent key', async () => {
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, 0);
        return request;
      });
      const result = await storage.getItem('non-existent');
      expect(result).toBeNull();
    });

    it('should handle request errors', async () => {
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          result: null,
          error: new Error('Get failed'),
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onerror) {
            request.onerror(new Event('error'));
          }
        }, 0);
        return request;
      });
      await expect(storage.getItem('test-key')).rejects.toThrow('Get failed');
    });

    it('should handle transaction errors', async () => {
      mockDatabase.transaction.mockImplementation(() => {
        const transaction = {
          objectStore: vi.fn().mockReturnValue(mockObjectStore),
          error: new Error('Transaction failed'),
          onerror: null,
        } as unknown as IDBTransaction;
        setTimeout(() => {
          if (transaction.onerror) {
            transaction.onerror(new Event('error'));
          }
        }, 0);
        return transaction;
      });
      await expect(storage.getItem('test-key')).rejects.toThrow('Transaction failed');
    });
  });

  describe('setItem', () => {
    beforeEach(async () => {
      storage = new IndexedDBKV();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should store value successfully', async () => {
      mockObjectStore.put.mockImplementation(() => {
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, 0);
        return request;
      });
      await storage.setItem('test-key', 'test-value');
      expect(mockDatabase.transaction).toHaveBeenCalledWith('kv', 'readwrite');
      expect(mockObjectStore.put).toHaveBeenCalledWith('test-value', 'test-key');
    });

    it('should handle put errors', async () => {
      mockObjectStore.put.mockImplementation(() => {
        const request = {
          result: null,
          error: new Error('Put failed'),
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onerror) {
            request.onerror(new Event('error'));
          }
        }, 0);
        return request;
      });
      await expect(storage.setItem('test-key', 'test-value')).rejects.toThrow('Put failed');
    });

    it('should handle large values', async () => {
      const largeValue = 'x'.repeat(1024 * 1024);
      mockObjectStore.put.mockImplementation(() => {
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, 0);
        return request;
      });
      await storage.setItem('large-key', largeValue);
      expect(mockObjectStore.put).toHaveBeenCalledWith(largeValue, 'large-key');
    });
  });

  describe('removeItem', () => {
    beforeEach(async () => {
      storage = new IndexedDBKV();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('should delete value successfully', async () => {
      mockObjectStore.delete.mockImplementation(() => {
        const request = {
          result: undefined,
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, 0);
        return request;
      });
      await storage.removeItem('test-key');
      expect(mockDatabase.transaction).toHaveBeenCalledWith('kv', 'readwrite');
      expect(mockObjectStore.delete).toHaveBeenCalledWith('test-key');
    });

    it('should handle delete errors gracefully', async () => {
      mockObjectStore.delete.mockImplementation(() => {
        const request = {
          result: null,
          error: new Error('Delete failed'),
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onerror) {
            request.onerror(new Event('error'));
          }
        }, 0);
        return request;
      });
      await storage.removeItem('test-key');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('IndexedDB removeItem failed'),
        expect.any(Error),
      );
    });

    it('should handle transaction errors gracefully', async () => {
      mockDatabase.transaction.mockImplementation(() => {
        const transaction = {
          objectStore: vi.fn().mockReturnValue(mockObjectStore),
          error: new Error('Transaction failed'),
          onerror: null,
        } as unknown as IDBTransaction;
        setTimeout(() => {
          if (transaction.onerror) {
            transaction.onerror(new Event('error'));
          }
        }, 0);
        return transaction;
      });
      await storage.removeItem('test-key');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('IndexedDB removeItem failed'),
        expect.any(Error),
      );
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      storage = new IndexedDBKV();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const createSuccessRequest = () => {
        const request = {
          result: 'value',
          error: null,
          onsuccess: null,
          onerror: null,
        } as unknown as IDBRequest;
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess(new Event('success'));
          }
        }, Math.random() * 10);
        return request;
      };
      mockObjectStore.get.mockImplementation(createSuccessRequest);
      mockObjectStore.put.mockImplementation(createSuccessRequest);
      mockObjectStore.delete.mockImplementation(createSuccessRequest);
    });

    it('should handle concurrent reads', async () => {
      const promises = Array.from({ length: 10 }, async (_, i) => await storage.getItem(`key-${i}`));
      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(mockObjectStore.get).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed concurrent operations', async () => {
      const promises = [
        storage.getItem('key1'),
        storage.setItem('key2', 'value2'),
        storage.removeItem('key3'),
        storage.getItem('key4'),
        storage.setItem('key5', 'value5'),
      ];
      await Promise.all(promises);
      expect(mockObjectStore.get).toHaveBeenCalledTimes(2);
      expect(mockObjectStore.put).toHaveBeenCalledTimes(2);
      expect(mockObjectStore.delete).toHaveBeenCalledOnce();
    });
  });
});
