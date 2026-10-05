import { renderWithProviders } from '@repo/test-utils';
import { expect, it, vi } from 'vitest';

import { Form } from '../Form';

import { ContextualSaveBar } from './index';

vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

it('reserves native layout space instead of mapping a sticky dock to absolute', () => {
  const view = renderWithProviders(
    <Form formOptions={{ defaultValues: { name: 'example' } }}>
      <ContextualSaveBar forceVisible />
    </Form>,
  );
  const bar = view.container.querySelector('[data-mp-contextual-savebar]')!;
  expect(getComputedStyle(bar).position).toBe('relative');
  expect(getComputedStyle(bar).bottom).not.toBe('0px');
});
