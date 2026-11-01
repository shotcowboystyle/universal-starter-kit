/**
 * MentionInputField contract specs. The registry hands `value` and `onChange`
 * straight to this adapter (MentionAdapter in fieldRegistry). The failure
 * mode of a thin adapter is dropping those two, so a saved comment never
 * paints and a typed comment never emits (LC-14). Pin the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { MentionInputField } from '.';
import type { MentionValue } from '.';

// oxlint-disable-next-line vitest/require-top-level-describe -- cleanup applies to every suite in this file
afterEach(cleanup);

const mentions = [{ trigger: '@', data: [{ id: 'u1', display: 'Ada' }] }];

const seeded: MentionValue = { text: 'hello ada', mentions: [] };

const textarea = (container: HTMLElement) => container.querySelector('textarea');

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

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
    // The prop type also carries the DOM ChangeEventHandler; accepting both keeps the mock assignable.
    const onChange = vi.fn<(value: MentionValue | ChangeEvent<HTMLDivElement>) => void>();
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'typed' }));
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ text: 'typed', mentions: expect.any(Array) });
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
  it("resolves 'Mention' to MentionInputField and hands value through", () => {
    const Component = getFieldComponent('Mention')!;
    expect(Component).toBeTruthy();
    // SAFETY: the registry registers Mention as a plain function component, so calling it returns its rendered element
    const render = Component as (props: FieldRenderProps) => React.ReactElement<{ value: string; label: string }>;
    const element = render(propsFor({ value: 'hello ada', label: 'Comment' }));
    expect(element.type).toBe(MentionInputField);
    expect(element.props.value).toBe('hello ada');
    expect(element.props.label).toBe('Comment');
  });
});
