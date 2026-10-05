import { renderWithProviders } from '@repo/test-utils';
/** @vitest-environment jsdom */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Accordion } from './Accordion';
import { Collapsible } from './tamagui';

function Disclosure({ kind, type }: { kind: 'accordion' | 'collapsible'; type?: 'button' | 'submit' }) {
  const props = type ? { type } : {};
  return kind === 'accordion' ? (
    <Accordion type="single" collapsible>
      <Accordion.Item value="preview">
        <Accordion.Trigger {...props}>Preview</Accordion.Trigger>
        <Accordion.Content>Contents</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  ) : (
    <Collapsible>
      <Collapsible.Trigger {...props}>Preview</Collapsible.Trigger>
      <Collapsible.Content>Contents</Collapsible.Content>
    </Collapsible>
  );
}

describe('disclosure triggers inside forms', () => {
  for (const kind of ['accordion', 'collapsible'] as const) {
    it(`${kind} opens without submitting by default`, () => {
      const submit = vi.fn((event) => event.preventDefault());
      const result = renderWithProviders(
        <form onSubmit={submit}>
          <Disclosure kind={kind} />
        </form>,
      );
      const trigger = result.getByRole('button', { name: 'Preview' });
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(submit).not.toHaveBeenCalled();
      expect(trigger.getAttribute('type')).toBe('button');
    });
    it(`${kind} preserves an explicit submit request`, () => {
      const submit = vi.fn((event) => event.preventDefault());
      const result = renderWithProviders(
        <form onSubmit={submit}>
          <Disclosure kind={kind} type="submit" />
        </form>,
      );
      fireEvent.click(result.getByRole('button', { name: 'Preview' }));
      expect(submit).toHaveBeenCalledTimes(1);
    });
  }
});
