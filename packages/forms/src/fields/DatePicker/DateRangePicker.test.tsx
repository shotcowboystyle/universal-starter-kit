import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { getFieldHeight } from '../../shared/utils';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('@tamagui/lucide-icons-2', () => ({
  Calendar: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
}));

async function loadDateRangePicker() {
  return (await import('./DateRangePicker')).DateRangePicker;
}

function getEnabledDayButtons(root: ParentNode): HTMLButtonElement[] {
  const allButtons = Array.from(root.querySelectorAll('button, [role="button"]')) as HTMLButtonElement[];
  return allButtons.filter((btn) => {
    const text = btn.textContent?.trim() ?? '';
    const isDay = /^\d{1,2}$/.test(text);
    const disabled =
      btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('data-disabled');
    return isDay && !disabled;
  });
}

describe('DateRangePicker', () => {
  it('handles disabled state', async () => {
    const DateRangePicker = await loadDateRangePicker();
    const result = renderWithProviders(
      <DateRangePicker label="Range" name="range" placeholder="Pick a range" disabled />,
    );

    const input = result.container.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.getAttribute('aria-disabled')).toBe('true');

    const clickable = result.container.querySelector("input,button,[role='button']");
    if (clickable) {
      // BOTH halves of a real click: FloatingPanel's opener is
      // `useClick(..., { event: "mousedown" })` and a disabled trigger is
      // pointerEvents-none, so `click` alone measures nothing (SB-M-614).
      fireEvent.mouseDown(clickable);
      fireEvent.click(clickable);
    }
    expect(result.findTextElement('Select a month')).toBeUndefined();
    expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeNull();
  });

  // SB-KS-04: the trigger carried no id, so the label pointed at nothing and
  // the control had no accessible name at all.
  it('the trigger carries the field id the sibling label resolves to', async () => {
    const DateRangePicker = await loadDateRangePicker();
    const result = renderWithProviders(<DateRangePicker label="Range" name="range" />);
    const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]') as HTMLElement;
    const label = result.container.querySelector('label') as HTMLLabelElement;
    expect(trigger?.id).toBeTruthy();
    expect(label.htmlFor).toBe(trigger.id);
    expect(trigger.getAttribute('aria-labelledby')).toBe(`${trigger.id}-label`);
  });

  it('selects a start and end date', async () => {
    const DateRangePicker = await loadDateRangePicker();
    const result = renderWithProviders(<DateRangePicker label="Range" name="range" placeholder="Pick a range" />);

    const trigger = result.container.querySelector("input,button,[role='button']");
    expect(trigger).toBeTruthy();

    await act(async () => {
      if (trigger) {
        fireEvent.click(trigger);
      }
    });

    await waitFor(() => {
      expect(getEnabledDayButtons(document.body).length).toBeGreaterThan(1);
    });

    const dayButtons = getEnabledDayButtons(document.body);
    await act(async () => {
      fireEvent.click(dayButtons[0]);
    });

    const input = result.container.querySelector('input');
    await waitFor(() => {
      expect(input?.value ?? '').toContain('end date');
    });

    await act(async () => {
      fireEvent.click(dayButtons[1]);
    });

    await waitFor(() => {
      expect(input?.value ?? '').not.toContain('end date');
      expect(input?.value ?? '').toContain('–');
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The form branch displays from `rangeStart`/`rangeEnd`, which only user
    // picks and the standalone `value` prop used to update — a field value
    // applied AFTER first paint (create-mode engine seeding, setFieldValue)
    // never rendered. Adopting a programmatic value must not emit onChange
    // (a seeded value is not a user edit).
    it('form-integrated: a field value set after mount displays, without onChange', async () => {
      const DateRangePicker = await loadDateRangePicker();
      const onChange = vi.fn();
      type Range = { start: Date; end: Date } | null;
      let formApi: { setFieldValue: (name: 'range', value: Range) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { range: null as Range } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <DateRangePicker label="Range" name="range" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const getInput = () => result.container.querySelector('input');
      expect(getInput()?.value ?? '').toBe('');

      await act(async () => {
        formApi?.setFieldValue('range', {
          start: new Date(2026, 2, 5),
          end: new Date(2026, 2, 12),
        });
      });
      await waitFor(() => {
        expect(getInput()?.value).toBe('Mar 5, 2026 – Mar 12, 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('form-integrated: clearing the field value programmatically clears the display', async () => {
      const DateRangePicker = await loadDateRangePicker();
      const onChange = vi.fn();
      type Range = { start: Date; end: Date } | null;
      let formApi: { setFieldValue: (name: 'range', value: Range) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({
          defaultValues: {
            range: { start: new Date(2026, 2, 5), end: new Date(2026, 2, 12) } as Range,
          },
        });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <DateRangePicker label="Range" name="range" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const getInput = () => result.container.querySelector('input');
      await waitFor(() => {
        expect(getInput()?.value).toBe('Mar 5, 2026 – Mar 12, 2026');
      });

      await act(async () => {
        formApi?.setFieldValue('range', null);
      });
      await waitFor(() => {
        expect(getInput()?.value ?? '').toBe('');
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('design law', () => {
    it('renders a skeleton at the control recipe height', async () => {
      const DateRangePicker = await loadDateRangePicker();
      const result = renderWithProviders(<DateRangePicker label="Loading" name="l" skeleton />);
      expect(result.container.querySelector('input')).toBeNull();
      const skeleton = result.container.querySelector('[data-daterange-skeleton]') as HTMLElement;
      expect(skeleton).toBeTruthy();
      expect(skeletonHeight(skeleton)).toBe(getFieldHeight('$4'));
    });

    it('rings the outer trigger box, never the inner field', async () => {
      const DateRangePicker = await loadDateRangePicker();
      const result = renderWithProviders(<DateRangePicker label="Range" name="range" />);
      const input = result.container.querySelector('input');
      expect(input?.className).toMatch(/mp-input-area/);
      const box = result.container.querySelector('.mp-composite-ring');
      expect(box).toBeTruthy();
      expect(box?.contains(input)).toBe(true);
    });

    it('paints range stripes with semantic fill, not a named motion', async () => {
      const DateRangePicker = await loadDateRangePicker();
      const result = renderWithProviders(
        <DateRangePicker label="Range" value={{ start: new Date(2026, 2, 5), end: new Date(2026, 2, 12) }} />,
      );
      const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]');
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.mouseDown(trigger);
          fireEvent.click(trigger);
        }
      });
      await waitFor(() => {
        expect(document.querySelector('[data-range-stripe]')).toBeTruthy();
      });
      const stripe = document.querySelector('[data-range-stripe]') as HTMLElement;
      expect(stripe.getAttribute('data-range-stripe')).toMatch(/in-range|range-start|range-end/);
      expect(stripe.getAttribute('transition')).not.toBe('quick');
    });
  });
});

function skeletonHeight(el: HTMLElement): number {
  const attr = el.getAttribute('height');
  if (attr && /^\d+(\.\d+)?$/.test(attr)) {
    return Number(attr);
  }
  if (el.style.height.endsWith('px')) {
    return Number.parseFloat(el.style.height);
  }
  return Number.parseFloat(getComputedStyle(el).height) || 0;
}
