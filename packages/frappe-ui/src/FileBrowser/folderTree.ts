import type { TreeNode } from '@repo/ui';

import { buildTreeNodes } from '../FrappeTreeView';

import type { FileBrowserFile } from './types';

export function isFolder(file: FileBrowserFile): boolean {
  return file.is_folder === 1 || file.is_folder === true;
}

export function folderParent(folder?: string): string {
  return folder && folder.length > 0 ? folder : 'Home';
}

export function childrenOf(files: FileBrowserFile[], folderName: string): FileBrowserFile[] {
  return files.filter((file) => folderParent(file.folder) === folderName && file.name !== folderName);
}

export function buildFolderTree(files: FileBrowserFile[]): TreeNode<FileBrowserFile>[] {
  const folders = files.filter(isFolder).map((file) => ({
    ...file,
    name: file.name,
  }));
  return buildTreeNodes(folders, 'folder', 'file_name') as TreeNode<FileBrowserFile>[];
}

export function breadcrumbItems(folderName: string): { label: string; href: string }[] {
  const parts = folderName.split('/').filter(Boolean);
  if (parts.length === 0) {
    return [{ label: 'Home', href: 'Home' }];
  }
  return parts.map((label, index) => ({
    label,
    href: parts.slice(0, index + 1).join('/'),
  }));
}

export function parentFolder(folderName: string): string | undefined {
  const parts = folderName.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return undefined;
  }
  return parts.slice(0, -1).join('/');
}

/** Ancestor folder ids so TreeView reveals the open folder (not just the root). */
export function ancestorFolderIds(folderName: string): string[] {
  const parts = folderName.split('/').filter(Boolean);
  const ids: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ids.push(parts.slice(0, i).join('/'));
  }
  return ids;
}

export function fileKind(file: FileBrowserFile): 'folder' | 'image' | 'video' | 'text' | 'zip' | 'file' {
  if (isFolder(file)) {
    return 'folder';
  }
  const type = `${file.file_type ?? ''} ${file.file_name}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\b|$)/.test(type) || type.includes('image')) {
    return 'image';
  }
  if (/\.(mp4|mov|webm|mkv)(\b|$)/.test(type) || type.includes('video')) {
    return 'video';
  }
  if (/\.(zip|tar|gz|tgz|rar|7z)(\b|$)/.test(type) || type.includes('zip')) {
    return 'zip';
  }
  if (/\.(pdf|txt|md|csv|json|xml|doc)(\b|$)/.test(type) || type.includes('text')) {
    return 'text';
  }
  return 'file';
}
