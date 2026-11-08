/**
 * Notice spec (MPO-120). Stories live in Markdown/Callouts; this file covers
 * the theme → Alert intent map the Callouts variants render.
 */

import { renderWithProviders } from '@repo/test-utils';
import { Paragraph } from 'tamagui';
import { describe, expect, it } from 'vitest';

import { Notice } from './index';

describe(Notice, () => {
  it('yellow maps onto warning (assertive alert)', () => {
    const { container } = renderWithProviders(
      <Notice
        theme="yellow"
        title="Warning">
        Yellow warning notice.
      </Notice>,
    );
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain('Warning');
    expect(container.textContent).toContain('Yellow warning notice.');
  });

  it('blue maps onto info (polite status)', () => {
    const { container } = renderWithProviders(
      <Notice
        theme="blue"
        title="Info">
        Blue info notice.
      </Notice>,
    );
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Info');
  });

  it('green maps onto success (polite status)', () => {
    const { container } = renderWithProviders(
      <Notice
        theme="green"
        title="Success">
        Green success notice.
      </Notice>,
    );
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.textContent).toContain('Success');
  });

  it('red maps onto error (assertive alert)', () => {
    const { container } = renderWithProviders(
      <Notice
        theme="red"
        title="Error">
        Red error notice.
      </Notice>,
    );
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(container.textContent).toContain('Error');
    expect(container.textContent).toContain('Red error notice.');
  });

  it('empty children still mount a notice', () => {
    const { container } = renderWithProviders(<Notice theme="blue">{null}</Notice>);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('disableUnwrap keeps element children instead of flattening them', () => {
    const { container } = renderWithProviders(
      <Notice
        theme="green"
        disableUnwrap>
        <Paragraph>kept as an element</Paragraph>
      </Notice>,
    );
    expect(container.querySelector('p')?.textContent).toBe('kept as an element');
  });
});
