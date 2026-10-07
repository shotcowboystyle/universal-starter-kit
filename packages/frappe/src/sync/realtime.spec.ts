import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';

import type { DbModule } from '../db';
import type { RealtimeModule } from '../realtime';

import type { NormalizedCache } from './normalizedCache';
import { RealtimeHandler } from './realtime';
import type { RehydrationManager } from './rehydration';
import type { SubscriptionManager } from './subscriptionManager';
import { RealtimeEventType, RehydrationReason } from './types';
import type { SyncOptions } from './types';

describe(RealtimeHandler, () => {
  let realtimeHandler: RealtimeHandler;
  let mockDb: Mocked<DbModule>;
  let mockRealtime: Mocked<RealtimeModule>;
  let mockNormalizedCache: Mocked<NormalizedCache>;
  let mockSubscriptionManager: Mocked<SubscriptionManager>;
  let mockRehydrationManager: Mocked<RehydrationManager>;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset event handlers for each test
    eventHandlers = {};

    // Mock dependencies
    mockDb = {
      getDoc: vi.fn().mockResolvedValue({ name: 'test-doc', doctype: 'TestDoc' }),
    } as any;

    mockRealtime = {
      on: vi.fn().mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
      }),
      isHealthy: vi.fn().mockReturnValue(true),
      disconnect: vi.fn(),
      subscribeList: vi.fn().mockResolvedValue(),
      unsubscribeList: vi.fn(),
    } as any;

    mockNormalizedCache = {
      upsert: vi.fn(),
      remove: vi.fn(),
    } as any;

    mockSubscriptionManager = {
      updateSubscriptionMembership: vi.fn().mockReturnValue([]),
      removeFromAllSubscriptions: vi.fn().mockReturnValue([]),
    } as any;

    mockRehydrationManager = {
      scheduleRehydration: vi.fn(),
    } as any;

    // Mock console methods
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor and initialization', () => {
    it('should initialize with default connection config', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      // Real Frappe v15 emits doc_update/list_update; designed names kept as forward-compat.
      expect(mockRealtime.on).toHaveBeenCalledWith('doc_update', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('list_update', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('doc_changed', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('doc_deleted', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('perm_epoch_bump', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(mockRealtime.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should initialize with custom connection config', () => {
      const options: SyncOptions = {
        connectionConfig: {
          reconnectBaseDelay: 2000,
          reconnectMaxDelay: 60_000,
          reconnectJitter: 0.5,
          exponentialBackoff: false,
        },
      };

      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        options,
      );

      expect(realtimeHandler).toBeDefined();
    });

    it('should handle no realtime module gracefully', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        undefined,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      expect(realtimeHandler).toBeDefined();
      expect(mockRealtime.on).not.toHaveBeenCalled();
    });

    it('should handle no rehydration manager gracefully', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        undefined,
        {},
      );

      expect(realtimeHandler).toBeDefined();
    });
  });

  describe('realtime event handlers', () => {
    beforeEach(() => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    describe('doc_changed event', () => {
      it('should handle doc_changed event successfully', async () => {
        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        const mockDoc = {
          name: 'test-doc',
          doctype: 'TestDoc',
          title: 'Test Document',
        };

        mockDb.getDoc.mockResolvedValue(mockDoc);

        await eventHandlers.doc_changed(payload);

        expect(mockDb.getDoc).toHaveBeenCalledWith('TestDoc', 'test-doc');
        expect(mockNormalizedCache.upsert).toHaveBeenCalledWith(mockDoc);
        expect(mockSubscriptionManager.updateSubscriptionMembership).toHaveBeenCalledWith(mockDoc);
      });

      it('should schedule rehydration for subscriptions needing it', async () => {
        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        const mockDoc = { name: 'test-doc', doctype: 'TestDoc' };
        const mockSubscriptions: any[] = [
          { id: 'sub1', query: { doctype: 'TestDoc' }, docIds: [] },
          { id: 'sub2', query: { doctype: 'TestDoc' }, docIds: [] },
        ];

        mockDb.getDoc.mockResolvedValue(mockDoc);
        mockSubscriptionManager.updateSubscriptionMembership.mockReturnValue(mockSubscriptions);

        await eventHandlers.doc_changed(payload);

        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledTimes(2);
        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          mockSubscriptions[0],
          RehydrationReason.RemoteCreate,
        );
        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          mockSubscriptions[1],
          RehydrationReason.RemoteCreate,
        );
      });

      it('should handle fetch errors gracefully', async () => {
        const payload = { doctype: 'TestDoc', name: 'test-doc' };

        mockDb.getDoc.mockRejectedValue(new Error('Permission denied'));

        await eventHandlers.doc_changed(payload);

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to fetch document TestDoc/test-doc'),
          expect.any(Error),
        );
        expect(mockNormalizedCache.upsert).not.toHaveBeenCalled();
      });

      it('should call onRealtimeEvent callback if provided', async () => {
        const onRealtimeEvent = vi.fn();
        realtimeHandler = new RealtimeHandler(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockSubscriptionManager,
          mockRehydrationManager,
          { onRealtimeEvent },
        );

        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        await eventHandlers.doc_changed(payload);

        expect(onRealtimeEvent).toHaveBeenCalledWith({
          type: RealtimeEventType.DocChanged,
          payload,
        });
      });
    });

    describe('doc_deleted event', () => {
      it('should handle doc_deleted event successfully', async () => {
        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        const affectedSubscriptions: any[] = [
          { id: 'sub1', docIds: [] },
          { id: 'sub2', docIds: [] },
        ];

        mockSubscriptionManager.removeFromAllSubscriptions.mockReturnValue(affectedSubscriptions);

        await eventHandlers.doc_deleted(payload);

        expect(mockNormalizedCache.remove).toHaveBeenCalledWith({
          doctype: 'TestDoc',
          name: 'test-doc',
        });
        expect(mockSubscriptionManager.removeFromAllSubscriptions).toHaveBeenCalledWith('TestDoc', 'test-doc');
      });

      it('should schedule rehydration for affected subscriptions', async () => {
        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        const affectedSubscriptions: any[] = [
          { id: 'sub1', docIds: [] },
          { id: 'sub2', docIds: [] },
        ];

        mockSubscriptionManager.removeFromAllSubscriptions.mockReturnValue(affectedSubscriptions);

        await eventHandlers.doc_deleted(payload);

        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledTimes(2);
        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          affectedSubscriptions[0],
          RehydrationReason.Delete,
        );
        expect(mockRehydrationManager.scheduleRehydration).toHaveBeenCalledWith(
          affectedSubscriptions[1],
          RehydrationReason.Delete,
        );
      });

      it('should call onRealtimeEvent callback if provided', async () => {
        const onRealtimeEvent = vi.fn();
        realtimeHandler = new RealtimeHandler(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockSubscriptionManager,
          mockRehydrationManager,
          { onRealtimeEvent },
        );

        const payload = { doctype: 'TestDoc', name: 'test-doc' };
        await eventHandlers.doc_deleted(payload);

        expect(onRealtimeEvent).toHaveBeenCalledWith({
          type: RealtimeEventType.DocDeleted,
          payload,
        });
      });
    });

    describe('perm_epoch_bump event', () => {
      it('should handle perm_epoch_bump event', () => {
        const onResetCache = vi.fn();
        realtimeHandler = new RealtimeHandler(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockSubscriptionManager,
          mockRehydrationManager,
          { onResetCache },
        );

        eventHandlers.perm_epoch_bump();

        expect(onResetCache).toHaveBeenCalledWith();
      });

      it('should call onRealtimeEvent callback if provided', () => {
        const onRealtimeEvent = vi.fn();
        realtimeHandler = new RealtimeHandler(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockSubscriptionManager,
          mockRehydrationManager,
          { onRealtimeEvent },
        );

        eventHandlers.perm_epoch_bump();

        expect(onRealtimeEvent).toHaveBeenCalledWith({
          type: RealtimeEventType.PermEpochBump,
        });
      });
    });
  });

  describe('connection management', () => {
    beforeEach(() => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    describe('connected event', () => {
      it('should handle successful connection', () => {
        const onRealtimeEvent = vi.fn();
        const onBackfillAll = vi.fn();

        realtimeHandler = new RealtimeHandler(
          mockDb,
          mockRealtime,
          mockNormalizedCache,
          mockSubscriptionManager,
          mockRehydrationManager,
          { onRealtimeEvent, onBackfillAll },
        );

        eventHandlers.connected();

        expect(onRealtimeEvent).toHaveBeenCalledWith({
          type: RealtimeEventType.Connected,
        });
        expect(onBackfillAll).toHaveBeenCalledWith();
        expect(console.debug).toHaveBeenCalledWith('[RealtimeHandler] Connected to realtime server');
      });

      it('should reset reconnection attempts on successful connection', () => {
        // Simulate previous failed connections
        eventHandlers.disconnect();
        vi.advanceTimersByTime(1000);

        // Now connect successfully
        eventHandlers.connected();

        // Verify reconnection was cancelled
        vi.advanceTimersByTime(5000);
        // Initial setup: doc_update, list_update, doc_changed, doc_deleted,
        // perm_epoch_bump, connected, disconnect (real Frappe protocol + lifecycle).
        expect(mockRealtime.on).toHaveBeenCalledTimes(7);
      });
    });

    describe('disconnect event', () => {
      it('should handle disconnection', () => {
        eventHandlers.disconnect();

        expect(console.debug).toHaveBeenCalledWith('[RealtimeHandler] Disconnected from realtime server');
      });

      it('should schedule reconnection if previously connected', () => {
        // First establish connection
        eventHandlers.connected();

        // Then disconnect
        eventHandlers.disconnect();

        expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('Scheduling reconnection attempt'));
      });

      it('should not schedule reconnection if never connected', () => {
        eventHandlers.disconnect();

        vi.advanceTimersByTime(5000);
        // Should not try to reconnect
        expect(console.debug).not.toHaveBeenCalledWith(expect.stringContaining('Scheduling reconnection'));
      });
    });
  });

  describe('reconnection logic', () => {
    beforeEach(() => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          connectionConfig: {
            reconnectBaseDelay: 1000,
            reconnectMaxDelay: 8000,
            reconnectJitter: 0.1,
            exponentialBackoff: true,
          },
        },
      );
    });

    it('should use exponential backoff for reconnection', () => {
      // First establish connection
      eventHandlers.connected();

      // Then disconnect to trigger reconnection
      eventHandlers.disconnect();

      // First attempt should be around base delay (1000ms ± jitter)
      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('Scheduling reconnection attempt 1 in'));

      vi.advanceTimersByTime(1200);

      // Second attempt should be around 2x base delay
      eventHandlers.disconnect();
      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('Scheduling reconnection attempt 2 in'));
    });

    it('should cap reconnection delay at max delay', () => {
      // Setup with small max delay to test capping
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          connectionConfig: {
            reconnectBaseDelay: 1000,
            reconnectMaxDelay: 2000,
            reconnectJitter: 0,
            exponentialBackoff: true,
          },
        },
      );

      // First establish connection
      eventHandlers.connected();

      // Multiple failed reconnection attempts
      for (let i = 0; i < 5; i++) {
        eventHandlers.disconnect();
        vi.advanceTimersByTime(3000);
      }

      // Final attempt should not exceed max delay
      eventHandlers.disconnect();
      const lastCall = (console.debug as any).mock.calls
        .filter((call) => call[0].includes('Scheduling reconnection'))
        .pop();

      if (lastCall) {
        const delayMatch = lastCall[0].match(/in (\d+)ms/);
        if (delayMatch) {
          const delay = Number.parseInt(delayMatch[1]);
          expect(delay).toBeLessThanOrEqual(2000);
        }
      }
    });

    it('should apply jitter to reconnection delays', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          connectionConfig: {
            reconnectBaseDelay: 1000,
            reconnectMaxDelay: 8000,
            reconnectJitter: 0.5, // High jitter for testing
            exponentialBackoff: false,
          },
        },
      );

      // First establish connection
      eventHandlers.connected();

      // calculateReconnectDelay clamps to reconnectBaseDelay, so any negative
      // jitter draw (Math.random() < 0.5) collapses to exactly 1000ms — with
      // three real draws all three collapsed ~12.5% of runs, flaking the
      // variance assertion below. Use deterministic distinct draws instead.
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.6)
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.95)
        .mockReturnValue(0.5);

      const delays: number[] = [];

      // Collect multiple reconnection delays
      for (let i = 0; i < 3; i++) {
        eventHandlers.disconnect();

        const lastCall = (console.debug as any).mock.calls
          .filter((call) => call[0].includes('Scheduling reconnection'))
          .pop();

        if (lastCall) {
          const delayMatch = lastCall[0].match(/in (\d+)ms/);
          if (delayMatch) {
            delays.push(Number.parseInt(delayMatch[1]));
          }
        }

        vi.advanceTimersByTime(2000);
      }

      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should disable exponential backoff when configured', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {
          connectionConfig: {
            reconnectBaseDelay: 1000,
            reconnectMaxDelay: 8000,
            reconnectJitter: 0,
            exponentialBackoff: false,
          },
        },
      );

      // First establish connection
      eventHandlers.connected();

      const delays: number[] = [];

      // Multiple attempts should all use base delay
      for (let i = 0; i < 3; i++) {
        eventHandlers.disconnect();

        const lastCall = (console.debug as any).mock.calls
          .filter((call) => call[0].includes('Scheduling reconnection'))
          .pop();

        if (lastCall) {
          const delayMatch = lastCall[0].match(/in (\d+)ms/);
          if (delayMatch) {
            delays.push(Number.parseInt(delayMatch[1]));
          }
        }

        vi.advanceTimersByTime(1500);
      }

      // All delays should be base delay (1000ms)
      delays.forEach((delay) => {
        expect(delay).toBe(1000);
      });
    });
  });

  describe('isRealtimeHealthy', () => {
    it('should return true when realtime is healthy', () => {
      mockRealtime.isHealthy.mockReturnValue(true);

      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      expect(realtimeHandler.isRealtimeHealthy()).toBe(true);
    });

    it('should return false when realtime is unhealthy', () => {
      mockRealtime.isHealthy.mockReturnValue(false);

      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      expect(realtimeHandler.isRealtimeHealthy()).toBe(false);
    });

    it('should return false when no realtime module', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        undefined,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      expect(realtimeHandler.isRealtimeHealthy()).toBe(false);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    it('should clear timers and disconnect', () => {
      // First establish connection and then disconnect to create a timer
      eventHandlers.connected();
      eventHandlers.disconnect();

      realtimeHandler.dispose();

      expect(mockRealtime.disconnect).toHaveBeenCalledWith();
    });

    it('should handle dispose without active timers', () => {
      expect(() => {
        realtimeHandler.dispose();
      }).not.toThrow();
      expect(mockRealtime.disconnect).toHaveBeenCalledWith();
    });

    it('should handle dispose with no realtime module', () => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        undefined,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );

      expect(() => {
        realtimeHandler.dispose();
      }).not.toThrow();
    });
  });

  describe('error handling and edge cases', () => {
    beforeEach(() => {
      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        {},
      );
    });

    it('should handle malformed doc_changed payloads', async () => {
      await expect(eventHandlers.doc_changed(null)).resolves.not.toThrow();
      await expect(eventHandlers.doc_changed({})).resolves.not.toThrow();
      await expect(eventHandlers.doc_changed({ doctype: 'Test' })).resolves.not.toThrow();
    });

    it('should handle malformed doc_deleted payloads', async () => {
      await expect(eventHandlers.doc_deleted(null)).resolves.not.toThrow();
      await expect(eventHandlers.doc_deleted({})).resolves.not.toThrow();
      await expect(eventHandlers.doc_deleted({ doctype: 'Test' })).resolves.not.toThrow();
    });

    it('should handle database errors during doc_changed', async () => {
      mockDb.getDoc.mockRejectedValue(new Error('Database error'));

      await eventHandlers.doc_changed({ doctype: 'Test', name: 'test' });

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch document'), expect.any(Error));
    });

    it('should handle cache errors gracefully', async () => {
      const payload = { doctype: 'TestDoc', name: 'test-doc' };
      const mockDoc = { name: 'test-doc', doctype: 'TestDoc' };

      mockDb.getDoc.mockResolvedValue(mockDoc);
      mockNormalizedCache.upsert.mockImplementation(() => {
        throw new Error('Cache error');
      });

      // Should not throw
      await expect(eventHandlers.doc_changed(payload)).resolves.not.toThrow();
    });

    it('should handle subscription manager errors gracefully', async () => {
      const payload = { doctype: 'TestDoc', name: 'test-doc' };
      const mockDoc = { name: 'test-doc', doctype: 'TestDoc' };

      mockDb.getDoc.mockResolvedValue(mockDoc);
      mockSubscriptionManager.updateSubscriptionMembership.mockImplementation(() => {
        throw new Error('Subscription error');
      });

      // Should not throw
      await expect(eventHandlers.doc_changed(payload)).resolves.not.toThrow();
    });

    it('should handle rehydration manager errors gracefully', async () => {
      const payload = { doctype: 'TestDoc', name: 'test-doc' };
      const affectedSubscriptions: any[] = [{ id: 'sub1', docIds: [] }];

      mockSubscriptionManager.removeFromAllSubscriptions.mockReturnValue(affectedSubscriptions);
      mockRehydrationManager.scheduleRehydration.mockImplementation(() => {
        throw new Error('Rehydration error');
      });

      // Should not throw
      await expect(eventHandlers.doc_deleted(payload)).resolves.not.toThrow();
    });
  });

  describe('callback integration', () => {
    it('should integrate all callbacks properly', async () => {
      const callbacks = {
        onRealtimeEvent: vi.fn(),
        onResetCache: vi.fn(),
        onBackfillAll: vi.fn(),
      };

      realtimeHandler = new RealtimeHandler(
        mockDb,
        mockRealtime,
        mockNormalizedCache,
        mockSubscriptionManager,
        mockRehydrationManager,
        callbacks,
      );

      // Test all event types
      await eventHandlers.doc_changed({ doctype: 'Test', name: 'test1' });
      await eventHandlers.doc_deleted({ doctype: 'Test', name: 'test2' });
      eventHandlers.perm_epoch_bump();
      eventHandlers.connected();

      expect(callbacks.onRealtimeEvent).toHaveBeenCalledTimes(4);
      expect(callbacks.onResetCache).toHaveBeenCalledOnce();
      expect(callbacks.onBackfillAll).toHaveBeenCalledOnce();
    });
  });
});
