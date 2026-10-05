import { renderWithProviders } from '@repo/test-utils';
import { Input as TamaguiInput } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { FieldLayout } from './fieldLayout';
import { RequiredMarkingContext } from './requiredMarking';

function labelText(container: HTMLElement): string {
  const label = container.querySelector('label');
  return label?.textContent ?? '';
}

describe('FieldLayout required marking', () => {
  it('defaults to asterisk for required standalone fields', () => {
    const { container } = renderWithProviders(
      <FieldLayout id="a" label="Name" required>
        <TamaguiInput id="a" />
      </FieldLayout>,
    );
    expect(labelText(container)).toBe('Name *');
  });

  it('marks minority required via context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={{ mode: 'required' }}>
        <FieldLayout id="a" label="Code" required>
          <TamaguiInput id="a" />
        </FieldLayout>
      </RequiredMarkingContext.Provider>,
    );
    expect(labelText(container)).toBe('Code (required)');
  });

  it('marks minority optional via context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={{ mode: 'optional' }}>
        <FieldLayout id="a" label="Notes" required={false}>
          <TamaguiInput id="a" />
        </FieldLayout>
      </RequiredMarkingContext.Provider>,
    );
    expect(labelText(container)).toBe('Notes (optional)');
  });

  it('prop requiredMarking overrides context', () => {
    const { container } = renderWithProviders(
      <RequiredMarkingContext.Provider value={{ mode: 'optional' }}>
        <FieldLayout id="a" label="Name" required requiredMarking="asterisk">
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
      <FieldLayout id="d" label="Account" helperText="Locked" disabled>
        <TamaguiInput id="d" disabled />
      </FieldLayout>,
    );
    const label = container.querySelector('label') as HTMLElement | null;
    expect(label).toBeTruthy();
    expect(label?.textContent).toBe('Account');
    // Contract: FieldLayout forces opacity=1 on wrapper + label (never inherits control dimming).
    const labelOpacity = label?.style?.opacity || getComputedStyle(label!).opacity;
    expect(Number(labelOpacity || '1')).toBe(1);
  });
});
