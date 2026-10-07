import { InMemoryFixtureProvider } from '@repo/frappe';
import { describe, expect, it } from 'vitest';

import type { ViewConnection } from './connection';
import type { KanbanBoardDoc } from './deskViewConfigs';
import { addKanbanColumn, createKanbanBoard, parseBoardFilters, setKanbanColumnStatus } from './kanbanBoardOps';

describe(parseBoardFilters, () => {
  it('returns no filters for empty or missing input', () => {
    expect(parseBoardFilters()).toEqual([]);
    expect(parseBoardFilters('')).toEqual([]);
  });

  it('degrades malformed JSON and non-array shapes to no filters', () => {
    expect(parseBoardFilters('not json')).toEqual([]);
    expect(parseBoardFilters('{"a":1}')).toEqual([]);
    expect(parseBoardFilters('["loose", 1]')).toEqual([]);
  });

  it('strips the doctype prefix from 4-tuple desk filters', () => {
    expect(parseBoardFilters('[["ToDo","priority","=","Medium"]]')).toEqual([['priority', '=', 'Medium']]);
  });

  it('passes bare 3-tuple filters through', () => {
    expect(parseBoardFilters('[["status","!=","Cancelled"]]')).toEqual([['status', '!=', 'Cancelled']]);
  });

  it('handles mixed tuple shapes and skips junk entries', () => {
    expect(parseBoardFilters('[["ToDo","priority","=","High"],["status","=","Open"],"junk",[["nested"]],[]]')).toEqual([
      ['priority', '=', 'High'],
      ['status', '=', 'Open'],
    ]);
  });
});

function fixtureConnection(seed: Record<string, Record<string, unknown>[]>): {
  connection: ViewConnection;
  fixtures: InMemoryFixtureProvider;
} {
  const fixtures = new InMemoryFixtureProvider(seed as never);
  return { connection: { baseURL: 'https://fixtures.test', fixtures }, fixtures };
}

const seedBoard = {
  name: 'QA Board',
  doctype: 'Kanban Board',
  kanban_board_name: 'QA Board',
  reference_doctype: 'ToDo',
  field_name: 'status',
  columns: [
    { column_name: 'Open', status: 'Active' },
    { column_name: 'Closed', status: 'Active' },
  ],
};

describe('kanban board ops (fixture mode)', () => {
  it('creates a board with columns seeded from the field options', async () => {
    const { connection, fixtures } = fixtureConnection({ 'Kanban Board': [] });
    const name = await createKanbanBoard(connection, {
      doctype: 'ToDo',
      boardName: 'Sprint Board',
      fieldName: 'status',
      columns: ['Open', 'Closed', 'Cancelled'],
    });
    expect(name).toBe('Sprint Board');
    const doc = (await fixtures.getDoc('Kanban Board', 'Sprint Board')) as
      | (KanbanBoardDoc & { doctype: string })
      | null;
    expect(doc?.reference_doctype).toBe('ToDo');
    expect(doc?.field_name).toBe('status');
    expect(doc?.columns?.map((column) => column.column_name)).toEqual(['Open', 'Closed', 'Cancelled']);
    expect(doc?.columns?.every((column) => column.status === 'Active')).toBe(true);
  });

  it('appends a column to the board child table', async () => {
    const { connection, fixtures } = fixtureConnection({ 'Kanban Board': [seedBoard] });
    await addKanbanColumn(connection, seedBoard as KanbanBoardDoc, 'In Review');
    const doc = (await fixtures.getDoc('Kanban Board', 'QA Board')) as (KanbanBoardDoc & { doctype: string }) | null;
    expect(doc?.columns?.map((column) => column.column_name)).toEqual(['Open', 'Closed', 'In Review']);
  });

  it('archives and restores a column by name', async () => {
    const { connection, fixtures } = fixtureConnection({ 'Kanban Board': [seedBoard] });
    await setKanbanColumnStatus(connection, seedBoard as KanbanBoardDoc, 'Closed', 'Archived');
    let doc = (await fixtures.getDoc('Kanban Board', 'QA Board')) as (KanbanBoardDoc & { doctype: string }) | null;
    expect(doc?.columns?.find((column) => column.column_name === 'Closed')?.status).toBe('Archived');
    await setKanbanColumnStatus(
      connection,
      { ...(seedBoard as KanbanBoardDoc), columns: doc?.columns },
      'Closed',
      'Active',
    );
    doc = (await fixtures.getDoc('Kanban Board', 'QA Board')) as (KanbanBoardDoc & { doctype: string }) | null;
    expect(doc?.columns?.find((column) => column.column_name === 'Closed')?.status).toBe('Active');
  });
});
