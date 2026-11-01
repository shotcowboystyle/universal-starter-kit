import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- imports the hook under its exported name; renaming it breaks consumers
import { fieldsFromRecord, recordFieldKeys, recordKeyLabel, useRecordShape as useRecordFields } from './record-shape';

const record = {
  name: 'a1b2c3',
  doctype: 'Poke Move',
  owner: 'Administrator',
  creation: '2026-09-29 09:00:00',
  modified: '2026-09-29 10:00:00',
  modified_by: 'Administrator',
  docstatus: 0,
  idx: 0,
  _user_tags: null,
  _comments: null,
  _assign: null,
  _liked_by: null,
  _seen: null,
  $origin: 'remote',
  $key: 'a1b2c3',
  move_name: 'tackle',
  power: 40,
  accuracy: 0.95,
  damage_class: null,
  effects: [{ name: 'row-1' }],
};

describe('recordShape', () => {
  it("keeps a record's own scalar keys in server order", () => {
    expect(recordFieldKeys(record)).toStrictEqual(['move_name', 'power', 'accuracy', 'damage_class']);
  });

  it('labels a key the way the desk labels a field', () => {
    expect(recordKeyLabel('base_experience')).toBe('Base Experience');
  });

  it('types each field from its value and marks it read-only', () => {
    expect(fieldsFromRecord(record)).toStrictEqual([
      { fieldname: 'move_name', label: 'Move Name', fieldtype: 'Data', read_only: 1 },
      { fieldname: 'power', label: 'Power', fieldtype: 'Int', read_only: 1 },
      { fieldname: 'accuracy', label: 'Accuracy', fieldtype: 'Float', read_only: 1 },
      { fieldname: 'damage_class', label: 'Damage Class', fieldtype: 'Data', read_only: 1 },
    ]);
  });
});

const stub = (answer: () => Response) => {
  const reads: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    reads.push(String(input instanceof Request ? input.url : input));
    return answer();
  });
  return reads;
};

describe(useRecordFields, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads nothing until asked', () => {
    const reads = stub(() => new Response('{}'));
    const { result } = renderHook(() => useRecordFields({ baseURL: 'http://shape.test' }, 'Poke Move', false));
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual pins the idle state's undefined fields key
    expect(result.current).toStrictEqual({ fields: undefined, status: 'idle' });
    expect(reads).toStrictEqual([]);
  });

  it('samples one record with every field', async () => {
    const reads = stub(() => Response.json({ data: [record] }));
    const { result } = renderHook(() => useRecordFields({ baseURL: 'http://shape.test' }, 'Poke Move', true));
    expect(result.current.status).toBe('pending');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.fields?.map((field) => field.fieldname)).toStrictEqual([
      'move_name',
      'power',
      'accuracy',
      'damage_class',
    ]);
    const url = new URL(reads[0] ?? '');
    expect(url.pathname).toBe('/api/resource/Poke%20Move');
    expect(url.searchParams.get('fields')).toBe('["*"]');
    expect(url.searchParams.get('limit_page_length')).toBe('1');
  });

  it('calls a refused or empty doctype unreadable', async () => {
    stub(() => Response.json({ exc_type: 'PermissionError' }, { status: 403 }));
    const refused = renderHook(() => useRecordFields({ baseURL: 'http://refused.test' }, 'Poke Move', true));
    await waitFor(() => {
      expect(refused.result.current.status).toBe('unreadable');
    });

    stub(() => Response.json({ data: [] }));
    const empty = renderHook(() => useRecordFields({ baseURL: 'http://empty.test' }, 'Poke Move', true));
    await waitFor(() => {
      expect(empty.result.current.status).toBe('unreadable');
    });
  });
});
