import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { TimeWheels } from './TimeColumn';

describe('TimeWheels', () => {
  it('renders hour, minute, and AM/PM columns in 12h mode', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <TimeWheels
        hour24={13}
        minute={5}
        second={0}
        timeFormat="12h"
        minuteStep={1}
        showSeconds={false}
        onChange={onChange}
      />,
    );
    expect(result.container.querySelector('[data-testid="time-picker-wheels"]')).toBeTruthy();
    expect(result.container.querySelectorAll('[data-testid="wheel"]').length).toBe(3);
    expect(result.container.querySelector('[aria-label="AM/PM"]')).toBeTruthy();
  });

  it('omits AM/PM in 24h mode', () => {
    renderWithProviders(
      <TimeWheels
        hour24={23}
        minute={59}
        second={0}
        timeFormat="24h"
        minuteStep={1}
        showSeconds={false}
        onChange={() => {}}
      />,
    );
    expect(document.querySelectorAll('[data-testid="wheel"]').length).toBe(2);
    expect(document.querySelector('[aria-label="AM/PM"]')).toBeNull();
  });
});
