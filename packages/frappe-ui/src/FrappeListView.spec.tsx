// FrappeListView toolbar refresh — LC-54 PRESS-FLOOR-CHANNEL (amendment
// 2026-08-13, "the grown box NEVER PAINTS"): the refresh affordance used to
// be a raw tamagui Button riding a grown transparent press target (negative
// outsets escaping the toolbar slot) whose default hover fill painted the
// whole escaped 44px floor. The fix migrates it to the house forms Button
// with `circular` — the painted box ITSELF is the 44×44 control, so feedback
// stays inside its own reserved layout slot (box-is-control mechanism).
// Same atom-based assertions as FrappeDashboard.spec.tsx (jsdom can't apply
// :hover; the positive control proving the detectors work lives there).
//
// DocType meta is served by a scoped fetch mock (same shape the stories
// use); documents come from InMemoryFixtureProvider.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrappeListView } from './FrappeListView';
import { FrappeProvider } from './FrappeProvider';

const MOCK_HOST = 'https://listview.spec.test';

const metaRaw = {
  name: 'QaTodo',
  module: 'QA',
  title_field: 'description',
  image_field: 'avatar',
  fields: [
    {
      fieldname: 'description',
      fieldtype: 'Data',
      label: 'Description',
      in_list_view: 1,
      required: 1,
    },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nCompleted',
      in_list_view: 1,
      in_standard_filter: 1,
    },
    {
      fieldname: 'avatar',
      fieldtype: 'Attach Image',
      label: 'Avatar',
      hidden: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const realFetch = globalThis.fetch;
beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (/^\/api\/resource\/DocType\/.+$/.test(url.pathname)) {
        return jsonResponse({ data: metaRaw });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(cleanup);

const fixtures = new InMemoryFixtureProvider({
  QaTodo: [
    {
      name: 'QATODO-001',
      doctype: 'QaTodo',
      description: 'Review document',
      status: 'Open',
      avatar: `data:image/svg+xml;utf8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#4a90d9"/></svg>',
      )}`,
    },
  ],
});

// Grown-box escape mechanism: any negative margin atom on the press floor.
const negativeMarginAtom = /_m[trbl]--\d/;
// Painted state feedback: any non-transparent hover/press background atom.
const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/;

const renderListView = (props: Partial<Parameters<typeof FrappeListView>[0]> = {}) =>
  renderWithProviders(
    <FrappeProvider
      baseURL={MOCK_HOST}
      fixtures={fixtures}>
      <FrappeListView
        doctype="QaTodo"
        {...props}
      />
    </FrappeProvider>,
  );

const refreshIn = async (container: HTMLElement) => {
  await waitFor(() => {
    expect(container.querySelector('[aria-label="Refresh"]')).not.toBeNull();
  });
  return container.querySelector('[aria-label="Refresh"]')!;
};

describe('FrappeListView refresh press floor (LC-54 amendment)', () => {
  it('the refresh floor is its own box — no grown-target negative outset', async () => {
    const { container } = renderListView();
    const refresh = await refreshIn(container);
    expect(refresh.getAttribute('role')).toBe('button');
    // House circular Button: the 44px floor is REAL layout (box-is-control);
    // the escape mechanism (negative margins pulling the grown box over the
    // adjacent Add button) must be gone.
    expect(refresh.className).not.toMatch(negativeMarginAtom);
    expect(refresh.className).toMatch(/_mih-44px/);
    expect(refresh.className).toMatch(/_miw-44px/);
  });

  it("hover feedback rides the button's own in-slot box (house channel)", async () => {
    const { container } = renderListView();
    const refresh = await refreshIn(container);
    // Paint on the OWN box is the sanctioned own-size mechanism — the
    // amendment bans paint on a box that escapes its slot (arm above).
    expect(refresh.className).toMatch(paintedStateAtom);
    expect(refresh.querySelector('svg')).not.toBeNull();
  });

  it('the migrated Add button still activates (house div[role=button])', async () => {
    const onAdd = vi.fn();
    const { container } = renderListView({ onAdd });
    await refreshIn(container);
    const add = [...container.querySelectorAll('[role="button"]')].find((node) =>
      node.textContent?.includes('Add QaTodo'),
    ) as HTMLElement;
    expect(add).not.toBeNull();
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

// Design-law 100% (theme-propagation-spec FrappeListView): avatar geometry
// rides nestedControl (R-PILL / size recipe), not a 40px literal; title and
// filter labels take body/label recipes (400/700), not 500/600 literals.
const midWeightAtom = /(?:^|\s)(?:_fw-|_fow-|_fontWeight-)(?:500|600)(?:\s|$)/;

describe('FrappeListView design-law (avatar + type)', () => {
  it('list-row avatars are nested and follow nestedControl, not a 40px literal', async () => {
    const { container } = renderListView();
    const avatar = await waitFor(() => {
      const node = container.querySelector('[data-avatar-px]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(avatar.dataset.avatarNested).toBe('true');
    expect(Number(avatar.dataset.avatarPx)).toBe(32);
    expect(Number(avatar.dataset.avatarPx)).not.toBe(40);
  });

  it('row title uses the body recipe weight, not 500', async () => {
    const { container } = renderListView();
    const title = await waitFor(() => {
      const node =
        container.querySelector('[data-list-slot="title"]') ??
        ([...container.querySelectorAll('*')].find(
          (el) => el.textContent === 'Review document' && el.children.length === 0,
        ) as HTMLElement | undefined) ??
        null;
      expect(node).not.toBeNull();
      return node!;
    });
    expect(title.textContent).toContain('Review document');
    expect(title.className).not.toMatch(midWeightAtom);
  });

  it('filter sidebar labels use the label recipe, not weight 600', async () => {
    const { container } = renderListView({ showFilterSidebar: true });
    const heading = await waitFor(() => {
      const node = [...container.querySelectorAll('*')].find(
        (el) => el.textContent === 'Filters' && el.children.length === 0,
      );
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(heading.className).not.toMatch(midWeightAtom);
  });
});
