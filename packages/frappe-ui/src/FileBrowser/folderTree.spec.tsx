import { describe, expect, it } from 'vitest';

import { ancestorFolderIds, breadcrumbItems, childrenOf, fileKind, isFolder, parentFolder } from './folderTree';
import type { FileBrowserFile } from './types';

const FIXTURE: FileBrowserFile[] = [
  { name: 'Home', file_name: 'Home', folder: '', is_folder: 1 },
  { name: 'Home/Invoices', file_name: 'Invoices', folder: 'Home', is_folder: 1 },
  {
    name: 'inv-1',
    file_name: 'invoice.pdf',
    folder: 'Home/Invoices',
    file_size: 72_400,
    file_type: 'pdf',
    file_url: '/files/invoice.pdf',
  },
  {
    name: 'img-1',
    file_name: 'topology.png',
    folder: 'Home/Invoices',
    file_type: 'png',
  },
];

describe('folderTree helpers', () => {
  it('treats is_folder 1 or true as a folder, never a file', () => {
    expect(isFolder({ name: 'a', file_name: 'a', is_folder: 1 })).toBe(true);
    expect(isFolder({ name: 'b', file_name: 'b', is_folder: true })).toBe(true);
    expect(isFolder({ name: 'c', file_name: 'c.pdf', is_folder: 0 })).toBe(false);
  });

  it('lists children of the open folder and keeps files out of the parent listing', () => {
    const kids = childrenOf(FIXTURE, 'Home/Invoices');
    expect(kids.map((file) => file.file_name)).toEqual(['invoice.pdf', 'topology.png']);
    expect(childrenOf(FIXTURE, 'Home').map((file) => file.file_name)).toEqual(['Invoices']);
  });

  it('builds breadcrumb hrefs from the folder path', () => {
    expect(breadcrumbItems('Home/Invoices')).toEqual([
      { label: 'Home', href: 'Home' },
      { label: 'Invoices', href: 'Home/Invoices' },
    ]);
  });

  it('returns the parent folder, and nothing above Home', () => {
    expect(parentFolder('Home/Invoices')).toBe('Home');
    expect(parentFolder('Home')).toBeUndefined();
  });

  it('expands ancestor ids so the rail can reveal the open folder', () => {
    expect(ancestorFolderIds('Home/Invoices/2026')).toEqual(['Home', 'Home/Invoices']);
    expect(ancestorFolderIds('Home')).toEqual([]);
  });

  it('classifies by file_type and extension, folders first', () => {
    expect(fileKind(FIXTURE[1])).toBe('folder');
    expect(fileKind(FIXTURE[2])).toBe('text');
    expect(fileKind(FIXTURE[3])).toBe('image');
    expect(fileKind({ name: 'z', file_name: 'archive.zip' })).toBe('zip');
    expect(fileKind({ name: 'v', file_name: 'clip.mp4' })).toBe('video');
  });
});
