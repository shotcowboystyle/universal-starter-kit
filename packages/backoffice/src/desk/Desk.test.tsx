/**
 * <Desk /> assembly specs (MPO-14):
 * - end-to-end render over a mocked (fixture) doctype, both chrome modes
 * - navigator-driven dispatch through the resolver + slug index
 * - surface override registry (GL-6): per-kind and per-doctype
 * - two Desks on one page: field-registry (GL-4) and scope (GL-5) isolation
 */
import { InMemoryFixtureProvider } from '@repo/frappe';
import { FrappeProvider, getFieldComponent, useFieldResolver, useFrappeConfig } from '@repo/frappe-ui';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { Desk } from './Desk';
import type { DeskSurfaceProps } from './DeskSurface';
import { useDeskScope } from './scope';
import type { DeskTarget } from './target';

const MOCK_HOST = 'https://desk-assembly.mock.test';

const makeFixtures = () =>
  new InMemoryFixtureProvider({
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
    DocType: [{ name: 'ToDo', doctype: 'DocType' }],
    'Notification Log': [],
  });

const frappe = () => ({ baseURL: MOCK_HOST, fixtures: makeFixtures() });

const SurfaceProbe = ({ target }: DeskSurfaceProps) => (
  <div data-testid={`probe-${target.kind}`}>{JSON.stringify(target)}</div>
);

const ListWithRowPress = () => {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  return (
    <button
      type="button"
      data-testid="open-doc"
      onClick={() => {
        navigator.navigate(paths.form('ToDo', 'T-0001'));
      }}>
      open
    </button>
  );
};

const DoctypeProbe = ({ target }: DeskSurfaceProps) => <div data-testid="doctype-probe">{JSON.stringify(target)}</div>;

const FieldProbe = ({ testId }: { testId: string }) => {
  const resolve = useFieldResolver();
  const Field = resolve('Data');
  if (!Field) {
    return null;
  }
  return (
    <div data-testid={testId}>
      {/* oxlint-disable-next-line react/static-components -- resolved from the per-Desk field registry, not created during render */}
      <Field
        value=""
        onChange={() => {}}
        label="probe"
      />
    </div>
  );
};

const CustomA = () => <div data-testid="custom-a">A</div>;
const CustomB = () => <div data-testid="custom-b">B</div>;
const probeA = () => <FieldProbe testId="desk-a-field" />;
const probeB = () => <FieldProbe testId="desk-b-field" />;

const ScopeProbe = ({ testId }: { testId: string }) => {
  const scope = useDeskScope();
  return <div data-testid={testId}>{JSON.stringify(scope)}</div>;
};

const ConnectionProbe = () => <div data-testid="probe-connection">{useFrappeConfig()?.baseURL}</div>;

describe('<Desk /> chrome and dispatch', () => {
  it('renders the full desk with no required props (DK-1)', async () => {
    renderWithProviders(<Desk frappe={frappe()} />);
    // Full chrome mounts...
    expect(screen.getByTestId('backoffice-shell')).toBeTruthy();
    expect(screen.getByTestId('backoffice-awesomebar')).toBeTruthy();
    // ...and home lands on the default workspace (fixture-backed redirect).
    await waitFor(() => {
      expect(screen.getAllByText('Tools').length).toBeGreaterThan(0);
    });
  });

  it("a doctype pin renders that doctype's surface in content chrome, host URL untouched", () => {
    const onTargetChange = vi.fn<(target: DeskTarget) => void>();
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="Sales Order"
        surfaces={{ list: SurfaceProbe }}
        onTargetChange={onTargetChange}
      />,
    );
    // content chrome: no banner, no rail
    expect(screen.queryByTestId('backoffice-shell')).toBeNull();
    // the pin dispatched the list surface for the proper-cased doctype
    expect(screen.getByTestId('probe-list').textContent).toContain('"Sales Order"');
    expect(onTargetChange).toHaveBeenCalledWith({ kind: 'list', doctype: 'Sales Order' });
  });

  it("doctype + name renders the form surface; chrome='full' overrides the pin default", () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="Sales Order"
        name="SO-0001"
        chrome="full"
        surfaces={{ form: SurfaceProbe }}
      />,
    );
    expect(screen.getByTestId('backoffice-shell')).toBeTruthy();
    const probe = screen.getByTestId('probe-form');
    expect(probe.textContent).toContain('"Sales Order"');
    expect(probe.textContent).toContain('"SO-0001"');
  });

  it('workspace and report pins dispatch their surfaces', () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        workspace="Accounting"
        surfaces={{ workspace: SurfaceProbe }}
      />,
    );
    expect(screen.getByTestId('probe-workspace').textContent).toContain('"Accounting"');

    renderWithProviders(
      <Desk
        frappe={frappe()}
        report="Accounts Receivable"
        surfaces={{ report: SurfaceProbe }}
      />,
    );
    expect(screen.getByTestId('probe-report').textContent).toContain('"Accounts Receivable"');
  });

  it('resolves navigator-driven paths through the slug index (routed mode)', async () => {
    const navigation = createMemoryNavigator('/backoffice/todo');
    renderWithProviders(
      <Desk
        frappe={frappe()}
        navigation={navigation}
        surfaces={{ list: SurfaceProbe }}
      />,
    );
    // oxlint-disable-next-line sonarjs/todo-tag -- names a doctype and its slug, not a task
    // "todo" is ambiguous until the fixture index resolves it to ToDo.
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toContain('"ToDo"');
    });
  });

  it('re-resolves when the navigator moves: list → form → back (deep-link round-trip)', async () => {
    const navigation = createMemoryNavigator('/backoffice/todo');
    renderWithProviders(
      <Desk
        frappe={frappe()}
        navigation={navigation}
        surfaces={{ list: SurfaceProbe, form: SurfaceProbe, 'not-found': SurfaceProbe }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-list')).toBeTruthy();
    });

    navigation.navigate('/backoffice/todo/T-0001');
    await waitFor(() => {
      expect(screen.getByTestId('probe-form').textContent).toContain('"T-0001"');
    });

    navigation.back();
    await waitFor(() => {
      expect(screen.getByTestId('probe-list')).toBeTruthy();
    });
  });

  it('onNavigate intercepts desk-issued navigation and cancels it (the drawer seam)', async () => {
    // The override navigates the way every surface does: through the
    // provider's navigator — the seam onNavigate wraps.
    const seen: string[] = [];
    const navigation = createMemoryNavigator('/backoffice/todo');
    renderWithProviders(
      <Desk
        frappe={frappe()}
        navigation={navigation}
        surfaces={{ list: ListWithRowPress, form: SurfaceProbe }}
        onNavigate={(target) => {
          seen.push(target.kind);
          return target.kind !== 'form';
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('open-doc')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('open-doc'));
    // cancelled: the host saw the target, the desk never left the list
    expect(seen).toContain('form');
    expect(navigation.getLocation().path).toBe('/backoffice/todo');
    expect(screen.queryByTestId('probe-form')).toBeNull();
  });

  it('per-doctype surface overrides beat per-kind, and miss falls through', () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="Sales Order"
        surfaces={{ list: { 'Sales Order': DoctypeProbe } }}
      />,
    );
    expect(screen.getByTestId('doctype-probe')).toBeTruthy();

    // A record keyed by a different doctype misses → built-in list mounts
    // (its loading state), not the probe.
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="ToDo"
        surfaces={{ list: { 'Sales Order': DoctypeProbe } }}
      />,
    );
    expect(screen.queryAllByTestId('doctype-probe')).toHaveLength(1);
  });

  it('basePath rebinds resolution (mounted at /admin)', async () => {
    const navigation = createMemoryNavigator('/admin/todo');
    renderWithProviders(
      <Desk
        frappe={frappe()}
        navigation={navigation}
        basePath="/admin"
        surfaces={{ list: SurfaceProbe }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-list').textContent).toContain('"ToDo"');
    });
  });
});

describe('two Desks on one page (DK-7)', () => {
  it('field overrides are per-Desk and never touch the module registry (GL-4)', () => {
    const globalData = getFieldComponent('Data');

    renderWithProviders(
      <>
        <Desk
          frappe={frappe()}
          doctype="ToDo"
          fields={{ Data: CustomA }}
          surfaces={{ list: probeA }}
        />
        <Desk
          frappe={frappe()}
          doctype="ToDo"
          fields={{ Data: CustomB }}
          surfaces={{ list: probeB }}
        />
      </>,
    );

    // Each Desk resolves its own override…
    expect(screen.getByTestId('desk-a-field').querySelector('[data-testid="custom-a"]')).toBeTruthy();
    expect(screen.getByTestId('desk-b-field').querySelector('[data-testid="custom-b"]')).toBeTruthy();
    expect(screen.getByTestId('desk-a-field').querySelector('[data-testid="custom-b"]')).toBeNull();
    // …and the module-global default table is untouched.
    expect(getFieldComponent('Data')).toBe(globalData);
  });

  it('scope is per-Desk context (GL-5)', () => {
    renderWithProviders(
      <>
        <Desk
          frappe={frappe()}
          doctype="ToDo"
          scope={[['company', '=', 'A']]}
          surfaces={{ list: () => <ScopeProbe testId="scope-a" /> }}
        />
        <Desk
          frappe={frappe()}
          doctype="ToDo"
          scope={[['company', '=', 'B']]}
          surfaces={{ list: () => <ScopeProbe testId="scope-b" /> }}
        />
      </>,
    );
    expect(screen.getByTestId('scope-a').textContent).toBe('[["company","=","A"]]');
    expect(screen.getByTestId('scope-b').textContent).toBe('[["company","=","B"]]');
  });
});

// ---------------------------------------------------------------------------
// Story-shape arms (MPO-189) — the narrowings Desk.stories.tsx demonstrates,
// pinned here so a chrome default can never drift silently.
// ---------------------------------------------------------------------------

describe('<Desk /> chrome narrowings', () => {
  it('chrome="bare" keeps the banner and forces the sidebar capability off', () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="ToDo"
        chrome="bare"
        surfaces={{ list: SurfaceProbe }}
      />,
    );
    // Banner present…
    expect(screen.getByTestId('backoffice-shell')).toBeTruthy();
    expect(screen.getByTestId('backoffice-awesomebar')).toBeTruthy();
    // …rail gone: bare merges `sidebar: false` into capabilities, so nothing
    // downstream can put it back.
    expect(screen.queryByTestId('backoffice-sidebar-rail')).toBeNull();
    expect(screen.queryByTestId('backoffice-sidebar-toggle')).toBeNull();
  });

  it("`embedded` is sugar for chrome='content' (no banner, no rail)", () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        workspace="Tools"
        embedded
        surfaces={{ workspace: SurfaceProbe }}
      />,
    );
    expect(screen.queryByTestId('backoffice-shell')).toBeNull();
    expect(screen.getByTestId('probe-workspace').textContent).toContain('"Tools"');
  });

  it('a view pin enters on that view rather than the list', () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="ToDo"
        view="kanban"
        surfaces={{ view: SurfaceProbe }}
      />,
    );
    const probe = screen.getByTestId('probe-view');
    expect(probe.textContent).toContain('"kanban"');
    expect(probe.textContent).toContain('"ToDo"');
  });

  it('name="new" enters create mode', () => {
    renderWithProviders(
      <Desk
        frappe={frappe()}
        doctype="ToDo"
        name="new"
        surfaces={{ new: SurfaceProbe }}
      />,
    );
    expect(screen.getByTestId('probe-new').textContent).toContain('"ToDo"');
  });
});

describe('<Desk frappe> under an ambient FrappeProvider', () => {
  const AMBIENT_HOST = 'https://ambient.mock.test';

  it('an explicit frappe prop wins over the ambient provider', () => {
    renderWithProviders(
      <FrappeProvider
        baseURL={AMBIENT_HOST}
        fixtures={makeFixtures()}>
        <Desk
          frappe={frappe()}
          doctype="ToDo"
          surfaces={{ list: ConnectionProbe }}
        />
      </FrappeProvider>,
    );
    expect(screen.getByTestId('probe-connection').textContent).toBe(MOCK_HOST);
  });

  it('an omitted frappe prop inherits the ambient provider', () => {
    renderWithProviders(
      <FrappeProvider
        baseURL={AMBIENT_HOST}
        fixtures={makeFixtures()}>
        <Desk
          doctype="ToDo"
          surfaces={{ list: ConnectionProbe }}
        />
      </FrappeProvider>,
    );
    expect(screen.getByTestId('probe-connection').textContent).toBe(AMBIENT_HOST);
  });
});
