import { renderWithProviders } from '@repo/test-utils';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';

import { Accordion } from './Accordion';
import { Collapsible } from './Collapsible';

vi.mock('@repo/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform')>()),
  isWeb: false,
}));

it('the native prop branch omits HTML button intent and retains compound refs', () => {
  const root = createRef<any>();
  const trigger = createRef<any>();
  const result = renderWithProviders(
    <>
      <Collapsible ref={root}>
        <Collapsible.Trigger ref={trigger} type="submit">
          Disclosure
        </Collapsible.Trigger>
        <Collapsible.Content>Contents</Collapsible.Content>
      </Collapsible>
      <Accordion>
        <Accordion.Item value="one">
          <Accordion.Trigger type="submit">Section</Accordion.Trigger>
          <Accordion.Content>Section contents</Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </>,
  );
  expect(root.current).toBeTruthy();
  expect(trigger.current).toBe(result.getByRole('button', { name: 'Disclosure' }));
  expect(trigger.current.getAttribute('type')).toBeNull();
  expect(result.getByRole('button', { name: 'Section' }).getAttribute('type')).toBeNull();
});
