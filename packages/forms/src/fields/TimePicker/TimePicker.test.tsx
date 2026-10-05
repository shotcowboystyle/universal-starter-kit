import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { to12Hour, to24Hour } from './parts';

import * as TimePickerModule from './index';
import { TimePicker } from './index';

vi.mock('@tamagui/lucide-icons-2', () => ({
  Clock: () => null,
  X: () => null,
}));

describe('TimePicker', () => {
  describe('time math', () => {
    it('converts 12 AM/PM without dropping noon or midnight', () => {
      expect(to24Hour(12, 'AM')).toBe(0);
      expect(to24Hour(12, 'PM')).toBe(12);
      expect(to24Hour(1, 'PM')).toBe(13);
      expect(to12Hour(0)).toEqual({ h: 12, period: 'AM' });
      expect(to12Hour(12)).toEqual({ h: 12, period: 'PM' });
      expect(to12Hour(14)).toEqual({ h: 2, period: 'PM' });
    });
  });

  describe('without form context', () => {
    it('renders with label and placeholder', () => {
      const result = renderWithProviders(<TimePicker label="Start time" name="time" placeholder="Pick time" />);
      expect(result.findTextElement('Start time')).toBeDefined();
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('placeholder')).toBe('Pick time');
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<TimePicker label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" helperText="24h format" />);
      expect(result.findTextElement('24h format')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<TimePicker label="Loading" name="l" skeleton />);
      expect(result.container.querySelector('input')).toBeNull();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<TimePicker label="Disabled" name="d" disabled />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-disabled')).toBe('true');
    });

    it('renders readOnly state with value', () => {
      const result = renderWithProviders(
        <TimePicker label="ReadOnly" name="r" readOnly value="14:30" timeFormat="24h" />,
      );
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-readonly')).toBe('true');
    });

    it('displays formatted value in 12h format', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" value="14:30" timeFormat="12h" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('value')).toContain('2:30');
    });

    it('does not invent a time for invalid values', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" value="25:99" timeFormat="12h" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('value')).toBe('');
      expect(result.findTextElement('Invalid time value')).toBeDefined();
    });

    it('keeps the ring on the outer box, not the inner field', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" value="14:30" timeFormat="12h" />);
      const input = result.container.querySelector('input');
      expect(input?.className).toContain('mp-input-area');
      const box = result.container.querySelector('.mp-composite-ring');
      expect(box).toBeTruthy();
      expect(box?.contains(input)).toBe(true);
    });

    it('opens iOS wheels and treats AM/PM as a third column', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <TimePicker label="Time" name="t" value="12:30" timeFormat="12h" onChange={onChange} />,
      );
      const trigger = result.container.querySelector("input,button,[role='button']");
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.mouseDown(trigger);
          fireEvent.click(trigger);
        }
      });
      await waitFor(() => {
        expect(document.querySelector('[data-testid="time-picker-wheels"]')).toBeTruthy();
      });
      expect(document.querySelector('[data-testid="time-picker-dial"]')).toBeNull();
      const wheels = document.querySelectorAll('[data-testid="wheel"]');
      expect(wheels.length).toBe(3);
      expect(document.querySelector('[aria-label="AM/PM"]')).toBeTruthy();
    });

    it('shows a clock glyph and placeholder when empty, and no clear', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" placeholder="Pick a time" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('placeholder')).toBe('Pick a time');
      expect(result.container.querySelector('[data-testid="time-picker-glyph"]')).toBeTruthy();
      expect(result.container.querySelector('[data-testid="time-picker-clear"]')).toBeNull();
    });

    it('shows clear only when a value is set', () => {
      const result = renderWithProviders(<TimePicker label="Time" name="t" value="14:30" timeFormat="24h" />);
      expect(result.container.querySelector('[data-testid="time-picker-clear"]')).toBeTruthy();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { time: '' } }} submitText="Submit">
          <TimePicker name="time" label="Meeting time" />
        </Form>,
      );
      expect(result.findTextElement('Meeting time')).toBeDefined();
    });
  });

  describe('named exports', () => {
    it('publishes TimePicker as a named export with no default', () => {
      expect(typeof TimePickerModule.TimePicker).toBe('function');
      expect('default' in TimePickerModule).toBe(false);
    });
  });

  describe('design-law', () => {
    async function openPanel(jsx: ReactElement) {
      const result = renderWithProviders(jsx);
      const trigger = result.container.querySelector("input,button,[role='button']");
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.mouseDown(trigger);
          fireEvent.click(trigger);
        }
      });
      await waitFor(() => {
        expect(document.querySelector('[data-testid="time-picker-panel"]')).toBeTruthy();
      });
      return result;
    }

    it('unselected period and pip labels stay on the 400/700 weight pair', async () => {
      await openPanel(<TimePicker label="Time" name="t" value="12:30" timeFormat="12h" onChange={vi.fn()} />);
      const panel = document.querySelector('[data-testid="time-picker-panel"]');
      expect(panel).toBeTruthy();
      const weights = new Set<string>();
      for (const node of panel!.querySelectorAll('*')) {
        const el = node as HTMLElement;
        if (el.style.fontWeight) {
          weights.add(el.style.fontWeight);
        }
        for (const cls of String(el.className ?? '').split(/\s+/)) {
          const match = cls.match(/(?:^|_)(?:fw|fow|fontWeight)-?(\d+)/i);
          if (match) {
            weights.add(match[1]);
          }
          if (cls.includes('500')) {
            weights.add('500-class');
          }
        }
      }
      expect(weights.has('500')).toBe(false);
      expect(weights.has('500-class')).toBe(false);
    });

    // The analog clock face, hub, hand and hour segments were replaced by the
    // looping wheel columns in 1d6f17ac9. Their radius and size-recipe specs
    // went with them; the wheels carry their own coverage in TimeWheels.spec.
  });
});
