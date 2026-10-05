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

async function loadMultiDatePicker() {
  return (await import('./MultiDatePicker')).MultiDatePicker;
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

describe('MultiDatePicker', () => {
  it('handles disabled state', async () => {
    const MultiDatePicker = await loadMultiDatePicker();
    const result = renderWithProviders(
      <MultiDatePicker label="Dates" name="dates" placeholder="Pick dates" disabled />,
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
    const MultiDatePicker = await loadMultiDatePicker();
    const result = renderWithProviders(<MultiDatePicker label="Dates" name="dates" />);
    const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]') as HTMLElement;
    const label = result.container.querySelector('label') as HTMLLabelElement;
    expect(trigger?.id).toBeTruthy();
    expect(label.htmlFor).toBe(trigger.id);
    expect(trigger.getAttribute('aria-labelledby')).toBe(`${trigger.id}-label`);
  });

  it('selects dates and clears selection', async () => {
    const MultiDatePicker = await loadMultiDatePicker();
    const result = renderWithProviders(<MultiDatePicker label="Dates" name="dates" placeholder="Pick dates" />);

    const trigger = result.container.querySelector("input,button,[role='button']");
    expect(trigger).toBeTruthy();

    await act(async () => {
      if (trigger) {
        fireEvent.click(trigger);
      }
    });

    await waitFor(() => {
      expect(getEnabledDayButtons(document.body).length).toBeGreaterThan(0);
    });

    const dayButtons = getEnabledDayButtons(document.body);
    await act(async () => {
      fireEvent.click(dayButtons[0]);
      fireEvent.click(dayButtons[1]);
    });

    const input = result.container.querySelector('input');
    await waitFor(() => {
      expect(input?.value).toContain(',');
    });

    const iconButton = result.container.querySelector('button');
    if (iconButton) {
      await act(async () => {
        fireEvent.click(iconButton);
      });
    }

    await waitFor(() => {
      expect(input?.value ?? '').toBe('');
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The form branch displays from `selectedDates`, which only user picks
    // and the standalone `value` prop used to update — a field value applied
    // AFTER first paint (create-mode engine seeding, setFieldValue) never
    // rendered. Adopting a programmatic value must not emit onChange.
    it('form-integrated: a field value set after mount displays, without onChange', async () => {
      const MultiDatePicker = await loadMultiDatePicker();
      const onChange = vi.fn();
      let formApi: { setFieldValue: (name: 'dates', value: Date[]) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { dates: [] as Date[] } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <MultiDatePicker label="Dates" name="dates" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const getInput = () => result.container.querySelector('input');
      expect(getInput()?.value ?? '').toBe('');

      await act(async () => {
        formApi?.setFieldValue('dates', [new Date(2026, 2, 5)]);
      });
      await waitFor(() => {
        expect(getInput()?.value).toBe('Mar 5, 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('design law', () => {
    it('renders a skeleton at the control recipe height', async () => {
      const MultiDatePicker = await loadMultiDatePicker();
      const result = renderWithProviders(<MultiDatePicker label="Loading" name="l" skeleton />);
      expect(result.container.querySelector('input')).toBeNull();
      const skeleton = result.container.querySelector('[data-multidate-skeleton]') as HTMLElement;
      expect(skeleton).toBeTruthy();
      expect(skeletonHeight(skeleton)).toBe(getFieldHeight('$4'));
    });

    it('rings the outer trigger box, never the inner field', async () => {
      const MultiDatePicker = await loadMultiDatePicker();
      const result = renderWithProviders(<MultiDatePicker label="Dates" name="dates" />);
      const input = result.container.querySelector('input');
      expect(input?.className).toMatch(/mp-input-area/);
      const box = result.container.querySelector('.mp-composite-ring');
      expect(box).toBeTruthy();
      expect(box?.contains(input)).toBe(true);
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
