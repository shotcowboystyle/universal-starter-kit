import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { MentionInput, parseMentionValue } from './index';

/** Web panels portal out to the page, so panel text is read from the page. */
function findInPage(text: string): Element | undefined {
  try {
    return within(document.body).queryByText(text, { exact: false }) ?? undefined;
  } catch {
    return Array.from(document.body.querySelectorAll('*')).find((el) => el.textContent?.includes(text));
  }
}

const userMentions = {
  trigger: '@',
  data: [
    {
      id: 'u1',
      display: 'Alice',
      avatar: 'https://example.com/a.png',
      description: 'Engineer',
    },
    {
      id: 'u2',
      display: 'Bob',
      description: 'Designer',
    },
  ],
};

function typeTrigger(textArea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textArea, {
    target: { value, selectionStart: value.length, selectionEnd: value.length },
  });
  Object.defineProperty(textArea, 'selectionStart', { value: value.length, configurable: true });
  Object.defineProperty(textArea, 'selectionEnd', { value: value.length, configurable: true });
  fireEvent.select(textArea);
}

describe('parseMentionValue', () => {
  it('normalizes strings, objects, and empty input into MentionValue', () => {
    expect(parseMentionValue('hello')).toEqual({ text: 'hello', mentions: [] });
    expect(parseMentionValue({ text: 'hi', mentions: [{ id: 'u1' }] })).toEqual({
      text: 'hi',
      mentions: [{ id: 'u1' }],
    });
    expect(parseMentionValue(undefined)).toEqual({ text: '', mentions: [] });
    expect(parseMentionValue(null)).toEqual({ text: '', mentions: [] });
  });
});

describe('MentionInput', () => {
  it('should render with label and placeholder', () => {
    const result = renderWithProviders(
      <MentionInput
        label="Comment"
        name="comment"
        placeholder="Type @ to mention"
        mentions={[
          {
            trigger: '@',
            data: [{ id: 'u1', display: 'Alice' }],
          },
        ]}
      />,
    );

    expect(findInPage('Comment')).toBeDefined();
    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea?.getAttribute('placeholder')).toBe('Type @ to mention');
  });

  it('fires canonical onChange(MentionValue) and the deprecated onTextChange alias once per change', () => {
    const onChange = vi.fn();
    const onTextChange = vi.fn();
    const result = renderWithProviders(
      <MentionInput
        label="Comment"
        name="comment"
        mentions={[
          {
            trigger: '@',
            data: [{ id: 'u1', display: 'Alice' }],
          },
        ]}
        onChange={onChange}
        onTextChange={onTextChange}
      />,
    );

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (textArea) {
      fireEvent.change(textArea, { target: { value: 'hello' } });
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ text: 'hello', mentions: [] });
    expect(onTextChange).toHaveBeenCalledTimes(1);
    expect(onTextChange).toHaveBeenCalledWith('hello');
  });

  it('renders defaultValue text on first paint', () => {
    const result = renderWithProviders(
      <MentionInput label="Comment" mentions={[userMentions]} defaultValue="hello there" />,
    );
    expect(result.baseElement.querySelector('textarea')?.value).toBe('hello there');
  });

  it('does not emit onChange on mount (seed is not a user edit)', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MentionInput label="Comment" mentions={[userMentions]} defaultValue="hello" onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('skeleton keeps the FieldLayout label and omits the textarea', () => {
    const result = renderWithProviders(
      <MentionInput label="Comment" name="comment" mentions={[userMentions]} skeleton />,
    );
    expect(findInPage('Comment')).toBeDefined();
    expect(result.baseElement.querySelector('textarea')).toBeNull();
  });

  it('standalone controlled: a value arriving after mount displays without onChange', async () => {
    const onChange = vi.fn();
    const onTextChange = vi.fn();
    const result = renderWithProviders(
      <MentionInput label="Comment" mentions={[userMentions]} value="" onChange={onChange} />,
    );
    expect(result.baseElement.querySelector('textarea')?.value).toBe('');

    result.rerender(
      <MentionInput
        label="Comment"
        mentions={[userMentions]}
        value="seeded"
        onChange={onChange}
        onTextChange={onTextChange}
      />,
    );
    await waitFor(() => {
      expect(result.baseElement.querySelector('textarea')?.value).toBe('seeded');
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onTextChange).not.toHaveBeenCalled();
  });

  it('form-integrated: a field value set after mount displays without onChange', async () => {
    const onChange = vi.fn();
    let formApi: { setFieldValue: (name: 'comment', value: { text: string; mentions: unknown[] }) => void } | undefined;
    const TestComponent = () => {
      const form = useForm({ defaultValues: { comment: { text: '', mentions: [] } } });
      formApi = form as unknown as typeof formApi;
      return (
        <Form form={form}>
          <MentionInput label="Comment" name="comment" mentions={[userMentions]} onChange={onChange} />
        </Form>
      );
    };
    const result = renderWithProviders(<TestComponent />);

    await act(async () => {
      formApi?.setFieldValue('comment', { text: 'seeded later', mentions: [] });
    });
    await waitFor(() => {
      expect(result.baseElement.querySelector('textarea')?.value).toBe('seeded later');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens a flush listbox with media-slot rows when typing @', () => {
    const result = renderWithProviders(<MentionInput label="Comment" name="comment" mentions={[userMentions]} />);

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@');

    const listbox = result.baseElement.ownerDocument.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    if (!listbox) {
      return;
    }

    const style = getComputedStyle(listbox);
    expect(style.paddingTop).toBe('0px');
    expect(style.paddingRight).toBe('0px');
    expect(style.paddingBottom).toBe('0px');
    expect(style.paddingLeft).toBe('0px');

    const options = listbox.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    // Both rows reserve a media slot when any item has an avatar (Bob has none).
    expect(findInPage('Alice')).toBeDefined();
    expect(findInPage('Bob')).toBeDefined();
    expect(findInPage('Engineer')).toBeDefined();
    expect(findInPage('Designer')).toBeDefined();
    expect(findInPage('B')).toBeDefined(); // Bob initials fallback
    // Overlay rows paint nestedControl (32px at medium), not a raw 28.
    const slots = listbox.querySelectorAll('[data-media-slot]');
    expect(slots.length).toBe(2);
    expect(slots[0]?.getAttribute('data-media-slot')).toBe('32');
  });

  // Same contract every other FloatingPanel consumer honors, reached by a
  // different route: this panel's open switch is derived from the text, not
  // from a press, so gating the trigger alone would not have covered it.
  it.each([
    ['disabled', { disabled: true }],
    ['readOnly', { readOnly: true }],
  ])('opens no suggestion listbox when %s', (_name, props) => {
    const result = renderWithProviders(
      <MentionInput label="Comment" name="comment" mentions={[userMentions]} {...props} />,
    );

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@');

    expect(result.baseElement.ownerDocument.querySelector('[role="listbox"]')).toBeNull();
  });

  it('does not reserve a media slot for all-text triggers (hashtags)', () => {
    const result = renderWithProviders(
      <MentionInput
        label="Post"
        name="post"
        mentions={[
          {
            trigger: '#',
            data: [
              { id: 'react', display: 'react' },
              { id: 'ts', display: 'typescript' },
            ],
          },
        ]}
      />,
    );

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '#');

    const listbox = result.baseElement.ownerDocument.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    expect(findInPage('react')).toBeDefined();
    // No avatar / initials glyphs for an all-text list.
    expect(result.baseElement.ownerDocument.querySelector('img')).toBeNull();
    expect(listbox?.querySelector('[data-media-slot]')).toBeNull();
  });

  it('keeps the listbox open with an empty state when the query matches nothing', () => {
    const result = renderWithProviders(<MentionInput label="Comment" name="comment" mentions={[userMentions]} />);

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@zzzz');

    const listbox = result.baseElement.ownerDocument.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    expect(listbox?.querySelectorAll('[role="option"]').length).toBe(0);
    expect(findInPage('No matches')).toBeDefined();
  });

  it('inserts the active suggestion on Tab (GitHub/Slack)', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <MentionInput label="Comment" name="comment" mentions={[userMentions]} onChange={onChange} />,
    );

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@');

    fireEvent.keyDown(textArea, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '@Alice ',
        mentions: [
          expect.objectContaining({
            type: '@',
            id: 'u1',
            display: 'Alice',
          }),
        ],
      }),
    );
  });

  it('paints the keyboard ring on the active option after typing, not after hover', () => {
    const result = renderWithProviders(<MentionInput label="Comment" name="comment" mentions={[userMentions]} />);

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@');

    const options = result.baseElement.ownerDocument.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    expect(options[0]?.getAttribute('data-keyboard-ring')).toBe('true');
    expect(options[1]?.getAttribute('data-keyboard-ring')).toBeNull();

    fireEvent.mouseEnter(options[1]);
    expect(options[0]?.getAttribute('data-keyboard-ring')).toBeNull();
    expect(options[1]?.getAttribute('data-keyboard-ring')).toBeNull();
  });

  it('deletes the whole mention token on Backspace at its end (Slack)', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <MentionInput label="Comment" name="comment" mentions={[userMentions]} onChange={onChange} />,
    );

    const textArea = result.baseElement.querySelector('textarea');
    expect(textArea).toBeTruthy();
    if (!textArea) {
      return;
    }

    typeTrigger(textArea, '@');
    fireEvent.keyDown(textArea, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '@Alice ',
        mentions: [expect.objectContaining({ id: 'u1', display: 'Alice' })],
      }),
    );

    const mentionEnd = '@Alice'.length;
    Object.defineProperty(textArea, 'selectionStart', { value: mentionEnd, configurable: true });
    Object.defineProperty(textArea, 'selectionEnd', { value: mentionEnd, configurable: true });
    fireEvent.select(textArea);
    fireEvent.keyDown(textArea, { key: 'Backspace' });

    expect(onChange).toHaveBeenLastCalledWith({ text: ' ', mentions: [] });
  });
});
