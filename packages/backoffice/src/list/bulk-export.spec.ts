import type { FrappeApp } from '@repo/frappe';
import { FileSaveError } from '@repo/platform/file';
import type { FileSaveOptions } from '@repo/platform/file';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveFile = vi.hoisted(() => vi.fn());
vi.mock(import('@repo/platform/file'), async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/platform/file')>()),
  saveFile,
}));

import { bulkExportCsv } from './bulk-export';

const rows = [
  { name: 'SO-2', customer: 'Acme, Inc.' },
  { name: 'SO-1', customer: 'Globex' },
];

function appWith(getDocList = vi.fn(async () => rows)) {
  return { db: () => ({ getDocList }) } as unknown as FrappeApp;
}

const meta = {
  name: 'Sales Order',
  fields: [{ fieldname: 'customer', fieldtype: 'Link' as const, in_list_view: 1 as const }],
};

describe('bulkExportCsv saves through the platform file API (MPO-22)', () => {
  beforeEach(() => {
    saveFile.mockReset();
  });

  it('hands the CSV bytes, filename and type to saveFile, in selection order', async () => {
    saveFile.mockResolvedValue({
      status: 'written',
      uri: 'content://provider/tree/sales-order.csv',
      requestedFilename: 'sales-order.csv',
      byteLength: 42,
    });
    const result = await bulkExportCsv(appWith(), 'Sales Order', ['SO-1', 'SO-2'], meta);

    const request = saveFile.mock.calls[0][0] as FileSaveOptions;
    expect(request.filename).toBe('sales-order.csv');
    expect(request.mimeType).toBe('text/csv;charset=utf-8');
    expect(new TextDecoder().decode(request.bytes)).toBe('name,customer\r\nSO-1,Globex\r\nSO-2,"Acme, Inc."');
    expect(result).toMatchObject({ rowCount: 2, downloaded: true, cancelled: false });
  });

  it('a web download request counts as downloaded', async () => {
    saveFile.mockResolvedValue({ status: 'download-requested' });
    const result = await bulkExportCsv(appWith(), 'Sales Order', ['SO-1'], meta);
    expect(result).toMatchObject({ downloaded: true, cancelled: false });
  });

  it('a cancelled native picker is not an unsupported platform', async () => {
    saveFile.mockResolvedValue({ status: 'not-saved', reason: 'cancelled-or-refused' });
    const result = await bulkExportCsv(appWith(), 'Sales Order', ['SO-1'], meta);
    expect(result).toMatchObject({ downloaded: false, cancelled: true });
  });

  it('a platform with no save path reports not downloaded and keeps the CSV', async () => {
    saveFile.mockRejectedValue(new FileSaveError('unavailable', 'no save path'));
    const result = await bulkExportCsv(appWith(), 'Sales Order', ['SO-1'], meta);
    expect(result).toMatchObject({ downloaded: false, cancelled: false });
    expect(result.csv.startsWith('name,customer')).toBe(true);
  });

  it('a failed write surfaces as an error', async () => {
    saveFile.mockRejectedValue(new FileSaveError('write-failed', 'disk full'));
    await expect(bulkExportCsv(appWith(), 'Sales Order', ['SO-1'], meta)).rejects.toMatchObject({
      code: 'write-failed',
    });
  });
});
