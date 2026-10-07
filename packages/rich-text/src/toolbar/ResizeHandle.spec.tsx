import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';

import { ResizeHandle } from './ResizeHandle';

/** The handle drives a real element, so give it one with a measurable height. */
function makeContainer(height: number) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  document.body.append(el);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = el;
  return { el, ref };
}

function grab(container: HTMLElement) {
  const handle = container.querySelector('[role="separator"]');
  if (!handle) {
    throw new Error('resize handle did not render');
  }
  return handle;
}

function drag(handle: Element, fromY: number, toY: number) {
  fireEvent.mouseDown(handle, { clientY: fromY });
  document.dispatchEvent(new MouseEvent('mousemove', { clientY: toY }));
}

describe(ResizeHandle, () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('exposes itself to assistive tech as a labelled separator', () => {
    const { ref } = makeContainer(300);
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);
    const handle = grab(container);
    expect(handle.getAttribute('aria-label')).toBe('Resize editor');
  });

  it('adds the drag delta to the height the container had when the drag started', () => {
    const { el, ref } = makeContainer(300);
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);

    drag(grab(container), 100, 180);
    expect(el.style.height).toBe('380px');
  });

  it('shrinks on an upward drag, and floors at minHeight (default 150)', () => {
    const { el, ref } = makeContainer(300);
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);
    const handle = grab(container);

    drag(handle, 100, 60);
    expect(el.style.height).toBe('260px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientY: -500 }));
    expect(el.style.height).toBe('150px');
  });

  it('honours an explicit minHeight over the default', () => {
    const { el, ref } = makeContainer(300);
    const { container } = renderWithProviders(
      <ResizeHandle
        containerRef={ref}
        minHeight={220}
      />,
    );

    drag(grab(container), 100, -900);
    expect(el.style.height).toBe('220px');
  });

  it('caps at maxHeight when one is given, and does not cap when it is omitted', () => {
    const capped = makeContainer(300);
    const { container: cappedDom } = renderWithProviders(
      <ResizeHandle
        containerRef={capped.ref}
        maxHeight={400}
      />,
    );
    drag(grab(cappedDom), 100, 900);
    expect(capped.el.style.height).toBe('400px');

    document.dispatchEvent(new MouseEvent('mouseup'));

    const free = makeContainer(300);
    const { container: freeDom } = renderWithProviders(<ResizeHandle containerRef={free.ref} />);
    drag(grab(freeDom), 100, 900);
    expect(free.el.style.height).toBe('1100px');
  });

  it('locks the page cursor and selection for the length of the drag only', () => {
    const { ref } = makeContainer(300);
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);

    fireEvent.mouseDown(grab(container), { clientY: 100 });
    expect(document.body.style.cursor).toBe('ns-resize');
    expect(document.body.style.userSelect).toBe('none');

    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('stops resizing after mouseup, so a later pointer move is inert', () => {
    const { el, ref } = makeContainer(300);
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);

    drag(grab(container), 100, 200);
    expect(el.style.height).toBe('400px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 900 }));
    expect(el.style.height).toBe('400px');
  });

  it('is a no-op while the container ref is still empty', () => {
    const ref = createRef<HTMLElement>();
    const { container } = renderWithProviders(<ResizeHandle containerRef={ref} />);

    fireEvent.mouseDown(grab(container), { clientY: 100 });
    expect(document.body.style.cursor).toBe('');
  });
});
