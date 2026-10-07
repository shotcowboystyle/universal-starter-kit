// A doctype's list, record, edit and new pages from a declaration alone
// (MPO-333): `<FrappeListView doctype route>` and `<FrappeForm doctype
// route>` read the record from the host router's path, draw the page, and
// move between the pages on row press, Add, Edit, Save, Cancel and Delete.
// The bench below is a stock one: getdoctype for meta, /api/resource for
// reads, the live app's create_doc / update_doc / delete_doc for writes, and
// a hash name the server picks on create. Poke Move is the doctype. The
// session's roles decide what the pages offer (MPO-390): an editor gets Add,
// Edit, Save and Delete, a reader the list and the record read-only.
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeForm } from './FrappeForm';
import { FrappeListView } from './FrappeListView';
import { frappeRouteHref, frappeRouteTarget } from './frappeNavigation';
import type { FrappeNavigation } from './frappeNavigation';
import { FrappeProvider } from './FrappeProvider';

const doctype = 'Poke Move';
const route = '/moves';

const pokeMoveMeta = {
  name: doctype,
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [
    { fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name', required: 1 },
    { fieldname: 'power', fieldtype: 'Int', label: 'Power' },
    { fieldname: 'pp', fieldtype: 'Int', label: 'PP' },
    {
      fieldname: 'damage_class',
      fieldtype: 'Select',
      label: 'Damage Class',
      options: '\nphysical\nspecial\nstatus',
    },
  ],
  permissions: [
    { role: 'System Manager', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Move Author', read: 1, write: 1, create: 1, delete: 1, if_owner: 1 },
    { role: 'Guest', read: 1 },
  ],
};

const editor = { user: 'editor@pokemon.test', roles: ['Pokemon Editor', 'All', 'Guest'] };
const reader = { user: 'reader@pokemon.test', roles: ['All', 'Guest'] };
const author = { user: 'author@pokemon.test', roles: ['Move Author', 'All', 'Guest'] };

interface Move {
  name: string;
  doctype: string;
  owner?: string;
  move_name?: string;
  power?: number;
  pp?: number;
  damage_class?: string;
}

interface Write {
  method: string;
  body: Record<string, unknown>;
}

let run = 0;
let bench = '';
let moves = new Map<string, Move>();
let writes: Write[] = [];
let guest = false;
let session: { user: string; roles: string[] } | null = editor;
let sessionAnswered = false;
let movesListed: Promise<void> = Promise.resolve();
let markMovesListed = () => {};
let confirmDelete = vi.fn(() => true);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function matchesNameFilter(row: Move, filters: string | null): boolean {
  if (!filters) {
    return true;
  }
  const parsed = JSON.parse(filters) as unknown;
  const clauses = Array.isArray(parsed)
    ? (parsed as [string, string, unknown][])
    : Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, '=', value]);
  return clauses.every(([field, operator, value]) =>
    field === 'name' && operator === '=' ? row.name === value : true,
  );
}

function stubBench() {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.auth.get_logged_user') {
      if (!session) {
        sessionAnswered = true;
        return json({ exc_type: 'PermissionError' }, 403);
      }
      return json({ message: session.user });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      sessionAnswered = true;
      return session ? json({ message: session.roles }) : json({ exc_type: 'PermissionError' }, 403);
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      if (guest) {
        return json({ exc_type: 'PermissionError' }, 403);
      }
      return json({ docs: [pokeMoveMeta] });
    }
    const resource = `/api/resource/${encodeURIComponent(doctype)}`;
    if (url.pathname === resource) {
      const rows = [...moves.values()].filter((row) => matchesNameFilter(row, url.searchParams.get('filters')));
      if (url.searchParams.get('fields')?.includes('"move_name"')) {
        markMovesListed();
      }
      return json({ data: rows });
    }
    if (url.pathname.startsWith(`${resource}/`)) {
      const row = moves.get(decodeURIComponent(url.pathname.slice(resource.length + 1)));
      return row ? json({ data: row }) : json({ exc_type: 'DoesNotExistError' }, 404);
    }
    if (/^live\.live\.api\.(create|update|delete)_doc$/.test(method)) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      writes.push({ method, body });
      if (method === 'live.live.api.create_doc') {
        const created = {
          ...(body as unknown as Move),
          name: `move-${moves.size + 1}-hash`,
          doctype,
        };
        moves.set(created.name, created);
        return json({ message: created });
      }
      if (method === 'live.live.api.update_doc') {
        const name = String(body.name);
        const updated = { ...moves.get(name), ...(body.data as object) } as Move;
        moves.set(name, updated);
        return json({ message: updated });
      }
      if (method === 'live.live.api.delete_doc') {
        moves.delete(String(body.name));
        return json({ message: 'ok' });
      }
    }
    return json({ data: [], message: [] });
  });
}

function stubNavigation(pathname: string) {
  const pushed: string[] = [];
  const navigation: FrappeNavigation = {
    usePathname: () => pathname,
    useNavigate: () => (href) => pushed.push(href),
  };
  return { navigation, pushed };
}

function renderAt(pathname: string, page: 'list' | 'form') {
  const { navigation, pushed } = stubNavigation(pathname);
  const view = renderWithProviders(
    <FrappeProvider
      baseURL={bench}
      realtime={false}
      navigation={navigation}>
      {page === 'list' ? (
        <FrappeListView<Move>
          doctype={doctype}
          route={route}
        />
      ) : (
        <FrappeForm<Move>
          doctype={doctype}
          route={route}
        />
      )}
    </FrappeProvider>,
  );
  return { ...view, pushed };
}

// A surface that never asks for the session is judged on what it shows.
async function sessionSettled() {
  await waitFor(
    () => {
      expect(sessionAnswered).toBe(true);
    },
    { timeout: 1500 },
  ).catch(() => {});
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function button(container: HTMLElement, label: string): HTMLElement {
  const found = [...container.querySelectorAll('[role="button"], button')].find(
    (node) => node.textContent?.trim() === label || node.getAttribute('aria-label') === label,
  );
  if (!found) {
    throw new Error(`no ${label} button`);
  }
  return found as HTMLElement;
}

function input(container: HTMLElement, label: string): HTMLInputElement {
  const field = screen.getByLabelText(label, { exact: false });
  if (field instanceof HTMLInputElement) {
    return field;
  }
  const nested = field.querySelector('input') ?? container.querySelector(`input[name="${label}"]`);
  if (!nested) {
    throw new Error(`no ${label} input`);
  }
  return nested;
}

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  run += 1;
  bench = `http://routes-${run}.spec.test`;
  guest = false;
  session = editor;
  sessionAnswered = false;
  movesListed = new Promise((resolve) => {
    markMovesListed = resolve;
  });
  writes = [];
  moves = new Map([
    ['a1b2c3', { name: 'a1b2c3', doctype, owner: author.user, move_name: 'tackle', power: 40, pp: 35 }],
    [
      'd4e5f6',
      {
        name: 'd4e5f6',
        doctype,
        owner: 'Administrator',
        move_name: 'vine-whip',
        power: 45,
        pp: 25,
      },
    ],
  ]);
  stubBench();
  confirmDelete = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmDelete);
  window.confirm = confirmDelete;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe(frappeRouteTarget, () => {
  it('reads the list, a new record, a record and its edit form off the path', () => {
    expect(frappeRouteTarget(route, '/moves')).toEqual({ mode: 'list' });
    expect(frappeRouteTarget(route, '/moves/')).toEqual({ mode: 'list' });
    expect(frappeRouteTarget(route, '/moves/new')).toEqual({ mode: 'create' });
    expect(frappeRouteTarget(route, '/moves/a1b2c3')).toEqual({ mode: 'view', name: 'a1b2c3' });
    expect(frappeRouteTarget(route, '/moves/Hyper%20Beam/edit')).toEqual({
      mode: 'edit',
      name: 'Hyper Beam',
    });
    expect(frappeRouteTarget(route, '/pokemon/bulbasaur')).toBeUndefined();
    expect(frappeRouteTarget(route, '/moves/a/b/c')).toBeUndefined();
  });

  it('writes the href for each page, the record name escaped', () => {
    expect(frappeRouteHref(route, { mode: 'list' })).toBe('/moves');
    expect(frappeRouteHref(route, { mode: 'create' })).toBe('/moves/new');
    expect(frappeRouteHref(route, { mode: 'view', name: 'Hyper Beam' })).toBe('/moves/Hyper%20Beam');
    expect(frappeRouteHref(`${route}/`, { mode: 'edit', name: 'a1b2c3' })).toBe('/moves/a1b2c3/edit');
  });
});

describe('FrappeListView with a route', () => {
  it("is the doctype's list page: its rows, a row opens the record, Add opens a new one", async () => {
    const { container, pushed } = renderAt('/moves', 'list');
    await waitFor(() => {
      expect(screen.getByText('tackle')).toBeTruthy();
    });
    expect(screen.getByText('vine-whip')).toBeTruthy();
    expect(screen.getByRole('heading', { name: doctype })).toBeTruthy();

    fireEvent.click(screen.getByText('tackle'));
    expect(pushed).toEqual(['/moves/a1b2c3']);

    await waitFor(() => {
      expect(button(container, `Add ${doctype}`)).toBeTruthy();
    });
    fireEvent.click(button(container, `Add ${doctype}`));
    expect(pushed).toEqual(['/moves/a1b2c3', '/moves/new']);
  });

  it("offers no Add to a reader who cannot load the doctype's meta", async () => {
    guest = true;
    const { container } = renderAt('/moves', 'list');
    // A 403 on meta costs two more round trips before a row can show: a
    // one-doc peek, then the re-read with its keys. Wait for that read.
    await movesListed;
    await waitFor(() => {
      expect(screen.getByText('tackle')).toBeTruthy();
    });
    expect(() => button(container, `Add ${doctype}`)).toThrow();
  });

  it('offers no Add to a signed-in reader whose roles grant no create', async () => {
    session = reader;
    const { container } = renderAt('/moves', 'list');
    await waitFor(() => {
      expect(screen.getByText('tackle')).toBeTruthy();
    });
    await sessionSettled();
    expect(() => button(container, `Add ${doctype}`)).toThrow();
  });

  it("offers no Add when the session's roles can't be read", async () => {
    session = null;
    const { container } = renderAt('/moves', 'list');
    await waitFor(() => {
      expect(screen.getByText('tackle')).toBeTruthy();
    });
    await sessionSettled();
    expect(() => button(container, `Add ${doctype}`)).toThrow();
  });
});

describe('FrappeForm with a route', () => {
  it('shows the record read-only on its page, with Edit and Delete', async () => {
    const { container, pushed } = renderAt('/moves/a1b2c3', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    expect(screen.getByRole('heading', { name: 'tackle' })).toBeTruthy();
    expect(input(container, 'Move Name').disabled || input(container, 'Move Name').readOnly).toBe(true);
    expect(() => button(container, 'Save')).toThrow();

    await waitFor(() => {
      expect(button(container, 'Edit')).toBeTruthy();
    });
    fireEvent.click(button(container, 'Edit'));
    expect(pushed).toEqual(['/moves/a1b2c3/edit']);

    fireEvent.click(button(container, `Back to ${doctype} list`));
    expect(pushed).toEqual(['/moves/a1b2c3/edit', '/moves']);
  });

  it('edits the record through update_doc and returns to it', async () => {
    const { container, pushed } = renderAt('/moves/a1b2c3/edit', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    fireEvent.change(input(container, 'Power'), { target: { value: '50' } });
    fireEvent.click(button(container, 'Save'));

    await waitFor(() => {
      expect(pushed).toEqual(['/moves/a1b2c3']);
    });
    expect(writes).toEqual([
      {
        method: 'live.live.api.update_doc',
        body: { doctype, name: 'a1b2c3', data: { power: 50 } },
      },
    ]);
    expect(moves.get('a1b2c3')?.power).toBe(50);
  });

  it('cancels an edit back to the record', async () => {
    const { container, pushed } = renderAt('/moves/a1b2c3/edit', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    fireEvent.click(button(container, 'Cancel'));
    expect(pushed).toEqual(['/moves/a1b2c3']);
    expect(writes).toEqual([]);
  });

  it('creates through create_doc and opens the record under the name the server gave it', async () => {
    const { container, pushed } = renderAt('/moves/new', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: `New ${doctype}` })).toBeTruthy();
    fireEvent.change(input(container, 'Move Name'), { target: { value: 'hyper-beam' } });
    fireEvent.change(input(container, 'Power'), { target: { value: '150' } });
    fireEvent.click(button(container, 'Save'));

    await waitFor(() => {
      expect(pushed).toEqual(['/moves/move-3-hash']);
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method).toBe('live.live.api.create_doc');
    expect(writes[0]?.body).toMatchObject({ doctype, move_name: 'hyper-beam', power: 150 });
    expect(moves.get('move-3-hash')?.move_name).toBe('hyper-beam');
  });

  it('deletes through delete_doc and returns to the list', async () => {
    const { container, pushed } = renderAt('/moves/d4e5f6', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('vine-whip');
    });
    await waitFor(() => {
      expect(button(container, 'Delete')).toBeTruthy();
    });
    fireEvent.click(button(container, 'Delete'));

    await waitFor(() => {
      expect(pushed).toEqual(['/moves']);
    });
    expect(confirmDelete).toHaveBeenCalledOnce();
    expect(writes).toEqual([{ method: 'live.live.api.delete_doc', body: { doctype, name: 'd4e5f6' } }]);
    expect(moves.has('d4e5f6')).toBe(false);
  });

  it("shows a reader without meta the record's own fields, read-only and with no actions", async () => {
    guest = true;
    const { container } = renderAt('/moves/a1b2c3', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    expect(input(container, 'Power').value).toBe('40');
    expect(screen.queryByText(`Failed to load ${doctype} form`)).toBeNull();
    expect(() => button(container, 'Edit')).toThrow();
    expect(() => button(container, 'Delete')).toThrow();
  });

  it("draws no field for the collection's own $ keys on a reader's record", async () => {
    guest = true;
    const { container } = renderAt('/moves/a1b2c3', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    const labels = Array.from(container.querySelectorAll('label'), (node) => node.textContent?.trim());
    expect(labels.filter((label) => label?.startsWith('$'))).toEqual([]);
    for (const key of ['$origin', '$key', '$collectionId']) {
      expect(screen.queryByText(key)).toBeNull();
    }
  });

  it('shows a signed-in reader the record with no Edit and no Delete', async () => {
    session = reader;
    const { container } = renderAt('/moves/a1b2c3', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    await sessionSettled();
    expect(input(container, 'Move Name').disabled || input(container, 'Move Name').readOnly).toBe(true);
    expect(() => button(container, 'Edit')).toThrow();
    expect(() => button(container, 'Delete')).toThrow();
  });

  it("renders a reader's edit page read-only with no Save", async () => {
    session = reader;
    const { container } = renderAt('/moves/a1b2c3/edit', 'form');
    await waitFor(() => {
      expect(input(container, 'Move Name').value).toBe('tackle');
    });
    await sessionSettled();
    const power = input(container, 'Power');
    expect(power.disabled || power.readOnly).toBe(true);
    expect(() => button(container, 'Save')).toThrow();
    expect(button(container, 'Cancel')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("tells a reader on the new page they can't create, with no form to save", async () => {
    session = reader;
    const { container } = renderAt('/moves/new', 'form');
    await waitFor(() => {
      expect(screen.getByTestId('frappe-form-not-permitted')).toBeTruthy();
    });
    expect(screen.getByText(`You can't create ${doctype}`)).toBeTruthy();
    expect(() => button(container, 'Save')).toThrow();
    expect(screen.queryByLabelText('Move Name', { exact: false })).toBeNull();
  });

  it("lets an if_owner author edit and delete their own record, not someone else's", async () => {
    session = author;
    const own = renderAt('/moves/a1b2c3', 'form');
    await waitFor(() => {
      expect(input(own.container, 'Move Name').value).toBe('tackle');
    });
    await waitFor(() => {
      expect(button(own.container, 'Edit')).toBeTruthy();
    });
    expect(button(own.container, 'Delete')).toBeTruthy();
    cleanup();

    const others = renderAt('/moves/d4e5f6', 'form');
    await waitFor(() => {
      expect(input(others.container, 'Move Name').value).toBe('vine-whip');
    });
    await sessionSettled();
    expect(() => button(others.container, 'Edit')).toThrow();
    expect(() => button(others.container, 'Delete')).toThrow();
  });
});
