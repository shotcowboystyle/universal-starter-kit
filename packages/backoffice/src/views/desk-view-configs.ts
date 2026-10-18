// Discovery of desk view-config documents that drive the alternate views:
//   - "Kanban Board" docs (field_name + columns child table) for kanban
//   - "Calendar View" docs (subject/start/end fields) for calendar
// Probed payloads (bench @ localhost:8000):
// oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
//   GET /api/resource/Kanban Board?filters=[["reference_doctype","=","ToDo"]]
//     → { data: [{ name }] } (names only)
//   GET /api/resource/Kanban Board/<name>
//     → full doc incl. columns: [{ column_name, status: "Active"|"Archived",
//       indicator: "Blue"|…|"Yellow", order }]
//   GET /api/resource/Calendar View?filters=[["reference_doctype","=",dt]]
//     → { data: [{ name }] }; full doc has subject_field, start_date_field,
//       end_date_field, all_day
// Fixture mode (stories/tests): reads ride connection.fixtures instead.
import { HttpClient } from '@repo/frappe';
import type { AuthConfig } from '@repo/frappe';
import { useCallback, useEffect, useState } from 'react';

import type { ViewConnection } from './connection';

/** HttpClient bound to the view connection (shared with kanban-board-ops). */
export const createViewHttp = (connection: ViewConnection): HttpClient => {
  const auth: AuthConfig | undefined = connection.auth
    ? {
        useToken: connection.auth.useToken,
        token: connection.auth.token,
        // SAFETY: FrappeConfig types auth.type as a plain string; it carries the AuthConfig auth-type names.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        type: connection.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new HttpClient(connection.baseURL, auth);
};

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the caller names the config doctype's shape; the response is untyped JSON
const fetchConfigDoc = async <TDoc extends { name: string }>(
  connection: ViewConnection,
  configDoctype: string,
  referenceDoctype: string,
  preferredName?: string,
): Promise<{ names: string[]; doc?: TDoc }> => {
  const filters: [string, string, unknown][] = [['reference_doctype', '=', referenceDoctype]];
  let names: string[];
  if (connection.fixtures) {
    const rows = await connection.fixtures.getList<TDoc & { doctype: string }>(configDoctype, {
      filters,
    });
    names = rows.map((row) => String(row.name));
  } else {
    const http = createViewHttp(connection);
    const response = await http.get<{ data?: { name: string }[] }>(
      `/api/resource/${encodeURIComponent(configDoctype)}`,
      { filters, limit_page_length: 0 },
    );
    names = (response.payload?.data ?? []).map((row) => row.name);
  }
  const selected = preferredName !== undefined && names.includes(preferredName) ? preferredName : names[0];
  if (selected === undefined || selected === '') {
    return { names };
  }
  let doc: TDoc | undefined;
  if (connection.fixtures) {
    // SAFETY: fixture config docs are stored whole; getDoc only types its result as Partial.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const fixtureDoc = (await connection.fixtures.getDoc<TDoc & { doctype: string }>(
      configDoctype,
      selected,
    )) as TDoc | null;
    if (fixtureDoc !== null) {
      doc = fixtureDoc;
    }
  } else {
    const http = createViewHttp(connection);
    const response = await http.get<{ data?: TDoc }>(
      `/api/resource/${encodeURIComponent(configDoctype)}/${encodeURIComponent(selected)}`,
    );
    doc = response.payload?.data;
  }
  return { names, doc };
};

interface ConfigDocState<TDoc> {
  names: string[];
  doc?: TDoc;
  isLoading: boolean;
  error?: Error;
}

export interface ConfigDocResult<TDoc> extends ConfigDocState<TDoc> {
  /** Refetch after a config-doc mutation (create board, add column, …). */
  reload: () => void;
}

const useConfigDoc = <TDoc extends { name: string }>(
  connection: ViewConnection | undefined,
  configDoctype: string,
  referenceDoctype: string,
  preferredName?: string,
): ConfigDocResult<TDoc> => {
  const [state, setState] = useState<ConfigDocState<TDoc>>({ names: [], isLoading: true });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);
  const baseURL = connection?.baseURL;

  useEffect(() => {
    if (!connection) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    setState({ names: [], isLoading: true });
    void (async () => {
      try {
        const { names, doc } = await fetchConfigDoc<TDoc>(connection, configDoctype, referenceDoctype, preferredName);
        if (!cancelled) {
          setState({ names, doc, isLoading: false });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            names: [],
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Refetch on connection target / doctype / preferred doc / reload tick
    // only — `connection` object identity churns with provider re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL, configDoctype, referenceDoctype, preferredName, version]);

  return { ...state, reload };
};

// ---------------------------------------------------------------------------
// Kanban Board
// ---------------------------------------------------------------------------

export interface KanbanBoardColumnConfig {
  column_name?: string;
  /** "Active" | "Archived" */
  status?: string;
  /** Desk indicator color name (Blue, Cyan, Gray, Green, Light Blue, …) */
  indicator?: string;
}

export interface KanbanBoardDoc {
  name: string;
  kanban_board_name?: string;
  reference_doctype?: string;
  /** The Select field the board's columns map onto. */
  field_name?: string;
  columns?: KanbanBoardColumnConfig[];
  /** Board-scoped data filters (JSON string of desk list-filter tuples). */
  filters?: string;
  /** 1 = visible to the owner only (desk permission model). */
  private?: number;
}

/**
 * Discover the desk Kanban Board doc(s) for a doctype. `preferredName`
 * (the `?board=` search param) wins when it matches an existing board;
 * otherwise the first board is used.
 */
export const useKanbanBoard = (
  connection: ViewConnection | undefined,
  doctype: string,
  preferredName?: string,
): ConfigDocResult<KanbanBoardDoc> => useConfigDoc<KanbanBoardDoc>(connection, 'Kanban Board', doctype, preferredName);

// ---------------------------------------------------------------------------
// Calendar View
// ---------------------------------------------------------------------------

export interface CalendarViewDoc {
  name: string;
  reference_doctype?: string;
  subject_field?: string;
  start_date_field?: string;
  end_date_field?: string;
  all_day?: number;
}

/** Discover the desk Calendar View settings doc for a doctype (first wins). */
export const useCalendarViewSettings = (
  connection: ViewConnection | undefined,
  doctype: string,
): ConfigDocResult<CalendarViewDoc> => useConfigDoc<CalendarViewDoc>(connection, 'Calendar View', doctype);
