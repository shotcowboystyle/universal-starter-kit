/**
 * The picker shells hand FloatingPanel `contentPadding="none"`.
 * Each picker owns one compact inset, so the panel adding its own
 * `panelPadding` stacked a second pad around the widget.
 */

import { renderWithProviders } from '@repo/test-utils';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shellProps: Array<Record<string, unknown>> = [];

vi.mock('../FloatingPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../FloatingPanel')>();
  return {
    ...actual,
    FloatingPanel: (props: Record<string, unknown>) => {
      shellProps.push(props);
      return React.createElement(
        'div',
        { 'data-testid': 'shell' },
        props.trigger as React.ReactNode,
        props.children as React.ReactNode,
      );
    },
  };
});

import { ColorPicker } from './ColorPicker';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';

describe('picker shells do not pad around the widget', () => {
  beforeEach(() => {
    shellProps.length = 0;
  });

  it('ColorPicker passes contentPadding none and pads its own body', () => {
    const { container } = renderWithProviders(<ColorPicker name="c" label="Color" />);
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
    expect(container.querySelector('[data-testid="color-picker-panel"]')).not.toBeNull();
  });

  it('TimePicker passes contentPadding none and pads its own panel', () => {
    const { container } = renderWithProviders(<TimePicker name="t" label="Time" />);
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
    expect(container.querySelector('[data-testid="time-picker-panel"]')).not.toBeNull();
  });

  it('DatePicker passes contentPadding none', () => {
    renderWithProviders(<DatePicker name="d" label="Date" />);
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
  });
});
