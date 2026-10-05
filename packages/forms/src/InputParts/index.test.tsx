import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import {
  Input,
  boxRingMode,
  boxRingOffset,
  inputPartsRingCss,
  mapInputModeToKeyboardType,
  mapKeyboardTypeToInputMode,
} from './index';

describe('Input.Meta reserved message slot', () => {
  it('renders helper text when there is no error', () => {
    const { getByText, queryByRole } = renderWithProviders(<Input.Meta helperText="We never share this" />);
    expect(getByText('We never share this')).toBeTruthy();
    expect(queryByRole('alert')).toBeNull();
  });

  it('renders the error when there is no helper', () => {
    const { getByRole } = renderWithProviders(<Input.Meta displayError="Enter a value" />);
    expect(getByRole('alert').textContent).toBe('Enter a value');
  });

  it('error replaces helper — one slot, never siblings', () => {
    const { getByRole, queryByText } = renderWithProviders(
      <Input.Meta helperText="We never share this" displayError="Enter a value" />,
    );
    expect(getByRole('alert').textContent).toBe('Enter a value');
    expect(queryByText('We never share this')).toBeNull();
  });

  it('boolean error carries no message, so the helper keeps the slot', () => {
    const { getByText, queryByRole } = renderWithProviders(
      <Input.Meta helperText="We never share this" displayError />,
    );
    expect(getByText('We never share this')).toBeTruthy();
    expect(queryByRole('alert')).toBeNull();
  });

  it('renders nothing when neither helper nor error is provided', () => {
    const { container } = renderWithProviders(<Input.Meta />);
    expect(container.textContent).toBe('');
  });
});

describe('RING-ANATOMY — Box ring, Area never outlines, inset iff clip', () => {
  it('pairs overflow:hidden with inset and overflow:visible with outset', () => {
    expect(boxRingMode('hidden', true)).toBe('inset');
    expect(boxRingMode('visible', true)).toBe('outset');
    expect(boxRingMode('hidden', false)).toBeUndefined();
    expect(boxRingOffset('inset')).toBe(-2);
    expect(boxRingOffset('outset')).toBe(2);
  });

  it('stylesheet kills Area outline and insets the Box ring when clipped', () => {
    expect(inputPartsRingCss).toContain('[data-mp-input-box][data-mp-ring="inset"]');
    expect(inputPartsRingCss).toContain('outline-offset: -2px');
    expect(inputPartsRingCss).toContain('outline-offset: 2px');
    expect(inputPartsRingCss).toContain('[data-mp-input-area]');
    expect(inputPartsRingCss).toContain('outline: none !important');
    expect(inputPartsRingCss).not.toContain('[data-mp-input-box]:has(:focus-visible)');
  });

  it('Box carries data-mp-input-box + inset ring; Area carries data-mp-input-area', () => {
    const { container } = renderWithProviders(
      <Input>
        <Input.Box>
          <Input.Area placeholder="Search" />
        </Input.Box>
      </Input>,
    );
    const box = container.querySelector('[data-mp-input-box]');
    expect(box).toBeTruthy();
    expect(box?.getAttribute('data-mp-ring')).toBe('inset');
    expect(container.querySelector('[data-mp-input-area]')).toBeTruthy();
    expect(document.getElementById('mp-input-parts-ring-anatomy')?.textContent).toContain('outline: none !important');
  });

  it('consumer focusVisibleStyle cannot restore an Area outline', () => {
    const { container } = renderWithProviders(
      <Input>
        <Input.Box>
          <Input.Area
            placeholder="q"
            focusVisibleStyle={
              {
                outlineWidth: 4,
                outlineStyle: 'solid',
                outlineColor: 'red',
              } as never
            }
          />
        </Input.Box>
      </Input>,
    );
    const area = container.querySelector('[data-mp-input-area]');
    expect(area).toBeTruthy();
    const cs = area ? getComputedStyle(area) : null;
    const width = cs ? parseFloat(cs.outlineWidth) || 0 : 0;
    const style = cs?.outlineStyle ?? '';
    expect(style === 'none' || width === 0).toBe(true);
  });
});

describe('TEXT-INSET — Area chromeless, keyboard map', () => {
  it('zeros padding only on input[data-mp-input-area], not textarea', () => {
    expect(inputPartsRingCss).toContain('input[data-mp-input-area]');
    expect(inputPartsRingCss).toMatch(/input\[data-mp-input-area\]\s*\{\s*padding:\s*0/);
    expect(inputPartsRingCss).not.toMatch(/textarea\[data-mp-input-area\][^{]*\{[^}]*padding:\s*0/);
  });

  it('maps phone-pad↔tel, number-pad↔numeric, decimal-pad↔decimal, email-address↔email', () => {
    expect(mapKeyboardTypeToInputMode('phone-pad')).toBe('tel');
    expect(mapKeyboardTypeToInputMode('number-pad')).toBe('numeric');
    expect(mapKeyboardTypeToInputMode('decimal-pad')).toBe('decimal');
    expect(mapKeyboardTypeToInputMode('email-address')).toBe('email');
    expect(mapInputModeToKeyboardType('tel')).toBe('phone-pad');
    expect(mapInputModeToKeyboardType('numeric')).toBe('number-pad');
    expect(mapInputModeToKeyboardType('decimal')).toBe('decimal-pad');
    expect(mapInputModeToKeyboardType('email')).toBe('email-address');
  });

  it('forwards keyboardType onto the area and sets the mapped inputMode', () => {
    const { container } = renderWithProviders(
      <Input>
        <Input.Box>
          <Input.Area keyboardType="phone-pad" textContentType="telephoneNumber" />
        </Input.Box>
      </Input>,
    );
    const area = container.querySelector('[data-mp-input-area]') as HTMLInputElement;
    expect(area).toBeTruthy();
    expect(area.inputMode || area.getAttribute('inputmode')).toBe('tel');
    expect(area.getAttribute('autocomplete') === 'tel' || area.autocomplete === 'tel').toBe(true);
  });
});
