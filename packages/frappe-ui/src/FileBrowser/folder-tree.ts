import type { TreeNode } from '@repo/ui';

import { buildTreeNodes } from '../FrappeTreeView';

import type { FileBrowserFile } from './types';

export const isFolder = (file: FileBrowserFile): boolean => file.is_folder === 1 || file.is_folder === true;

export const folderParent = (folder?: string): string => (folder !== undefined && folder.length > 0 ? folder : 'Home');

export const childrenOf = (files: FileBrowserFile[], folderName: string): FileBrowserFile[] =>
  files.filter((file) => folderParent(file.folder) === folderName && file.name !== folderName);

export const buildFolderTree = (files: FileBrowserFile[]): TreeNode<FileBrowserFile>[] => {
  const folders = files.flatMap((file) => (isFolder(file) ? [{ ...file }] : []));
  // SAFETY: buildTreeNodes stores each input doc as its node's `data`; the input docs are FileBrowserFiles
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above; buildTreeNodes erases the doc type to Record<string, unknown>
  return buildTreeNodes(folders, 'folder', 'file_name') as unknown as TreeNode<FileBrowserFile>[];
};

export const breadcrumbItems = (folderName: string): { label: string; href: string }[] => {
  const parts = folderName.split('/').filter(Boolean);
  if (parts.length === 0) {
    return [{ label: 'Home', href: 'Home' }];
  }
  return parts.map((label, index) => ({
    label,
    href: parts.slice(0, index + 1).join('/'),
  }));
};

export const parentFolder = (folderName: string): string | undefined => {
  const parts = folderName.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return undefined;
  }
  return parts.slice(0, -1).join('/');
};

/** Ancestor folder ids so TreeView reveals the open folder (not just the root). */
export const ancestorFolderIds = (folderName: string): string[] => {
  const parts = folderName.split('/').filter(Boolean);
  const ids: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    ids.push(parts.slice(0, i).join('/'));
  }
  return ids;
};

type FileKind = 'folder' | 'image' | 'video' | 'text' | 'zip' | 'file';

export const fileKind = (file: FileBrowserFile): FileKind => {
  if (isFolder(file)) {
    return 'folder';
  }
  const type = `${file.file_type ?? ''} ${file.file_name}`.toLowerCase();
  if (/\.(?:png|jpe?g|gif|webp|svg|avif)(?:\b|$)/u.test(type) || type.includes('image')) {
    return 'image';
  }
  if (/\.(?:mp4|mov|webm|mkv)(?:\b|$)/u.test(type) || type.includes('video')) {
    return 'video';
  }
  if (/\.(?:zip|tar|gz|tgz|rar|7z)(?:\b|$)/u.test(type) || type.includes('zip')) {
    return 'zip';
  }
  if (/\.(?:pdf|txt|md|csv|json|xml|doc)(?:\b|$)/u.test(type) || type.includes('text')) {
    return 'text';
  }
  return 'file';
};
