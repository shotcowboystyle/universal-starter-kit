import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RealtimeConfig, RealtimeSSEConfig, SSEMessageEventLike } from './realtime';
import { RealtimeModule } from './realtime';

// Mock socket.io-client so the "socketio default untouched" checks can assert
// which transport was constructed without ever touching the network.
const mockSocket = {
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  id: 'mock-socket-id',
  io: { opts: {} as Record<string, unknown>, on: vi.fn() },
};

vi.mock(import('socket.io-client'), () => ({
  io: vi.fn(() => mockSocket),
}));

type FakeListener = (event: SSEMessageEventLike) => void;

/**
 * Fake WHATWG EventSource injected via config.sse.EventSource. Records every
 * construction (URL + init) and lets tests drive the lifecycle: `open()` /
 * `fail()` dispatch dataless lifecycle events, `frame()` dispatches a server
 * frame (a MessageEvent-like object WITH data).
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials?: boolean;
  closed = false;
  private readonly listeners = new Map<string, Set<FakeListener>>();

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: FakeListener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: FakeListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatch(type: string, event: { data?: unknown; lastEventId?: string } = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ type, ...event });
    }
  }

  /** Dataless lifecycle open — EventSource connected. */
  open() {
    this.dispatch('open');
  }

  /** Dataless lifecycle error — connection lost / failed. */
  fail() {
    this.dispatch('error');
  }

  /** A server frame: `event: <type>` + `data: <data>` (+ optional `id:`). */
  frame(type: string, data: string, lastEventId = '') {
    this.dispatch(type, { data, lastEventId });
  }

  static last(): FakeEventSource {
    return FakeEventSource.instances.at(-1);
  }
}

describe('RealtimeModule (SSE transport)', () => {
  const created: RealtimeModule[] = [];

  function createSSE(
    sseOverrides: Partial<RealtimeSSEConfig> = {},
    configOverrides: Partial<RealtimeConfig> = {},
  ): RealtimeModule {
    const realtime = new RealtimeModule({
      baseURL: 'http://localhost:3000',
      transport: 'sse',
      sse: {
        path: '/api/method/shc.events.stream',
        EventSource: FakeEventSource,
        ...sseOverrides,
      },
      ...configOverrides,
    });
    created.push(realtime);
    return realtime;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    FakeEventSource.instances = [];
    mockSocket.connected = false;
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'connect') {
        mockSocket.connected = true;
        setTimeout(() => {
          handler();
        }, 0);
      }
    });
  });

  afterEach(() => {
    for (const realtime of created.splice(0)) {
      realtime.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('opens an EventSource against baseURL + path and turns healthy on open', async () => {
      const realtime = createSSE();
      const connected = vi.fn();
      await realtime.on('connected', connected);

      await realtime.connect();
      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.last().url).toBe('http://localhost:3000/api/method/shc.events.stream');
      expect(realtime.isHealthy()).toBe(false);

      FakeEventSource.last().open();
      expect(realtime.isHealthy()).toBe(true);
      expect(connected).toHaveBeenCalledWith({ transport: 'sse' });
      expect(realtime.getEventSource()).toBe(FakeEventSource.last());
    });

    it('does not open a second EventSource while one exists', async () => {
      const realtime = createSSE();
      await realtime.connect();
      await realtime.connect();
      expect(FakeEventSource.instances).toHaveLength(1);
    });

    it('prefers sse.url over sse.path', async () => {
      const realtime = createSSE({ url: 'https://daemon.example/stream', path: '/ignored' });
      await realtime.connect();
      expect(FakeEventSource.last().url).toBe('https://daemon.example/stream');
    });

    it('appends queryParams (encoded, merged onto an existing query string)', async () => {
      const realtime = createSSE({
        url: 'https://daemon.example/stream?tenant=acme',
        queryParams: { token: 'se cret&', kind: 'docker' },
      });
      await realtime.connect();
      expect(FakeEventSource.last().url).toBe(
        'https://daemon.example/stream?tenant=acme&token=se%20cret%26&kind=docker',
      );
    });

    it('passes withCredentials through to the EventSource init', async () => {
      const realtime = createSSE({ withCredentials: true });
      await realtime.connect();
      expect(FakeEventSource.last().withCredentials).toBe(true);
    });

    it('throws a descriptive error when neither sse.url nor sse.path is set', async () => {
      const realtime = createSSE({ path: undefined });
      await expect(realtime.connect()).rejects.toThrow(/config\.sse\.url or config\.sse\.path/);
      // isConnecting must be reset so a corrected config could retry.
      await expect(realtime.connect()).rejects.toThrow(/config\.sse\.url or config\.sse\.path/);
      expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('throws an error naming config.sse.EventSource when no constructor exists', async () => {
      const globalRef = globalThis as { EventSource?: unknown };
      const originalEventSource = globalRef.EventSource;
      globalRef.EventSource = undefined;
      try {
        const realtime = createSSE({ EventSource: undefined });
        await expect(realtime.connect()).rejects.toThrow(/config\.sse\.EventSource/);
      } finally {
        globalRef.EventSource = originalEventSource;
      }
    });

    it('feature-detects the global EventSource when none is injected', async () => {
      const globalRef = globalThis as { EventSource?: unknown };
      const originalEventSource = globalRef.EventSource;
      globalRef.EventSource = FakeEventSource;
      try {
        const realtime = createSSE({ EventSource: undefined });
        await realtime.connect();
        expect(FakeEventSource.instances).toHaveLength(1);
      } finally {
        globalRef.EventSource = originalEventSource;
      }
    });
  });

  describe('default frame mapping', () => {
    it('delivers frames under the SSE event type name with JSON-parsed payload', async () => {
      const realtime = createSSE();
      const onDocker = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('docker', '{"code":"container.start","tenant":"acme"}');
      expect(onDocker).toHaveBeenCalledOnce();
      expect(onDocker).toHaveBeenCalledWith({ code: 'container.start', tenant: 'acme' });
    });

    it('delivers unnamed frames under the "message" type', async () => {
      const realtime = createSSE();
      const onMessage = vi.fn();
      await realtime.on('message', onMessage);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('message', '{"sequence":7}');
      expect(onMessage).toHaveBeenCalledWith({ sequence: 7 });
    });

    it('attaches a listener dynamically when a handler is added after connect', async () => {
      const realtime = createSSE();
      await realtime.connect();
      FakeEventSource.last().open();
      expect(FakeEventSource.last().listenerCount('audit')).toBe(0);

      const onAudit = vi.fn();
      await realtime.on('audit', onAudit);
      expect(FakeEventSource.last().listenerCount('audit')).toBe(1);

      FakeEventSource.last().frame('audit', '{"actor":"admin"}');
      expect(onAudit).toHaveBeenCalledWith({ actor: 'admin' });
    });

    it('falls back to the raw string when frame data is not JSON', async () => {
      const realtime = createSSE();
      const onDocker = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('docker', 'plain text payload');
      expect(onDocker).toHaveBeenCalledWith('plain text payload');
    });

    it('fans one frame out to every registered handler', async () => {
      const realtime = createSSE();
      const first = vi.fn();
      const second = vi.fn();
      await realtime.on('docker', first);
      await realtime.on('docker', second);
      await realtime.connect();
      FakeEventSource.last().open();
      expect(FakeEventSource.last().listenerCount('docker')).toBe(1);

      FakeEventSource.last().frame('docker', '{"code":"x"}');
      expect(first).toHaveBeenCalledWith({ code: 'x' });
      expect(second).toHaveBeenCalledWith({ code: 'x' });
    });

    it('off() removes frame listeners but keeps lifecycle and declared server types attached', async () => {
      const realtime = createSSE({ events: ['docker'] });
      const onDocker = vi.fn();
      const onAudit = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.on('audit', onAudit);
      await realtime.connect();
      FakeEventSource.last().open();

      realtime.off('audit', onAudit);
      expect(FakeEventSource.last().listenerCount('audit')).toBe(0);

      // "docker" is declared in sse.events — it keeps feeding mapFrame/default
      // routing even after the same-named handler goes away.
      realtime.off('docker', onDocker);
      expect(FakeEventSource.last().listenerCount('docker')).toBe(1);
      expect(FakeEventSource.last().listenerCount('open')).toBe(1);
      expect(FakeEventSource.last().listenerCount('error')).toBe(1);
    });
  });

  describe('custom mapFrame', () => {
    it('listens for declared sse.events and fans one frame out to multiple events', async () => {
      const mapFrame = vi.fn((frame: { type: string; data: string; lastEventId: string }) => {
        if (frame.type !== 'docker') {
          return null;
        }
        const payload = JSON.parse(frame.data);
        return [
          { event: 'doc_update', payload: { doctype: 'Container', name: payload.name } },
          { event: 'list_update', payload: { doctype: 'Container', name: payload.name } },
        ];
      });
      const realtime = createSSE({ events: ['docker', 'audit'], mapFrame });
      const onDocUpdate = vi.fn();
      const onListUpdate = vi.fn();
      await realtime.on('doc_update', onDocUpdate);
      await realtime.on('list_update', onListUpdate);
      await realtime.connect();
      FakeEventSource.last().open();

      // Named listeners exist even though no handler carries these names.
      expect(FakeEventSource.last().listenerCount('docker')).toBe(1);
      expect(FakeEventSource.last().listenerCount('audit')).toBe(1);

      FakeEventSource.last().frame('docker', '{"name":"web-1"}', 'seq-42');
      expect(mapFrame).toHaveBeenCalledWith({
        type: 'docker',
        data: '{"name":"web-1"}',
        lastEventId: 'seq-42',
      });
      expect(onDocUpdate).toHaveBeenCalledOnce();
      expect(onDocUpdate).toHaveBeenCalledWith({ doctype: 'Container', name: 'web-1' });
      expect(onListUpdate).toHaveBeenCalledOnce();
      expect(onListUpdate).toHaveBeenCalledWith({ doctype: 'Container', name: 'web-1' });
    });

    it('drops frames when mapFrame returns null', async () => {
      const realtime = createSSE({
        events: ['audit'],
        mapFrame: () => null,
      });
      const onAnything = vi.fn();
      await realtime.on('doc_update', onAnything);
      await realtime.on('audit', onAnything);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('audit', '{"actor":"admin"}');
      FakeEventSource.last().frame('message', '{"sequence":1}');
      expect(onAnything).not.toHaveBeenCalled();
    });

    it('routes unnamed message frames through mapFrame too', async () => {
      const realtime = createSSE({
        mapFrame: (frame) => [{ event: 'operational', payload: frame.data }],
      });
      const onOperational = vi.fn();
      await realtime.on('operational', onOperational);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('message', 'raw-data');
      expect(onOperational).toHaveBeenCalledWith('raw-data');
    });
  });

  describe('health lifecycle', () => {
    it('error marks unhealthy and delivers a disconnect event, without closing the stream', async () => {
      const realtime = createSSE();
      const onDisconnect = vi.fn();
      await realtime.on('disconnect', onDisconnect);
      await realtime.connect();
      FakeEventSource.last().open();
      expect(realtime.isHealthy()).toBe(true);

      FakeEventSource.last().fail();
      expect(realtime.isHealthy()).toBe(false);
      expect(onDisconnect).toHaveBeenCalledWith({ reason: 'sse-error' });
      // EventSource auto-reconnects on its own — the module must not fight it.
      expect(FakeEventSource.last().closed).toBe(false);
      expect(FakeEventSource.instances).toHaveLength(1);

      // Native auto-reconnect succeeding fires open again on the SAME instance.
      FakeEventSource.last().open();
      expect(realtime.isHealthy()).toBe(true);
    });

    it('a server frame classified `event: error` is data, not a connection error', async () => {
      const realtime = createSSE();
      const onError = vi.fn();
      await realtime.on('error', onError);
      await realtime.connect();
      FakeEventSource.last().open();

      FakeEventSource.last().frame('error', '{"code":"tenant.quota","message":"exceeded"}');
      expect(onError).toHaveBeenCalledWith({ code: 'tenant.quota', message: 'exceeded' });
      // Still healthy — this was a frame delivery, not a transport failure.
      expect(realtime.isHealthy()).toBe(true);
    });

    it('disconnect() closes the stream and clears handlers; next connect() reopens fresh', async () => {
      const realtime = createSSE();
      const onDocker = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.connect();
      FakeEventSource.last().open();
      const firstInstance = FakeEventSource.last();

      realtime.disconnect();
      expect(firstInstance.closed).toBe(true);
      expect(realtime.isHealthy()).toBe(false);
      expect(realtime.getEventSource()).toBeUndefined();
      // Listeners were detached — a late frame on the dead stream reaches nothing.
      firstInstance.frame('docker', '{"code":"late"}');
      expect(onDocker).not.toHaveBeenCalled();

      await realtime.connect();
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(FakeEventSource.last()).not.toBe(firstInstance);
    });

    it('handlers registered before connect are attached once the stream opens after a teardown', async () => {
      const realtime = createSSE();
      const onDocker = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.connect();
      FakeEventSource.last().open();
      expect(FakeEventSource.last().listenerCount('docker')).toBe(1);
    });
  });

  describe('rooms (client-side bookkeeping)', () => {
    it('records rooms, connects the stream, and never emits a subscription', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      try {
        const realtime = createSSE();
        const subscription = realtime.subscribeDoc('Task', 'TASK-001');
        await vi.waitFor(() => {
          expect(FakeEventSource.instances).toHaveLength(1);
        });
        FakeEventSource.last().open();
        await subscription;

        await realtime.subscribeList('Task', { status: 'Open' });

        expect(realtime.getDocRooms()).toEqual([{ doctype: 'Task', name: 'TASK-001' }]);
        expect(realtime.getListRooms()).toEqual([{ doctype: 'Task', filters: { status: 'Open' } }]);
        // No socket exists and nothing was emitted anywhere.
        expect(io).not.toHaveBeenCalled();
        expect(realtime.getSocket()).toBeUndefined();

        // The client-side-only notice logs exactly once across both joins.
        const notices = debugSpy.mock.calls.filter((call) => String(call[0]).includes('client-side only'));
        expect(notices).toHaveLength(1);
      } finally {
        debugSpy.mockRestore();
      }
    });

    it('tears the stream down when the last room is released (idle teardown parity)', async () => {
      const realtime = createSSE();
      const onDisconnect = vi.fn();
      await realtime.on('disconnect', onDisconnect);
      const subscription = realtime.subscribeDoc('Task', 'TASK-001');
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });
      FakeEventSource.last().open();
      await subscription;

      realtime.unsubscribeDoc('Task', 'TASK-001');
      expect(FakeEventSource.last().closed).toBe(true);
      expect(realtime.getEventSource()).toBeUndefined();
      expect(realtime.getDocRooms()).toEqual([]);
      expect(onDisconnect).toHaveBeenCalledWith({ reason: 'idle-teardown' });
    });

    it('emit() is a silent no-op (one-way transport)', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      try {
        const realtime = createSSE();
        await realtime.connect();
        FakeEventSource.last().open();
        expect(() => {
          realtime.emit('doc_subscribe', { doctype: 'Task' });
        }).not.toThrow();
        expect(io).not.toHaveBeenCalled();
        expect(mockSocket.emit).not.toHaveBeenCalled();
      } finally {
        debugSpy.mockRestore();
      }
    });
  });

  describe('updateAuth', () => {
    it('recreates the EventSource with re-resolved query params', async () => {
      let token = 'tok-1';
      const realtime = createSSE({ queryParams: { token: () => token } });
      const onDocker = vi.fn();
      await realtime.on('docker', onDocker);
      await realtime.connect();
      const firstInstance = FakeEventSource.last();
      firstInstance.open();
      expect(firstInstance.url).toContain('token=tok-1');

      token = 'tok-2';
      await realtime.updateAuth({});

      expect(FakeEventSource.instances).toHaveLength(2);
      expect(firstInstance.closed).toBe(true);
      expect(FakeEventSource.last().url).toContain('token=tok-2');

      // Handlers survive the rotation and re-attach to the fresh stream.
      FakeEventSource.last().open();
      FakeEventSource.last().frame('docker', '{"code":"post-rotation"}');
      expect(onDocker).toHaveBeenCalledWith({ code: 'post-rotation' });
    });

    it('stays idle when no stream and no rooms exist', async () => {
      const realtime = createSSE();
      await realtime.updateAuth({ useToken: true, token: 'rotated' });
      expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('reconnects for recorded rooms with the fresh stream URL', async () => {
      let token = 'tok-1';
      const realtime = createSSE({ queryParams: { token: () => token } });
      const subscription = realtime.subscribeList('Task');
      await vi.waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });
      FakeEventSource.last().open();
      await subscription;

      token = 'tok-2';
      await realtime.updateAuth({});

      expect(FakeEventSource.instances).toHaveLength(2);
      expect(FakeEventSource.last().url).toContain('token=tok-2');
      expect(realtime.getListRooms()).toEqual([{ doctype: 'Task', filters: undefined }]);
    });
  });

  describe('socketio default path untouched', () => {
    it('constructs a socket (never an EventSource) when transport is omitted', async () => {
      const realtime = new RealtimeModule({
        baseURL: 'http://localhost:3000',
        // sse config present but transport absent — must be ignored entirely.
        sse: { path: '/api/method/shc.events.stream', EventSource: FakeEventSource },
      });
      created.push(realtime);

      await realtime.subscribeList('Task');

      expect(io).toHaveBeenCalledOnce();
      expect(FakeEventSource.instances).toHaveLength(0);
      expect(mockSocket.emit).toHaveBeenCalledWith('doctype_subscribe', 'Task');
    });
  });
});
