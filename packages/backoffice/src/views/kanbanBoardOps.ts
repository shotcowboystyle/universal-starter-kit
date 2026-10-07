// Kanban Board doc mutations (desk parity), riding the same ViewConnection
// as the reads in deskViewConfigs:
//   - new boards: REST insert (POST /api/resource/Kanban Board) with columns
//     seeded from the grouping field's Select options — the server seeds each
//     column's card order in before_insert
//   - column ops: the desk whitelisted RPCs (kanban_board.add_column /
//     archive_restore_column), which validate duplicates and keep child-row
//     identity + card order intact server-side
// Fixture mode (stories/tests) mutates the fixture store instead, so the
// view's refetch sees the change.
import type { FrappeDocData } from '@repo/frappe';

import type { ViewConnection } from './connection';
import { createViewHttp } from './deskViewConfigs';
import type { KanbanBoardDoc } from './deskViewConfigs';

const KANBAN_RPC_BASE = '/api/method/frappe.desk.doctype.kanban_board.kanban_board';

export interface CreateKanbanBoardInput {
  /** Reference doctype the board is for (e.g. "ToDo"). */
  doctype: string;
  boardName: string;
  /** The Select field the board's columns map onto. */
  fieldName: string;
  /** Column values, seeded from the field's Select options. */
  columns: readonly string[];
}

/** Insert a Kanban Board doc; resolves to the created board's name. */
export async function createKanbanBoard(connection: ViewConnection, input: CreateKanbanBoardInput): Promise<string> {
  const body = {
    kanban_board_name: input.boardName,
    reference_doctype: input.doctype,
    field_name: input.fieldName,
    columns: input.columns.map((column) => ({ column_name: column, status: 'Active' })),
  };
  if (connection.fixtures) {
    const created = await connection.fixtures.createDoc('Kanban Board', {
      name: input.boardName,
      doctype: 'Kanban Board',
      ...body,
    });
    return String(created.name ?? input.boardName);
  }
  const http = createViewHttp(connection);
  const response = await http.post<{ data?: { name?: string } }>('/api/resource/Kanban%20Board', body);
  return response.payload?.data?.name ?? input.boardName;
}

/** Append a column to the board's child table (desk add_column RPC). */
export async function addKanbanColumn(
  connection: ViewConnection,
  board: KanbanBoardDoc,
  columnName: string,
): Promise<void> {
  if (connection.fixtures) {
    // Fixture docs are plain JSON — the child rows intentionally lack the
    // server-managed ChildTableRow bookkeeping fields.
    await connection.fixtures.updateDoc('Kanban Board', board.name, {
      columns: [...(board.columns ?? []), { column_name: columnName, status: 'Active' }],
    } as unknown as Partial<FrappeDocData>);
    return;
  }
  const http = createViewHttp(connection);
  await http.post(`${KANBAN_RPC_BASE}.add_column`, {
    board_name: board.name,
    column_title: columnName,
  });
}

/** Archive or restore a board column (desk archive_restore_column RPC). */
export async function setKanbanColumnStatus(
  connection: ViewConnection,
  board: KanbanBoardDoc,
  columnName: string,
  status: 'Active' | 'Archived',
): Promise<void> {
  if (connection.fixtures) {
    await connection.fixtures.updateDoc('Kanban Board', board.name, {
      columns: (board.columns ?? []).map((column) =>
        column.column_name === columnName ? { ...column, status } : column,
      ),
    } as unknown as Partial<FrappeDocData>);
    return;
  }
  const http = createViewHttp(connection);
  await http.post(`${KANBAN_RPC_BASE}.archive_restore_column`, {
    board_name: board.name,
    column_title: columnName,
    status,
  });
}

/**
 * Parse a Kanban Board `filters` JSON string into `[fieldname, operator,
 * value]` tuples for the card query. Desk stores list-filter tuples either
 * doctype-qualified (`[doctype, fieldname, operator, value]` — the shape
 * quick_kanban_board writes) or bare (`[fieldname, operator, value]`).
 * Malformed input degrades to no filters.
 */
export function parseBoardFilters(raw: string | undefined): [string, string, unknown][] {
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const filters: [string, string, unknown][] = [];
  for (const entry of parsed) {
    if (!Array.isArray(entry)) {
      continue;
    }
    if (entry.length >= 4) {
      filters.push([String(entry[1]), String(entry[2]), entry[3]]);
    } else if (entry.length === 3) {
      filters.push([String(entry[0]), String(entry[1]), entry[2]]);
    }
  }
  return filters;
}
