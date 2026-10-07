// A host built with Frappe off (MPO-403): createApp mounts no FrappeProvider
// without FRAPPE_ENABLED, so a doctype's routed pages find no bench URL and no
// fixture corpus. They say the backend isn't configured instead of throwing
// and taking the route down, and they dial nothing.
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeForm } from './FrappeForm';
import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

interface Move {
  name: string;
  doctype: string;
  move_name?: string;
}

const doctype = 'Poke Move';
const route = '/moves';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  fetchSpy = vi.fn(async () => {
    throw new Error('a page with no bench dialled one');
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function expectNotConfigured() {
  expect(screen.getByTestId('frappe-not-configured')).toBeTruthy();
  expect(screen.getByText('Frappe is not configured')).toBeTruthy();
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe("a doctype's pages on a host with no Frappe backend", () => {
  it("the new page says the backend isn't configured", () => {
    renderWithProviders(
      <FrappeForm<Move>
        doctype={doctype}
        route={route}
      />,
    );
    expectNotConfigured();
    expect(screen.getByText(`${doctype} can't load without a Frappe bench URL.`)).toBeTruthy();
  });

  it("a record page says the backend isn't configured", () => {
    renderWithProviders(
      <FrappeForm<Move>
        doctype={doctype}
        name="a1b2c3"
      />,
    );
    expectNotConfigured();
  });

  it("the list page says the backend isn't configured", () => {
    renderWithProviders(
      <FrappeListView<Move>
        doctype={doctype}
        route={route}
      />,
    );
    expectNotConfigured();
  });

  it('a provider that resolved no bench URL reads the same', () => {
    renderWithProviders(
      <FrappeProvider realtime={false}>
        <FrappeForm<Move>
          doctype={doctype}
          route={route}
        />
      </FrappeProvider>,
    );
    expectNotConfigured();
  });
});
