import { setTimeout as sleep } from 'node:timers/promises';

import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthType } from './core/types';
import type { Handler } from './realtime';
import { RealtimeModule, RealtimePlatform } from './realtime';

// Mock socket.io-client
type SocketListener = (...args: any[]) => void;

const mockSocket = {
  connected: false,
  on: vi.fn<(event: string, listener: SocketListener) => void>(),
  off: vi.fn<(event: string, listener: SocketListener) => void>(),
  emit: vi.fn<(event: string, ...args: unknown[]) => void>(),
  connect: vi.fn<() => void>(),
  disconnect: vi.fn<() => void>(),
  removeAllListeners: vi.fn<() => void>(),
  id: 'mock-socket-id',
  // Manager handle: RealtimeModule mutates manager.opts on credential
  // refresh and registers a reconnect_attempt safety net.
  io: {
    opts: {} as Partial<ManagerOptions & SocketOptions>,
    on: vi.fn<(event: string, listener: () => void) => void>(),
  },
};

vi.mock(import('socket.io-client'), () => ({
  // Return the mock socket when io() is called. A Mock drops io's overloads,
  // so it is re-viewed as the real signature for the module shape.
  io: vi.fn<typeof io>(() => mockSocket as unknown as Socket) as unknown as typeof io,
}));

/** Options passed to the most recent io() call. */
const ioOptions = (): any => (io as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] ?? {};

describe(RealtimeModule, () => {
  let realtime: RealtimeModule;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockSocket.connected = false;
    mockSocket.on.mockImplementation((event, handler) => {
      // Simulate immediate connection for testing
      if (event === 'connect') {
        mockSocket.connected = true;
        setTimeout(() => {
          handler();
        }, 0);
      }
    });

    realtime = new RealtimeModule({ baseURL: 'http://localhost:3000' });
  });

  afterEach(() => {
    // Clean up realtime module if it exists
    realtime.disconnect();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize without throwing', () => {
      expect(() => new RealtimeModule({ baseURL: 'http://localhost:3000' })).not.toThrow();
    });

    it('should initialize with auth config', () => {
      const auth = { token: 'test-token', useToken: true };
      expect(() => new RealtimeModule({ baseURL: 'http://localhost:3000', auth })).not.toThrow();
    });

    it('should detect platform', () => {
      // Test React Native detection
      const originalUA = (global as any).navigator?.userAgent;
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'ReactNative' },
        writable: true,
      });
      const rnInstance = new RealtimeModule({
        baseURL: 'http://localhost:3000',
      });
      expect(rnInstance).toBeDefined();
      expect((rnInstance as any).config.platform).toBe(RealtimePlatform.ReactNative);

      // Restore
      if (originalUA !== undefined) {
        Object.defineProperty(global, 'navigator', {
          value: { userAgent: originalUA },
          writable: true,
        });
      }
    });

    it('detects React Native via navigator.product (RN sets no userAgent)', () => {
      // Real RN runtimes define navigator.product === "ReactNative" and NO
      // userAgent — the old UA-only sniff misdetected RN as Web, skipping
      // the extraHeaders auth path (cookie-auth sockets connected as guest).
      const originalNavigator = (global as any).navigator;
      Object.defineProperty(global, 'navigator', {
        value: { product: 'ReactNative' },
        writable: true,
      });
      const rnInstance = new RealtimeModule({ baseURL: 'http://localhost:3000' });
      expect((rnInstance as any).config.platform).toBe(RealtimePlatform.ReactNative);
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
      });
    });

    it('keeps detecting Web in a browser-like environment', () => {
      const webInstance = new RealtimeModule({ baseURL: 'http://localhost:3000' });
      expect((webInstance as any).config.platform).toBe(RealtimePlatform.Web);
    });

    it('classifies GJS (imports.gi global) as Node — before the Web branch', () => {
      // GJS has window/document layout stubs in the GNOME bundles, so the
      // Web classification would otherwise win — but GJS has no XHR for a
      // polling-first handshake and its libsoup WebSocket polyfill accepts
      // custom headers, so it must take the non-Web (extraHeaders) path.
      (globalThis as any).imports = { gi: {} };
      try {
        const gjsInstance = new RealtimeModule({ baseURL: 'http://localhost:3000' });
        expect((gjsInstance as any).config.platform).toBe(RealtimePlatform.Node);
      } finally {
        delete (globalThis as any).imports;
      }
    });
  });

  describe('GJS handshake', () => {
    it('connects websocket-first with token auth in extraHeaders', async () => {
      (globalThis as any).imports = { gi: {} };
      try {
        const rt = new RealtimeModule({
          baseURL: 'http://localhost:3000',
          auth: { useToken: true, token: 'key:secret', type: AuthType.Token },
        });
        await (rt as any).connect();

        const options = ioOptions();
        expect(options.transports).toStrictEqual(['websocket', 'polling']);
        expect(options.extraHeaders.Authorization).toBe('token key:secret');
        expect(options.extraHeaders.Origin).toBe('http://localhost:3000');
        expect(options.transportOptions.websocket.extraHeaders.Authorization).toBe('token key:secret');
        rt.disconnect();
      } finally {
        delete (globalThis as any).imports;
      }
    });
  });

  describe('React Native handshake', () => {
    it('routes the sid session cookie into extraHeaders on RN (cookie auth)', async () => {
      const originalNavigator = (global as any).navigator;
      Object.defineProperty(global, 'navigator', {
        value: { product: 'ReactNative' },
        writable: true,
      });
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { sessionId: async () => 'sid-abc' },
      });
      await (rt as any).connect();

      const options = ioOptions();
      // Native is websocket-first and must carry sid + Origin itself —
      // there is no shared browser cookie jar on the socket handshake.
      expect(options.transports).toStrictEqual(['websocket', 'polling']);
      expect(options.extraHeaders.Cookie).toBe('sid=sid-abc');
      expect(options.extraHeaders.Origin).toBe('http://localhost:3000');
      expect(options.transportOptions.websocket.extraHeaders.Cookie).toBe('sid=sid-abc');

      rt.disconnect();
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
      });
    });
  });

  describe('connect', () => {
    it('should establish socket connection', async () => {
      await (realtime as any).connect();
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should not connect twice', async () => {
      await (realtime as any).connect();
      const callCount = mockSocket.on.mock.calls.length;
      await (realtime as any).connect();
      // No additional calls
      expect(mockSocket.on).toHaveBeenCalledTimes(callCount);
    });

    it('should handle connection errors', async () => {
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'connect_error') {
          setTimeout(() => {
            handler(new Error('Connection failed'));
          }, 0);
        }
      });
      await (realtime as any).connect();
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    });
  });

  describe('on', () => {
    it('should register event handler and create socket listener dynamically', async () => {
      const handler = vi.fn<Handler>();
      await (realtime as any).connect();
      await realtime.on('custom_event', handler);

      // Should create socket listener for new event
      expect(mockSocket.on).toHaveBeenCalledWith('custom_event', expect.any(Function));
    });

    it('should register multiple handlers for same event without duplicating socket listener', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      // First connect to avoid the double registration issue
      await (realtime as any).connect();

      // Now add handlers after connection is established
      await realtime.on('doc_changed', handler1);
      const firstCallCount = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'doc_changed').length;

      await realtime.on('doc_changed', handler2);
      const secondCallCount = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'doc_changed').length;

      // Should only create one socket listener for the event
      expect(firstCallCount).toBe(1);
      // Should not increase
      expect(secondCallCount).toBe(1);
    });

    it('should handle any event type', async () => {
      const events = [
        'doc_changed',
        'doc_deleted',
        'chat_message',
        'notification',
        'custom_event',
        'iot_sensor',
        'game_state',
      ];

      // Connect first to avoid double registration
      await (realtime as any).connect();

      await Promise.all(
        events.map(async (event) => {
          await realtime.on(event, vi.fn<Handler>());
        }),
      );

      // Each event should have its socket listener
      for (const event of events) {
        const calls = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === event);
        expect(calls).toHaveLength(1);
      }
    });

    it('should forward events to registered handlers', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      await (realtime as any).connect();
      await realtime.on('test_event', handler1);
      await realtime.on('test_event', handler2);

      // Get the socket listener that was registered
      const socketListener = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'test_event')?.[1];

      // Simulate receiving an event
      const payload = { data: 'test' };
      socketListener!(payload);

      // Both handlers should receive the event
      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it('does NOT connect when adding a handler — socket lifecycle is room-driven', async () => {
      // The sync engine registers its handlers at construction; if that
      // booted a socket, merely constructing a client for an unreachable
      // host would start an unclosable infinite reconnect loop (the
      // fixture/mock-story leak). Handlers wait for the first room join.
      const handler = vi.fn<Handler>();
      await realtime.on('test_event', handler);

      expect(io).not.toHaveBeenCalled();
      expect((realtime as any).socket).toBeUndefined();
    });

    it('attaches handlers registered before the first room join once it connects', async () => {
      const handler = vi.fn<Handler>();
      await realtime.on('pre_join_event', handler);
      expect(io).not.toHaveBeenCalled();

      await realtime.subscribeList('Task');

      expect(mockSocket.on).toHaveBeenCalledWith('pre_join_event', expect.any(Function));
    });
  });

  describe('off', () => {
    it('should remove event handler', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      await (realtime as any).connect();
      await realtime.on('test_event', handler1);
      await realtime.on('test_event', handler2);

      realtime.off('test_event', handler1);

      // Get the socket listener
      const socketListener = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'test_event')?.[1];

      // Simulate event
      const payload = { data: 'test' };
      socketListener!(payload);

      // Only handler2 should be called
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it('should remove socket listener when last handler is removed', async () => {
      const handler = vi.fn<Handler>();

      await (realtime as any).connect();
      await realtime.on('test_event', handler);
      realtime.off('test_event', handler);

      // Socket listener should be removed (off is called with event name and handler)
      expect(mockSocket.off).toHaveBeenCalledWith('test_event', expect.any(Function));
    });

    it('should not remove socket listener if other handlers remain', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      await (realtime as any).connect();
      await realtime.on('test_event', handler1);
      await realtime.on('test_event', handler2);

      realtime.off('test_event', handler1);

      // Socket listener should NOT be removed
      expect(mockSocket.off).not.toHaveBeenCalledWith('test_event');
    });

    it('should handle removing non-existent handler gracefully', () => {
      const handler = vi.fn<Handler>();
      expect(() => {
        realtime.off('test_event', handler);
      }).not.toThrow();
    });
  });

  describe('subscribeDoc / unsubscribeDoc', () => {
    it('should emit doc_subscribe event', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;

      await realtime.subscribeDoc('Task', 'TASK-001');
      // Positional args — frappe's socketio handler signature is (doctype, docname)
      expect(mockSocket.emit).toHaveBeenCalledWith('doc_subscribe', 'Task', 'TASK-001');
    });

    it('should emit doc_unsubscribe event', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;
      (realtime as any).socket = mockSocket;

      realtime.unsubscribeDoc('Task', 'TASK-001');
      expect(mockSocket.emit).toHaveBeenCalledWith('doc_unsubscribe', 'Task', 'TASK-001');
    });

    it('should connect before subscribing if not connected', async () => {
      await realtime.subscribeDoc('Task', 'TASK-001');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('subscribeList / unsubscribeList', () => {
    it('should emit doctype_subscribe event', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;

      await realtime.subscribeList('Task', { status: 'Open' });
      // frappe has one realtime room per doctype; filters stay client-side
      expect(mockSocket.emit).toHaveBeenCalledWith('doctype_subscribe', 'Task');
    });

    it('should emit doctype_unsubscribe event', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;
      (realtime as any).socket = mockSocket;

      realtime.unsubscribeList('Task');
      expect(mockSocket.emit).toHaveBeenCalledWith('doctype_unsubscribe', 'Task');
    });
  });

  describe('isHealthy', () => {
    it('should return true when socket is connected and healthy', async () => {
      await (realtime as any).connect();

      // Simulate successful connection
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')?.[1];
      connectHandler!();

      expect(realtime.isHealthy()).toBe(true);
    });

    it('should return false when disconnected', () => {
      expect(realtime.isHealthy()).toBe(false);
    });

    it('should return false after disconnect event', async () => {
      await (realtime as any).connect();

      // First connect
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')?.[1];
      connectHandler!();

      expect(realtime.isHealthy()).toBe(true);

      // Then disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'disconnect')?.[1];
      disconnectHandler!('transport close');

      expect(realtime.isHealthy()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect socket', async () => {
      await (realtime as any).connect();
      realtime.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalledWith();
    });

    it('should clear all handlers', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      await (realtime as any).connect();
      await realtime.on('event1', handler1);
      await realtime.on('event2', handler2);

      realtime.disconnect();

      // Should disconnect the socket
      expect(mockSocket.disconnect).toHaveBeenCalledWith();

      // After disconnect, handlers should be cleared
      // Try to trigger an event - handlers should not be called
      const socketListener1 = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'event1')?.[1];

      socketListener1?.({ data: 'test' });
      expect(handler1).not.toHaveBeenCalled();
    });

    it('should handle multiple disconnects gracefully', () => {
      expect(() => {
        realtime.disconnect();
        realtime.disconnect();
      }).not.toThrow();
    });
  });

  describe('emit', () => {
    it('should emit events through socket', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;
      (realtime as any).socket = mockSocket;

      const payload = { test: 'data' };
      realtime.emit('custom_event', payload);

      expect(mockSocket.emit).toHaveBeenCalledWith('custom_event', payload);
    });

    it('should not emit when not connected', () => {
      const payload = { test: 'data' };
      realtime.emit('custom_event', payload);

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('reconnection handling', () => {
    it('should re-register existing handlers when connection is re-established', async () => {
      const handler = vi.fn<Handler>();

      // First establish connection to avoid double registration
      await (realtime as any).connect();

      // Add handler after connection
      await realtime.on('test_event', handler);

      // Track initial socket listener registration
      const initialCalls = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'test_event');
      expect(initialCalls).toHaveLength(1);

      // Clear mock and simulate socket reconnection without calling disconnect()
      // (which would clear handlers)
      mockSocket.on.mockClear();
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- simulates a dropped transport by clearing the private socket slot
      (realtime as any).socket = undefined;
      (realtime as any).socketHealthy = false;
      // Reset isConnecting flag
      (realtime as any).isConnecting = false;

      // Re-establish connection - should re-register events from handlerMap
      await (realtime as any).connect();

      // Should re-register events that are still in handlerMap
      const reconnectCalls = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'test_event');
      expect(reconnectCalls).toHaveLength(1);
    });

    it('should not maintain handlers after explicit disconnect', async () => {
      const handler1 = vi.fn<Handler>();
      const handler2 = vi.fn<Handler>();

      await realtime.on('event1', handler1);
      await realtime.on('event2', handler2);

      // Disconnect clears handlerMap
      realtime.disconnect();

      // Clear mocks and reconnect
      mockSocket.on.mockClear();
      await (realtime as any).connect();

      // Events should NOT be re-registered since handlerMap was cleared
      const event1Calls = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'event1');
      const event2Calls = mockSocket.on.mock.calls.filter((call: any[]) => call[0] === 'event2');

      expect(event1Calls).toHaveLength(0);
      expect(event2Calls).toHaveLength(0);
    });

    it('should re-emit doc and list subscriptions on reconnect', async () => {
      await realtime.subscribeDoc('Task', 'TASK-001');
      await realtime.subscribeList('Task', { status: 'Open' });

      // Drain the initial subscribe emits from the first connect
      await sleep(10);
      mockSocket.emit.mockClear();

      // Simulate transport recovery: soft path keeps rooms, reconnect re-emits them
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- simulates a dropped transport by clearing the private socket slot
      (realtime as any).socket = undefined;
      (realtime as any).socketHealthy = false;
      (realtime as any).isConnecting = false;
      await (realtime as any).connect();
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')?.[1];
      connectHandler?.();

      expect(mockSocket.emit).toHaveBeenCalledWith('doc_subscribe', 'Task', 'TASK-001');
      expect(mockSocket.emit).toHaveBeenCalledWith('doctype_subscribe', 'Task');
    });
  });

  describe('updateAuth', () => {
    it('should reconnect and preserve handlers after auth refresh', async () => {
      const handler = vi.fn<Handler>();
      // A live room keeps the socket warranted across the rotation.
      await realtime.subscribeList('Task');
      await realtime.on('doc_changed', handler);
      await sleep(10);

      mockSocket.disconnect.mockClear();
      mockSocket.on.mockClear();

      await realtime.updateAuth({
        useToken: true,
        token: 'new-token',
        type: 'token' as any,
      });

      // Soft disconnect tears down the socket but keeps handlers
      expect(mockSocket.disconnect).toHaveBeenCalledWith();
      // New connect should re-attach the preserved handler
      const reattached = mockSocket.on.mock.calls.some((call: any[]) => call[0] === 'doc_changed');
      expect(reattached).toBe(true);
    });

    it('does not boot a socket on auth rotation while idle (no rooms)', async () => {
      const handler = vi.fn<Handler>();
      await realtime.on('doc_changed', handler);
      expect((realtime as any).socket).toBeUndefined();

      await realtime.updateAuth({ useToken: true, token: 'rotated' });

      // Still idle: the next room join will connect with the fresh auth.
      expect((realtime as any).socket).toBeUndefined();
      expect(io).not.toHaveBeenCalled();
    });

    it('should reconnect when only room subscriptions exist (no handlers)', async () => {
      mockSocket.connected = true;
      (realtime as any).socketHealthy = true;
      (realtime as any).socket = mockSocket;
      await realtime.subscribeDoc('Task', 'TASK-009');

      mockSocket.disconnect.mockClear();
      await realtime.updateAuth({ useToken: true, token: 'rotated' });

      expect(mockSocket.disconnect).toHaveBeenCalledWith();
      // Rooms preserved → soft reconnect opened a new socket
      expect((realtime as any).socket).toBeDefined();
      expect((realtime as any).docRooms.size).toBe(1);
    });
  });

  describe('subscribe before healthy', () => {
    it('should emit doc_subscribe after the connect event (no race no-op)', async () => {
      const subscribePromise = realtime.subscribeDoc('Task', 'TASK-RACE');
      // Connect handler is scheduled via setTimeout(0) in the mock
      await subscribePromise;

      expect(mockSocket.emit).toHaveBeenCalledWith('doc_subscribe', 'Task', 'TASK-RACE');
    });
  });

  describe('idle teardown', () => {
    it('tears the socket down when the last room is unsubscribed', async () => {
      await realtime.subscribeDoc('Task', 'TASK-001');
      await sleep(10);
      expect((realtime as any).socket).toBeDefined();

      mockSocket.disconnect.mockClear();
      realtime.unsubscribeDoc('Task', 'TASK-001');

      expect(mockSocket.disconnect).toHaveBeenCalledWith();
      expect((realtime as any).socket).toBeUndefined();
    });

    it('keeps the socket while any room remains', async () => {
      await realtime.subscribeDoc('Task', 'TASK-001');
      await realtime.subscribeList('Task');
      await sleep(10);

      mockSocket.disconnect.mockClear();
      realtime.unsubscribeDoc('Task', 'TASK-001');

      // The doctype room still holds the socket open.
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect((realtime as any).socket).toBeDefined();
    });

    it('notifies lifecycle handlers on idle teardown', async () => {
      const onDisconnect = vi.fn<Handler>();
      await realtime.on('disconnect', onDisconnect);
      await realtime.subscribeList('Task');
      await sleep(10);

      realtime.unsubscribeList('Task');

      expect(onDisconnect).toHaveBeenCalledWith({ reason: 'idle-teardown' });
    });

    it('reconnects with preserved handlers on the next subscription after teardown', async () => {
      const handler = vi.fn<Handler>();
      await realtime.on('doc_update', handler);
      await realtime.subscribeList('Task');
      await sleep(10);
      realtime.unsubscribeList('Task');
      expect((realtime as any).socket).toBeUndefined();

      mockSocket.on.mockClear();
      await realtime.subscribeList('ToDo');
      await sleep(10);

      expect((realtime as any).socket).toBeDefined();
      expect(mockSocket.on).toHaveBeenCalledWith('doc_update', expect.any(Function));
    });
  });

  describe('connect_error', () => {
    it('should forward connect_error to registered handlers', async () => {
      const onError = vi.fn<Handler>();
      await (realtime as any).connect();
      await realtime.on('connect_error', onError);

      const errorHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect_error')?.[1];
      const err = new Error('auth failed');
      errorHandler?.(err);

      expect(onError).toHaveBeenCalledWith(err);
    });
  });

  describe('token auth handshake', () => {
    it('attaches Authorization (never Origin) and handshakes over polling on web', async () => {
      mockSocket.io.opts = {};
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token: async () => 'tok-1' },
      });
      await (rt as any).connect();

      const options = ioOptions();
      // Browsers can only attach headers to the polling (XHR) handshake —
      // websocket upgrade rides the established session afterwards.
      expect(options.transports).toStrictEqual(['polling', 'websocket']);
      expect(options.extraHeaders.Authorization).toBe('Bearer tok-1');
      // Origin is a forbidden browser header: the browser always sends the
      // page origin itself, and attempting to set it spams "Attempt to set a
      // forbidden header was denied: Origin" on every polling request.
      expect(options.extraHeaders.Origin).toBeUndefined();
      // Headers are mirrored per-transport for node websocket handshakes
      expect(options.transportOptions.polling.extraHeaders.Authorization).toBe('Bearer tok-1');
      expect(options.transportOptions.websocket.extraHeaders.Authorization).toBe('Bearer tok-1');
      rt.disconnect();
    });

    it('sets no forbidden header on web in any transport option (Origin, Cookie)', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token: 'key:secret', type: 'token' as any, sessionId: 'sid-x' },
      });
      await (rt as any).connect();

      const options = ioOptions();
      expect(options.extraHeaders.Origin).toBeUndefined();
      expect(options.extraHeaders.Cookie).toBeUndefined();
      expect(options.transportOptions.polling.extraHeaders.Origin).toBeUndefined();
      expect(options.transportOptions.polling.extraHeaders.Cookie).toBeUndefined();
      expect(options.transportOptions.websocket.extraHeaders.Origin).toBeUndefined();
      rt.disconnect();
    });

    it('derives the socket host from baseURL (LAN page → LAN socket)', async () => {
      // The dev wrapper rewrites a loopback baseURL to the page hostname
      // (features/backoffice/shared/env.ts); the socket must follow that
      // hostname with the socketPort swapped in — not stay on localhost.
      const rt = new RealtimeModule({
        baseURL: 'http://10.236.0.10:8000',
        socketPort: 9000,
      });
      await (rt as any).connect();

      const { calls } = (io as unknown as ReturnType<typeof vi.fn>).mock;
      expect(calls.at(-1)?.[0]).toBe('http://10.236.0.10:9000/10.236.0.10');
      rt.disconnect();
    });

    it('uses an explicit siteName as the Socket.IO namespace (127.0.0.1 → localhost)', async () => {
      // Frappe socketio maps Host localhost/127.0.0.1 to conf.default_site
      // and rejects any other namespace. Connecting via the IPv4 literal
      // (the serve_dev.py workaround for shcd on [::1]:8000) must still
      // join /localhost, not /127.0.0.1.
      const rt = new RealtimeModule({
        baseURL: 'http://127.0.0.1:8000',
        socketPort: 9000,
        siteName: 'localhost',
      });
      await (rt as any).connect();

      const { calls } = (io as unknown as ReturnType<typeof vi.fn>).mock;
      expect(calls.at(-1)?.[0]).toBe('http://127.0.0.1:9000/localhost');
      rt.disconnect();
    });

    it('dials socketBaseURL when set, joining the siteName namespace (same-origin dev)', async () => {
      // Web dev: the dev server proxies /socket.io on the PAGE origin (e.g.
      // :3998) to the bench socketio — the client must dial that origin, not
      // baseURL+socketPort, so the polling handshake is same-origin.
      const rt = new RealtimeModule({
        baseURL: 'http://127.0.0.1:8000',
        socketBaseURL: 'http://127.0.0.1:3998',
        siteName: 'localhost',
      });
      await (rt as any).connect();

      const { calls } = (io as unknown as ReturnType<typeof vi.fn>).mock;
      expect(calls.at(-1)?.[0]).toBe('http://127.0.0.1:3998/localhost');
      rt.disconnect();
    });

    it('socketBaseURL wins over socketPort and trims a trailing slash', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://127.0.0.1:8000',
        socketPort: 9000,
        socketBaseURL: 'http://localhost:3998/',
        siteName: 'localhost',
      });
      await (rt as any).connect();

      const { calls } = (io as unknown as ReturnType<typeof vi.fn>).mock;
      expect(calls.at(-1)?.[0]).toBe('http://localhost:3998/localhost');
      rt.disconnect();
    });

    it('falls back to the baseURL hostname namespace under socketBaseURL without siteName', async () => {
      // Same fallback as the derived path: the namespace comes from the
      // BENCH URL's hostname — never from socketBaseURL, whose hostname is
      // the dev server, not a Frappe site.
      const rt = new RealtimeModule({
        baseURL: 'http://bench.example.com:8000',
        socketBaseURL: 'http://localhost:3998',
      });
      await (rt as any).connect();

      const { calls } = (io as unknown as ReturnType<typeof vi.fn>).mock;
      expect(calls.at(-1)?.[0]).toBe('http://localhost:3998/bench.example.com');
      rt.disconnect();
    });

    it('uses the token scheme when auth type is token', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token: 'key:secret', type: 'token' as any },
      });
      await (rt as any).connect();

      expect(ioOptions().extraHeaders.Authorization).toBe('token key:secret');
      rt.disconnect();
    });

    it('handshakes polling-first on web even without token auth', async () => {
      // Cookie-session auth and reverse-proxy-injected Authorization only
      // ride HTTP requests, and ws-upgrade-hostile dev proxies (vite
      // middleware mode) hang raw upgrades — browsers always start on
      // polling and let Socket.IO upgrade the established session.
      const rt = new RealtimeModule({ baseURL: 'http://localhost:3000' });
      await (rt as any).connect();

      expect(ioOptions().transports).toStrictEqual(['polling', 'websocket']);
      rt.disconnect();
    });

    it('keeps websocket-first transports off-web (node)', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        platform: RealtimePlatform.Node,
      });
      await (rt as any).connect();

      expect(ioOptions().transports).toStrictEqual(['websocket', 'polling']);
      rt.disconnect();
    });

    it('omits Authorization when the token getter resolves empty (signed out)', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token: async () => '' },
      });
      await (rt as any).connect();

      expect(ioOptions().extraHeaders?.Authorization).toBeUndefined();
      rt.disconnect();
    });

    it('re-resolves the token into manager opts on disconnect (refresh mid-session)', async () => {
      let calls = 0;
      const token = async () => {
        calls += 1;
        return calls === 1 ? 'tok-1' : 'tok-2';
      };
      mockSocket.io.opts = {};
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token },
      });
      await (rt as any).connect();
      expect(ioOptions().extraHeaders.Authorization).toBe('Bearer tok-1');

      // Simulate a transport drop: the disconnect handler must refresh the
      // credentials in the live manager opts before socket.io retries.
      const disconnectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'disconnect')?.[1];
      disconnectHandler?.('transport close');
      await (rt as any).refreshSocketAuth();

      const opts = mockSocket.io.opts as any;
      expect(opts.extraHeaders.Authorization).toBe('Bearer tok-2');
      expect(opts.transportOptions.polling.extraHeaders.Authorization).toBe('Bearer tok-2');
      rt.disconnect();
    });

    it('registers a reconnect_attempt refresh hook on the manager', async () => {
      mockSocket.io.opts = {};
      mockSocket.io.on.mockClear();
      let calls = 0;
      const token = async () => {
        calls += 1;
        return `tok-${calls}`;
      };
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token },
      });
      await (rt as any).connect();

      const reconnectHook = mockSocket.io.on.mock.calls.find((call: any[]) => call[0] === 'reconnect_attempt')?.[1];
      expect(reconnectHook).toBeDefined();

      reconnectHook?.();
      await (rt as any).refreshSocketAuth();

      const opts = mockSocket.io.opts as any;
      expect(opts.extraHeaders.Authorization).toBe('Bearer tok-2');
      rt.disconnect();
    });

    it('preserves rooms across explicit token rotation (updateAuth)', async () => {
      const rt = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        auth: { useToken: true, token: 'old-token' },
      });
      await rt.subscribeDoc('Task', 'TASK-100');
      await rt.subscribeList('Task');
      await sleep(10);

      await rt.updateAuth({ useToken: true, token: 'new-token' });

      expect((rt as any).docRooms.size).toBe(1);
      expect((rt as any).listRooms.size).toBe(1);
      expect(ioOptions().extraHeaders.Authorization).toBe('Bearer new-token');
      rt.disconnect();
    });
  });
});
