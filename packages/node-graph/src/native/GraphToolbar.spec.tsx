import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphToolbar } from './GraphToolbar';

afterEach(cleanup);

describe('GraphToolbar actions', () => {
  it('keeps every action independently reachable with the selected mode exposed', () => {
    const onModeChange = vi.fn();
    const callbacks = { onFitView: vi.fn(), onTidy: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
    renderWithProviders(
      <GraphToolbar
        mode="pan"
        onModeChange={onModeChange}
        {...callbacks}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pan mode' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Select mode' }));
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('select');
    for (const [name, callback] of [
      ['Fit the graph to the view', callbacks.onFitView],
      ['Tidy the graph', callbacks.onTidy],
      ['Undo', callbacks.onUndo],
      ['Redo', callbacks.onRedo],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(callback).toHaveBeenCalledOnce();
    }
  });

  it('keeps busy/history-disabled actions inert and optional actions absent', () => {
    const onModeChange = vi.fn();
    const onTidy = vi.fn();
    const onUndo = vi.fn();
    renderWithProviders(
      <GraphToolbar
        mode="select"
        onModeChange={onModeChange}
        onTidy={onTidy}
        onUndo={onUndo}
        busy
        canUndo={false}
      />,
    );
    for (const name of ['Tidy the graph', 'Undo']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    }
    expect(onTidy).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit the graph to the view' })).toBeNull();
  });
});
