import { beforeEach, describe, expect, it, vi } from 'vitest';

const fireSpy = vi.fn();
vi.mock('storybook/actions', () => ({
  action: vi.fn(() => fireSpy),
}));

import { action } from './safeAction';

describe('safeAction (cycle-safe Storybook action)', () => {
  beforeEach(() => {
    fireSpy.mockClear();
  });

  it('passes primitives and plain objects through', () => {
    const handler = action('onChange');
    handler('hello', 42, { a: 1, b: [true, null] });
    expect(fireSpy).toHaveBeenCalledWith('hello', 42, { a: 1, b: [true, null] });
  });

  it('breaks circular references instead of letting the channel stringify throw', () => {
    const node: Record<string, unknown> = { type: 'div' };
    node.self = node;
    const handler = action('onPress');
    handler(node);
    const [sanitized] = fireSpy.mock.calls[0];
    expect(sanitized).toEqual({ type: 'div', self: '[Circular]' });
    expect(() => JSON.stringify(sanitized)).not.toThrow();
  });

  it('summarizes React elements (the DebugLayout/FrappeListView pageerror shape)', () => {
    // Synthetic press events reference the element graph: element → props →
    // children → … fiber → stateNode closes the circle.
    const element: Record<string, unknown> = { $$typeof: Symbol.for('react.element'), props: {} };
    (element.props as Record<string, unknown>).children = element;
    const event = { type: 'press', target: element, nativeEvent: { pageX: 1 } };
    const handler = action('onPress');
    handler(event);
    const [sanitized] = fireSpy.mock.calls[0];
    expect(sanitized).toEqual({
      type: 'press',
      target: '[ReactElement]',
      nativeEvent: { pageX: 1 },
    });
    expect(() => JSON.stringify(sanitized)).not.toThrow();
  });

  it('summarizes fibers and functions', () => {
    const fiber = { stateNode: {}, pendingProps: {} };
    const handler = action('onThing');
    handler(fiber, function namedFn() {});
    expect(fireSpy).toHaveBeenCalledWith('[Fiber]', '[Function namedFn]');
  });

  it('allows the same object in sibling branches (DAG, not a cycle)', () => {
    const shared = { id: 1 };
    const handler = action('onEmit');
    handler({ a: shared, b: shared });
    expect(fireSpy).toHaveBeenCalledWith({ a: { id: 1 }, b: { id: 1 } });
  });

  it('caps depth so huge payloads stay readable', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 'bottom' } } } } } } };
    const handler = action('onDeep');
    handler(deep);
    const [sanitized] = fireSpy.mock.calls[0];
    expect(JSON.stringify(sanitized)).toContain('[Object]');
    expect(JSON.stringify(sanitized)).not.toContain('bottom');
  });

  it('tolerates throwing getters', () => {
    const trap: Record<string, unknown> = {};
    Object.defineProperty(trap, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    const handler = action('onTrap');
    handler(trap);
    expect(fireSpy).toHaveBeenCalledWith({ boom: '[Unreadable]' });
  });
});
