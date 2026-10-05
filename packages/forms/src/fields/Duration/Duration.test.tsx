import { renderWithProviders } from '@repo/test-utils';
import { sizeRecipeForToken } from '@repo/theme';
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';
import { getFieldHeight } from '../../shared/utils';

import {
  Duration,
  DURATION_PRESET_SIZE,
  durationSegmentWidth,
  normalizeSeconds,
  parseDurationText,
  secondsToParts,
} from './index';

function segmentValue(el: Element | null): string {
  return el?.getAttribute('value') ?? (el as HTMLInputElement | null)?.value ?? '';
}

function segmentWidthPx(el: Element | null): number {
  const input = el as HTMLElement | null;
  if (!input) {
    return 0;
  }
  const attr = input.getAttribute('width');
  if (attr && /^\d+(\.\d+)?$/.test(attr)) {
    return Number(attr);
  }
  const style = input.style.width;
  if (style.endsWith('px')) {
    return Number.parseFloat(style);
  }
  return Number.parseFloat(getComputedStyle(input).width) || 0;
}

describe('Duration', () => {
  describe('math', () => {
    it('clamps negative and non-finite values to zero', () => {
      expect(normalizeSeconds(-100)).toBe(0);
      expect(normalizeSeconds(Number.NaN)).toBe(0);
      expect(normalizeSeconds(1.9)).toBe(1);
    });

    it('folds days into hours when hideDays', () => {
      const parts = secondsToParts(100000, true);
      expect(parts.days).toBe(0);
      expect(parts.hours).toBe(27);
      expect(parts.minutes).toBe(46);
      expect(parts.seconds).toBe(40);
    });

    it('parses Frappe-style duration text', () => {
      expect(parseDurationText('1d 2h 3m 4s')).toBe(93784);
      expect(parseDurationText('01h 30m')).toBe(5400);
      expect(parseDurationText('1:30')).toBe(5400);
      expect(parseDurationText('-100')).toBe(0);
    });
  });

  describe('without form context', () => {
    it('renders with label and placeholder', () => {
      const result = renderWithProviders(<Duration label="Duration" name="dur" placeholder="Select duration" />);
      expect(result.findTextElement('Duration')).toBeDefined();
      const hours = result.container.querySelector('input[aria-label="Hours"]');
      expect(hours?.getAttribute('placeholder')).toBe('Select duration');
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Duration label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(<Duration label="Time" name="t" helperText="In seconds" />);
      expect(result.findTextElement('In seconds')).toBeDefined();
    });

    it('renders skeleton at the control recipe height', () => {
      const result = renderWithProviders(<Duration label="Loading" name="l" skeleton />);
      expect(result.container.querySelector('input')).toBeNull();
      const skeleton = result.container.querySelector('[data-duration-skeleton]') as HTMLElement;
      expect(skeleton).toBeTruthy();
      const expected = getFieldHeight('$4');
      const height = skeletonWidthOrHeight(skeleton, 'height');
      expect(height).toBe(expected);
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<Duration label="Disabled" name="d" disabled />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-disabled')).toBe('true');
      expect(input?.getAttribute('tabindex')).toBe('-1');
    });

    it('renders readOnly with formatted value and hides presets', () => {
      const result = renderWithProviders(<Duration label="ReadOnly" name="r" readOnly value={3661} />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-readonly')).toBe('true');
      expect(result.container.querySelector('[data-duration-presets]')).toBeNull();
    });

    it('supplies a default clock affordance', () => {
      const result = renderWithProviders(<Duration label="Clock" name="c" value={3600} />);
      expect(result.container.querySelector('svg')).toBeTruthy();
    });

    it('hides the clock when clockIcon is null', () => {
      const result = renderWithProviders(<Duration label="No clock" name="c" value={3600} clockIcon={null} />);
      expect(result.container.querySelector('svg')).toBeNull();
    });

    it('normalises a negative value in the hours segment', () => {
      const result = renderWithProviders(<Duration label="Neg" name="n" value={-100} />);
      const hours = result.container.querySelector('input[aria-label="Hours"]');
      expect(segmentValue(hours)).toBe('0');
    });

    it('shows hours above 23 when hideDays', () => {
      const result = renderWithProviders(<Duration label="Long" name="l" value={100000} />);
      const hours = result.container.querySelector('input[aria-label="Hours"]');
      expect(segmentValue(hours)).toBe('27');
    });

    it('shows a days segment when hideDays is false', () => {
      const result = renderWithProviders(<Duration label="Days" name="d" value={100000} hideDays={false} />);
      expect(result.container.querySelector('input[aria-label="Days"]')).toBeTruthy();
    });
  });

  describe('design law', () => {
    it('packs the clock and segments at the start of a stretched box', () => {
      const result = renderWithProviders(<Duration label="Wide" value={3600} />);
      const box = result.container.querySelector('[data-duration-box]') as HTMLElement;
      const row = result.container.querySelector('[data-duration-row]') as HTMLElement;
      expect(box).toBeTruthy();
      expect(row).toBeTruthy();
      expect(getComputedStyle(box).justifyContent).toMatch(/flex-start|start/);
      expect(getComputedStyle(row).justifyContent).toMatch(/flex-start|start/);
    });

    it('keeps segment inputs inside the box at size $3', () => {
      const result = renderWithProviders(<Duration label="S" size="$3" value={3600} />);
      const box = result.container.querySelector('[data-duration-box]') as HTMLElement;
      const hours = result.container.querySelector('input[aria-label="Hours"]') as HTMLElement;
      expect(box).toBeTruthy();
      expect(hours).toBeTruthy();
      const recipeHeight = sizeRecipeForToken('$3').height;
      expect(Number(hours.getAttribute('data-duration-input-height'))).toBe(recipeHeight);
      const attrHeight = (el: HTMLElement) => {
        const a = el.getAttribute('height');
        if (a && /^\d+(\.\d+)?$/.test(a)) {
          return Number(a);
        }
        const s = el.style.height;
        if (s && /^\d+(\.\d+)?(px)?$/.test(s)) {
          return Number.parseFloat(s);
        }
        return 0;
      };
      const inputH = attrHeight(hours);
      if (inputH > 0) {
        expect(inputH).toBeLessThanOrEqual(recipeHeight + 0.5);
      }
      const boxH = attrHeight(box);
      if (boxH > 0 && inputH > 0) {
        expect(inputH).toBeLessThanOrEqual(boxH + 0.5);
      }
    });

    it('pins six default preset chips at the $2 / 28px family', () => {
      expect(DURATION_PRESET_SIZE).toBe('$2');
      expect(sizeRecipeForToken(DURATION_PRESET_SIZE).height).toBe(28);
      const result = renderWithProviders(<Duration label="P" value={0} />);
      const chips = result.container.querySelectorAll('[data-duration-preset]');
      expect(chips).toHaveLength(6);
      for (const chip of chips) {
        const el = chip as HTMLElement;
        const height =
          parseFloat(getComputedStyle(el).height) || Number(el.getAttribute('height')) || parseFloat(el.style.height);
        if (Number.isFinite(height) && height > 0) {
          expect(height).toBe(sizeRecipeForToken(DURATION_PRESET_SIZE).height);
        }
      }
    });

    it('sizes segments from the size recipe', () => {
      const small = renderWithProviders(<Duration label="S" size="$2" value={0} />);
      const large = renderWithProviders(<Duration label="L" size="$6" value={0} />);
      const sMin = small.container.querySelector('input[aria-label="Min"]');
      const lMin = large.container.querySelector('input[aria-label="Min"]');
      expect(segmentWidthPx(sMin)).toBe(durationSegmentWidth('$2', 2));
      expect(segmentWidthPx(lMin)).toBe(durationSegmentWidth('$6', 2));
      expect(segmentWidthPx(sMin)).toBeLessThan(segmentWidthPx(lMin));
      const sHours = small.container.querySelector('input[aria-label="Hours"]');
      expect(segmentWidthPx(sHours)).toBe(durationSegmentWidth('$2', 3));
    });

    it('clock glyph follows the icon recipe, not a hardcoded 16', () => {
      const small = renderWithProviders(<Duration label="S" size="$2" value={3600} />);
      const large = renderWithProviders(<Duration label="L" size="$6" value={3600} />);
      const sSvg = small.container.querySelector('svg');
      const lSvg = large.container.querySelector('svg');
      const sSize = Number(sSvg?.getAttribute('width') ?? sSvg?.getAttribute('height'));
      const lSize = Number(lSvg?.getAttribute('width') ?? lSvg?.getAttribute('height'));
      expect(sSize).toBe(sizeRecipeForToken('$2').iconSize);
      expect(lSize).toBe(sizeRecipeForToken('$6').iconSize);
      expect(sSize).not.toBe(lSize);
    });

    it('rings the outer box, never the inner segments', () => {
      const result = renderWithProviders(<Duration label="Ring" value={3600} />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      const hours = result.container.querySelector('input[aria-label="Hours"]') as HTMLInputElement;
      expect(box).toBeTruthy();
      expect(box.className).toMatch(/mp-composite-ring/);
      expect(box.contains(hours)).toBe(true);
      expect(hours.className).toMatch(/mp-input-area/);
    });

    it('fires onChange with seconds from a preset', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Duration label="P" value={0} onChange={onChange} />);
      const chip = result.container.querySelector(
        "[data-duration-preset], [data-duration-presets] button, [data-duration-presets] [role='button']",
      );
      expect(chip).toBeTruthy();
      fireEvent.click(chip as HTMLElement);
      expect(onChange).toHaveBeenCalled();
      expect(typeof onChange.mock.calls[0]?.[0]).toBe('number');
    });

    it('arrow-up on hours commits via onChange', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Duration label="A" value={3600} onChange={onChange} />);
      const hours = result.container.querySelector('input[aria-label="Hours"]') as HTMLInputElement;
      fireEvent.keyDown(hours, { key: 'ArrowUp' });
      expect(onChange).toHaveBeenCalledWith(7200);
    });

    it('normalises overflow minutes on blur', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Duration label="O" value={0} onChange={onChange} />);
      const minutes = result.container.querySelector('input[aria-label="Min"]') as HTMLInputElement;
      act(() => {
        fireEvent.change(minutes, { target: { value: '90' } });
        fireEvent.blur(minutes);
      });
      expect(onChange).toHaveBeenCalledWith(5400);
    });

    it('pastes Frappe-style text into the whole value', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Duration label="Paste" value={0} onChange={onChange} />);
      const hours = result.container.querySelector('input[aria-label="Hours"]') as HTMLInputElement;
      fireEvent.paste(hours, {
        clipboardData: { getData: () => '1h 30m' },
      } as unknown as ClipboardEvent);
      expect(onChange).toHaveBeenCalledWith(5400);
    });

    it('hides presets in a table cell', () => {
      const result = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
          <Duration label="Cell" value={3600} />
        </TableCellContext.Provider>,
      );
      expect(result.container.querySelector('[data-duration-presets]')).toBeNull();
    });

    it('hides presets when the list is empty', () => {
      const result = renderWithProviders(<Duration label="None" value={0} presets={[]} />);
      expect(result.container.querySelector('[data-duration-presets]')).toBeNull();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { dur: 0 } }} submitText="Submit">
          <Duration name="dur" label="Duration" />
        </Form>,
      );
      expect(result.findTextElement('Duration')).toBeDefined();
    });
  });
});

function skeletonWidthOrHeight(el: HTMLElement, axis: 'height' | 'width'): number {
  const attr = el.getAttribute(axis);
  if (attr && /^\d+(\.\d+)?$/.test(attr)) {
    return Number(attr);
  }
  const style = axis === 'height' ? el.style.height : el.style.width;
  if (style.endsWith('px')) {
    return Number.parseFloat(style);
  }
  return Number.parseFloat(getComputedStyle(el)[axis]) || 0;
}
