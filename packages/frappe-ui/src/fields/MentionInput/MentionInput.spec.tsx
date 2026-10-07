/**
 * MentionInputField contract specs. The registry hands `value` and `onChange`
 * straight to this adapter (MentionAdapter in fieldRegistry). The failure
 * mode of a thin adapter is dropping those two, so a saved comment never
 * paints and a typed comment never emits (LC-14). Pin the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { MentionInputField } from '.';
import type { MentionValue } from '.';

afterEach(cleanup);

const mentions = [{ trigger: '@', data: [{ id: 'u1', display: 'Ada' }] }];

const seeded: MentionValue = { text: 'hello ada', mentions: [] };

const textarea = (container: HTMLElement) => container.querySelector('textarea');

describe('MentionInputField composes the forms MentionInput', () => {
  it('paints a controlled value onto the textarea', () => {
    const result = renderWithProviders(
      <MentionInputField
        label="Comment"
        mentions={mentions}
        value={seeded}
        onChange={() => {}}
      />,
    );
    expect(textarea(result.container)?.value).toBe('hello ada');
  });

  it('emits a MentionValue through canonical onChange', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <MentionInputField
        label="Comment"
        mentions={mentions}
        value={{ text: '', mentions: [] }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.change(textarea(result.container)!, {
        target: { value: 'typed' },
      });
    });
    expect(onChange).toHaveBeenCalledWith();
    const emitted = onChange.mock.calls.at(-1)?.[0] as MentionValue;
    expect(emitted.text).toBe('typed');
    expect(Array.isArray(emitted.mentions)).toBe(true);
  });

  it('forwards disabled onto the textarea', () => {
    const result = renderWithProviders(
      <MentionInputField
        label="Comment"
        mentions={mentions}
        value={seeded}
        disabled
        onChange={() => {}}
      />,
    );
    const el = textarea(result.container);
    expect(el?.disabled ?? el?.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('forwards readOnly onto the textarea', () => {
    const result = renderWithProviders(
      <MentionInputField
        label="Comment"
        mentions={mentions}
        value={seeded}
        readOnly
        onChange={() => {}}
      />,
    );
    const el = textarea(result.container);
    expect(el?.readOnly ?? el?.getAttribute('aria-readonly') === 'true').toBe(true);
  });

  it('shows the label and error', () => {
    const result = renderWithProviders(
      <MentionInputField
        label="Comment"
        mentions={mentions}
        value={seeded}
        error="too short"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Comment');
    expect(result.container.textContent).toContain('too short');
  });
});

describe('registry resolution (Mention fieldtype)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Mention' to MentionInputField and hands value through", () => {
    const Component = getFieldComponent('Mention')!;
    expect(Component).toBeTruthy();
    const element = (Component as Function)(propsFor({ value: 'hello ada', label: 'Comment' })) as React.ReactElement<
      Record<string, unknown>
    >;
    expect(element.type).toBe(MentionInputField);
    expect(element.props.value).toBe('hello ada');
    expect(element.props.label).toBe('Comment');
  });
});
