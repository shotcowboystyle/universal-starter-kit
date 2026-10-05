/**
 * PresetSwatches spec. The row is a radiogroup of swatches.
 * ColorPicker owns the popover; this file only covers the exported grid.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PresetSwatches } from './parts';

vi.mock('@tamagui/lucide-icons-2', () => ({
  Palette: () => null,
  X: () => null,
  Check: () => null,
  Pipette: () => null,
}));

const BRAND = ['#1E40AF', '#3B82F6', '#BFDBFE'];

describe('PresetSwatches', () => {
  it('renders a radiogroup of radios for each preset', () => {
    renderWithProviders(<PresetSwatches presetColors={BRAND} selectedColor="#3B82F6" onSelect={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Color presets' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(BRAND.length);
  });

  it('marks the selected hex aria-checked', () => {
    renderWithProviders(<PresetSwatches presetColors={BRAND} selectedColor="#3B82F6" onSelect={vi.fn()} />);
    const selected = screen.getByRole('radio', { name: 'Color #3B82F6' });
    expect(selected.getAttribute('aria-checked')).toBe('true');
    const other = screen.getByRole('radio', { name: 'Color #1E40AF' });
    expect(other.getAttribute('aria-checked')).toBe('false');
  });

  it('onSelect fires with the hex of the pressed swatch', () => {
    const onSelect = vi.fn();
    renderWithProviders(<PresetSwatches presetColors={BRAND} selectedColor={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Color #1E40AF' }));
    expect(onSelect).toHaveBeenCalledWith('#1E40AF');
  });

  it('empty presetColors renders nothing', () => {
    const { container } = renderWithProviders(
      <PresetSwatches presetColors={[]} selectedColor={null} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('null entry is the no-color radio and reports null', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <PresetSwatches
        presetColors={[{ name: 'None', value: null }, '#3B82F6']}
        selectedColor={null}
        onSelect={onSelect}
      />,
    );
    const none = screen.getByRole('radio', { name: 'None' });
    expect(none.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Color #3B82F6' }));
    expect(onSelect).toHaveBeenCalledWith('#3B82F6');
  });
});
