import { renderWithProviders } from '@repo/test-utils';
import { Input as TamaguiInput } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { FieldLayout } from './FieldLayout';
import { RequiredMarkingContext } from './required-marking';
import type { RequiredMarkingContextValue } from './required-marking';

const REQUIRED_MODE: RequiredMarkingContextValue = { mode: 'required' };
const OPTIONAL_MODE: RequiredMarkingContextValue = { mode: 'optional' };

const labelText = (container: HTMLElement): string => {
  const label = container.querySelector('label');
  return label?.textContent ?? '';
};

describe('FieldLayout required marking', () => {
  it('defaults to asterisk for required standalone fields', () => {
    const { container } = renderWithProviders(
      <FieldLayout
        id="a"
        label="Name"
        required>
        <TamaguiInput id="a" />
      </FieldLayout>,
    );
    expect(labelText(container)).toBe('Name *');
  });

  it('marks minority required via context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={REQUIRED_MODE}>
        <FieldLayout
          id="a"
          label="Code"
          required>
          <TamaguiInput id="a" />
        </FieldLayout>
      </RequiredMarkingContext.Provider>,
    );
    expect(labelText(container)).toBe('Code (required)');
  });

  it('marks minority optional via context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={OPTIONAL_MODE}>
        <FieldLayout
          id="a"
          label="Notes"
          required={false}>
          <TamaguiInput id="a" />
        </FieldLayout>
      </RequiredMarkingContext.Provider>,
    );
    expect(labelText(container)).toBe('Notes (optional)');
  });

  it('prop requiredMarking overrides context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={OPTIONAL_MODE}>
        <FieldLayout
          id="a"
          label="Name"
          required
          requiredMarking="asterisk">
          <TamaguiInput id="a" />
        </FieldLayout>
      </RequiredMarkingContext.Provider>,
    );
    expect(labelText(container)).toBe('Name *');
  });
});

describe('FieldLayout disabled labels', () => {
  it('keeps label opacity at 1 when disabled', () => {
    const { container } = renderWithProviders(
      <FieldLayout
        id="d"
        label="Account"
        helperText="Locked"
        disabled>
        <TamaguiInput
          id="d"
          disabled
        />
      </FieldLayout>,
    );
    const label = container.querySelector<HTMLElement>('label');
    expect(label).toBeTruthy();
    expect(label?.textContent).toBe('Account');
    // Contract: FieldLayout forces opacity=1 on wrapper + label (never inherits control dimming).
    const inlineOpacity = label?.style.opacity ?? '';
    const labelOpacity = inlineOpacity === '' && label !== null ? getComputedStyle(label).opacity : inlineOpacity;
    expect(Number(labelOpacity === '' ? '1' : labelOpacity)).toBe(1);
  });
});
