// Discovery of desk view-config documents that drive the alternate views:
//   - "Kanban Board" docs (field_name + columns child table) for kanban
//   - "Calendar View" docs (subject/start/end fields) for calendar
// Probed payloads (bench @ localhost:8000):
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

/** HttpClient bound to the view connection (shared with kanbanBoardOps). */
export function createViewHttp(connection: ViewConnection): HttpClient {
  const auth: AuthConfig | undefined = connection.auth
    ? {
        useToken: connection.auth.useToken,
        token: connection.auth.token,
        type: connection.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new HttpClient(connection.baseURL, auth);
}

async function fetchConfigDoc<TDoc extends { name: string }>(
  connection: ViewConnection,
  configDoctype: string,
  referenceDoctype: string,
  preferredName?: string,
): Promise<{ names: string[]; doc: TDoc | undefined }> {
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
  const selected = preferredName && names.includes(preferredName) ? preferredName : names[0];
  if (!selected) {
    return { names, doc: undefined };
  }
  let doc: TDoc | undefined;
  if (connection.fixtures) {
    doc =
      ((await connection.fixtures.getDoc<TDoc & { doctype: string }>(configDoctype, selected)) as TDoc | null) ??
      undefined;
  } else {
    const http = createViewHttp(connection);
    const response = await http.get<{ data?: TDoc }>(
      `/api/resource/${encodeURIComponent(configDoctype)}/${encodeURIComponent(selected)}`,
    );
    doc = response.payload?.data;
  }
  return { names, doc };
}

interface ConfigDocState<TDoc> {
  names: string[];
  doc: TDoc | undefined;
  isLoading: boolean;
  error: Error | undefined;
}

export interface ConfigDocResult<TDoc> extends ConfigDocState<TDoc> {
  /** Refetch after a config-doc mutation (create board, add column, …). */
  reload: () => void;
}

function useConfigDoc<TDoc extends { name: string }>(
  connection: ViewConnection | undefined,
  configDoctype: string,
  referenceDoctype: string,
  preferredName?: string,
): ConfigDocResult<TDoc> {
  const [state, setState] = useState<ConfigDocState<TDoc>>({
    names: [],
    doc: undefined,
    isLoading: true,
    error: undefined,
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);
  const baseURL = connection?.baseURL;

  useEffect(() => {
    if (!connection) {
      return;
    }
    let cancelled = false;
    setState({ names: [], doc: undefined, isLoading: true, error: undefined });
    void (async () => {
      try {
        const { names, doc } = await fetchConfigDoc<TDoc>(connection, configDoctype, referenceDoctype, preferredName);
        if (!cancelled) {
          setState({ names, doc, isLoading: false, error: undefined });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            names: [],
            doc: undefined,
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
}

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
export function useKanbanBoard(
  connection: ViewConnection | undefined,
  doctype: string,
  preferredName?: string,
): ConfigDocResult<KanbanBoardDoc> {
  return useConfigDoc<KanbanBoardDoc>(connection, 'Kanban Board', doctype, preferredName);
}

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
export function useCalendarViewSettings(
  connection: ViewConnection | undefined,
  doctype: string,
): ConfigDocResult<CalendarViewDoc> {
  return useConfigDoc<CalendarViewDoc>(connection, 'Calendar View', doctype);
}
