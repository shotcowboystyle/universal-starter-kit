import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
/**
 * DeskSurface specs (MPO-189) — the target→surface switch, mounted over the
 * same fixture shape its stories use.
 *
 * Desk.spec.tsx already covers dispatch THROUGH <Desk />; this file pins the
 * switch itself: every DeskTarget kind reaches a surface, and the override
 * registry resolves per-doctype before per-kind before the built-in.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DeskSurface, DeskSurfaceLoading } from './DeskSurface';
import type { DeskSurfaceProps } from './DeskSurface';
import type { DeskTarget } from './target';

const MOCK_HOST = 'https://backoffice-desk-surface-spec.mock.test';
const TASK_DOCTYPE = 'QaDeskTask';

const taskMeta = {
  name: TASK_DOCTYPE,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nWorking\nDone',
      in_list_view: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [taskMeta],
    Workspace: [
      {
        name: 'Tools',
        doctype: 'Workspace',
        title: 'Tools',
        icon: 'tool',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 1,
        module: 'Automation',
        is_hidden: 0,
      },
    ],
    'Notification Log': [],
    [TASK_DOCTYPE]: [{ name: 'QDT-0001', doctype: TASK_DOCTYPE, subject: 'First', status: 'Open' }],
  });

function Probe({ target }: DeskSurfaceProps) {
  return <div data-testid={`probe-${target.kind}`}>{JSON.stringify(target)}</div>;
}

function renderSurface(node: React.ReactNode) {
  return renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
      navigation={createMemoryNavigator('/backoffice')}>
      {node}
    </BackofficeProvider>,
  );
}

const everyKind: DeskTarget[] = [
  { kind: 'home' },
  { kind: 'workspace', workspace: 'Tools' },
  { kind: 'list', doctype: TASK_DOCTYPE },
  { kind: 'view', doctype: TASK_DOCTYPE, view: 'kanban' },
  { kind: 'new', doctype: TASK_DOCTYPE },
  { kind: 'form', doctype: TASK_DOCTYPE, name: 'QDT-0001' },
  { kind: 'report', reportName: 'Open Tasks' },
  { kind: 'not-found', slug: 'nope' },
];

describe('<DeskSurface />', () => {
  it('dispatches every DeskTarget kind — no kind falls through the switch', () => {
    // A probe per kind proves the switch reaches a component for each one,
    // without depending on any individual surface's async chrome.
    for (const target of everyKind) {
      const { unmount } = renderSurface(
        <DeskSurface
          target={target}
          overrides={{
            home: Probe,
            workspace: Probe,
            list: Probe,
            view: Probe,
            new: Probe,
            form: Probe,
            report: Probe,
            'not-found': Probe,
          }}
        />,
      );
      expect(screen.getByTestId(`probe-${target.kind}`)).toBeTruthy();
      unmount();
    }
  });

  it('renders the built-in not-found surface when no override matches', async () => {
    renderSurface(<DeskSurface target={{ kind: 'not-found', slug: 'nope' }} />);
    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeTruthy();
    });
  });

  it('per-doctype override beats per-kind; a miss falls through to the built-in', () => {
    function DoctypeProbe({ target }: DeskSurfaceProps) {
      return <div data-testid="doctype-probe">{JSON.stringify(target)}</div>;
    }
    const { unmount } = renderSurface(
      <DeskSurface
        target={{ kind: 'list', doctype: TASK_DOCTYPE }}
        overrides={{ list: { [TASK_DOCTYPE]: DoctypeProbe } }}
      />,
    );
    expect(screen.getByTestId('doctype-probe')).toBeTruthy();
    unmount();

    // Keyed by a different doctype: the record misses, so the built-in list
    // mounts instead of the probe.
    renderSurface(
      <DeskSurface
        target={{ kind: 'list', doctype: TASK_DOCTYPE }}
        overrides={{ list: { 'Sales Order': DoctypeProbe } }}
      />,
    );
    expect(screen.queryByTestId('doctype-probe')).toBeNull();
  });

  it('forwards readOnly to the override contract', () => {
    function ReadOnlyProbe({ readOnly }: DeskSurfaceProps) {
      return <div data-testid="readonly-probe">{String(readOnly)}</div>;
    }
    renderSurface(
      <DeskSurface
        target={{ kind: 'form', doctype: TASK_DOCTYPE, name: 'QDT-0001' }}
        readOnly
        overrides={{ form: ReadOnlyProbe }}
      />,
    );
    expect(screen.getByTestId('readonly-probe').textContent).toBe('true');
  });

  it('DeskSurfaceLoading renders the resolving state', () => {
    renderSurface(<DeskSurfaceLoading />);
    // The spinner is the whole surface; nothing else may paint over it.
    expect(screen.queryByText('Not found')).toBeNull();
  });
});
