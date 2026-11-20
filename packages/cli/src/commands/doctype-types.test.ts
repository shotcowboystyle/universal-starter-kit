import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  doctypesToTypeScript,
  generateDoctypeTypes,
  generatedHeader,
  interfaceName,
  typesDrift,
} from './doctype-types';
import type { DoctypeMeta } from './doctype-types';

const salesOrder = (): DoctypeMeta[] => [
  {
    name: 'Sales Order',
    fields: [
      { fieldname: 'customer', fieldtype: 'Link', options: 'Customer', required: 1 },
      { fieldname: 'status', fieldtype: 'Select', options: '\nDraft\nTo Deliver\nCompleted' },
      { fieldname: 'grand_total', fieldtype: 'Currency' },
      { fieldname: 'is_return', fieldtype: 'Check' },
      { fieldname: 'items', fieldtype: 'Table', options: 'Sales Order Item', required: 1 },
      { fieldname: 'section_break_1', fieldtype: 'Section Break' },
      { fieldname: 'notes_html', fieldtype: 'HTML' },
    ],
  },
  {
    name: 'Sales Order Item',
    istable: 1,
    fields: [
      { fieldname: 'item_code', fieldtype: 'Link', options: 'Item', required: 1 },
      { fieldname: 'qty', fieldtype: 'Float' },
      { fieldname: 'idx', fieldtype: 'Int' },
    ],
  },
];

let docs = salesOrder();
let lastAuthorization: string | undefined;
let server: http.Server;
let baseURL: string;

describe('mpo frappe types (MPO-22)', () => {
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://stub');
      lastAuthorization = request.headers.authorization;
      if (url.pathname !== '/api/method/frappe.desk.form.load.getdoctype') {
        response.writeHead(404).end();
        return;
      }
      if (url.searchParams.get('doctype') !== 'Sales Order') {
        response.writeHead(403, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ docs }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it('emits an interface per doctype from getdoctype, child tables included', async () => {
    docs = salesOrder();
    const output = await generateDoctypeTypes(['Sales Order'], {
      baseURL,
      apiKey: 'key',
      apiSecret: 'secret',
    });
    expect(lastAuthorization).toBe('token key:secret');
    expect(output).toBe(
      [
        generatedHeader,
        '',
        'export interface SalesOrder {',
        '  doctype: "Sales Order";',
        '  name: string;',
        '  owner?: string;',
        '  creation?: string;',
        '  modified?: string;',
        '  modified_by?: string;',
        '  docstatus?: 0 | 1 | 2;',
        '  idx?: number;',
        '  customer: string;',
        '  status?: "" | "Draft" | "To Deliver" | "Completed";',
        '  grand_total?: string;',
        '  is_return?: 0 | 1;',
        '  items: SalesOrderItem[];',
        '}',
        '',
        'export interface SalesOrderItem {',
        '  doctype: "Sales Order Item";',
        '  name: string;',
        '  owner?: string;',
        '  creation?: string;',
        '  modified?: string;',
        '  modified_by?: string;',
        '  docstatus?: 0 | 1 | 2;',
        '  idx?: number;',
        '  parent?: string;',
        '  parentfield?: string;',
        '  parenttype?: string;',
        '  item_code: string;',
        '  qty?: number;',
        '}',
        '',
      ].join('\n'),
    );
    const { diagnostics } = ts.transpileModule(output, { reportDiagnostics: true });
    expect(diagnostics ?? []).toStrictEqual([]);
  });

  it('a diff against the committed file catches drift on the server', async () => {
    docs = salesOrder();
    const committed = await generateDoctypeTypes(['Sales Order'], { baseURL });
    expect(typesDrift(committed, await generateDoctypeTypes(['Sales Order'], { baseURL }))).toStrictEqual([]);

    docs = salesOrder();
    docs[0].fields.splice(1, 1, {
      fieldname: 'status',
      fieldtype: 'Select',
      options: '\nDraft\nCompleted',
    });
    docs[0].fields.push({ fieldname: 'delivery_date', fieldtype: 'Date' });
    docs[1].fields = docs[1].fields.filter((field) => field.fieldname !== 'qty');

    expect(typesDrift(committed, await generateDoctypeTypes(['Sales Order'], { baseURL }))).toStrictEqual([
      '-   status?: "" | "Draft" | "To Deliver" | "Completed";',
      '+   status?: "" | "Draft" | "Completed";',
      '+   delivery_date?: string;',
      '-   qty?: number;',
    ]);
  });

  it('fails loudly when the server will not hand over the meta', async () => {
    await expect(generateDoctypeTypes(['ToDo'], { baseURL })).rejects.toThrow('getdoctype ToDo: HTTP 403');
  });

  it('names interfaces from doctype names', () => {
    expect(interfaceName('Sales Invoice Item')).toBe('SalesInvoiceItem');
    expect(interfaceName('ToDo')).toBe('ToDo');
    expect(interfaceName('2FA Settings')).toBe('DocType2FASettings');
    expect(doctypesToTypeScript([]).trim()).toBe(generatedHeader);
  });
});
