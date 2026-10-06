import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './safe-action';

interface CyclicNode {
  type: string;
  self?: CyclicNode;
}

interface FakeElement {
  $$typeof: symbol;
  props: { children?: FakeElement };
}

const { fireSpy } = vi.hoisted(() => ({ fireSpy: vi.fn<(...args: unknown[]) => void>() }));
vi.mock(import('storybook/actions'), () => ({
  action: () => fireSpy,
}));

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
    const node: CyclicNode = { type: 'div' };
    node.self = node;
    const handler = action('onPress');
    handler(node);
    const [[sanitized]] = fireSpy.mock.calls;
    expect(sanitized).toStrictEqual({ type: 'div', self: '[Circular]' });
    expect(() => JSON.stringify(sanitized)).not.toThrow();
  });

  it('summarizes React elements (the DebugLayout/FrappeListView pageerror shape)', () => {
    // Synthetic press events reference the element graph: element → props →
    // children → … fiber → stateNode closes the circle.
    const element: FakeElement = { $$typeof: Symbol.for('react.element'), props: {} };
    element.props.children = element;
    const event = { type: 'press', target: element, nativeEvent: { pageX: 1 } };
    const handler = action('onPress');
    handler(event);
    const [[sanitized]] = fireSpy.mock.calls;
    expect(sanitized).toStrictEqual({
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
    const [[sanitized]] = fireSpy.mock.calls;
    expect(JSON.stringify(sanitized)).toContain('[Object]');
    expect(JSON.stringify(sanitized)).not.toContain('bottom');
  });

  it('tolerates throwing getters', () => {
    const trap = Object.defineProperty({}, 'boom', {
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
