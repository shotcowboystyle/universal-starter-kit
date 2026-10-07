/**
 * The picker shells hand FloatingPanel `contentPadding="none"`.
 * Each picker owns one compact inset, so the panel adding its own
 * `panelPadding` stacked a second pad around the widget.
 */

import { renderWithProviders } from '@repo/test-utils';
import React from 'react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FloatingPanel } from '../FloatingPanel';

import { ColorPicker } from './ColorPicker';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';

type ShellProps = ComponentProps<typeof FloatingPanel>;

const shellProps: ShellProps[] = [];

vi.mock(import('../FloatingPanel'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    FloatingPanel: (props: ShellProps) => {
      shellProps.push(props);
      return React.createElement('div', { 'data-testid': 'shell' }, props.trigger, props.children);
    },
  };
});

describe('picker shells do not pad around the widget', () => {
  beforeEach(() => {
    shellProps.length = 0;
  });

  it('ColorPicker passes contentPadding none and pads its own body', () => {
    const { container } = renderWithProviders(
      <ColorPicker
        name="c"
        label="Color"
      />,
    );
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
    expect(container.querySelector('[data-testid="color-picker-panel"]')).not.toBeNull();
  });

  it('TimePicker passes contentPadding none and pads its own panel', () => {
    const { container } = renderWithProviders(
      <TimePicker
        name="t"
        label="Time"
      />,
    );
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
    expect(container.querySelector('[data-testid="time-picker-panel"]')).not.toBeNull();
  });

  it('DatePicker passes contentPadding none', () => {
    renderWithProviders(
      <DatePicker
        name="d"
        label="Date"
      />,
    );
    expect(shellProps.at(-1)?.contentPadding).toBe('none');
  });
});
