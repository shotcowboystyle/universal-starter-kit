import type { MediaAspect, TileSizeRung } from '@repo/theme';

export type FileBrowserView = 'list' | 'grid';
export type FileBrowserLayout = 'split' | 'drill';
export type FileBrowserSelectionMode = 'multi' | 'single';
export type FileBrowserPaneStatus = 'ready' | 'loading' | 'empty' | 'error';
export type FileBrowserSelectAllScope = 'page' | 'filtered';
export type FileBrowserBulkBarPlacement = 'top' | 'bottom';

/** One File-doctype row (folder or file). */
export interface FileBrowserFile {
  name: string;
  file_name: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  folder?: string;
  is_folder?: number | boolean;
  modified?: string;
}

export interface FileBrowserProps {
  /** Fixture / controlled File rows. Omit to load the live File doctype. */
  files?: FileBrowserFile[];
  foldersStatus?: FileBrowserPaneStatus;
  filesStatus?: FileBrowserPaneStatus;
  foldersError?: boolean | string | Error;
  filesError?: boolean | string | Error;
  onFoldersRetry?: () => void;
  onFilesRetry?: () => void;
  view?: FileBrowserView;
  defaultView?: FileBrowserView;
  onViewChange?: (view: FileBrowserView) => void;
  /** Persist list|grid per surface (localStorage). Not a theme knob. */
  surfaceId?: string;
  selectionMode?: FileBrowserSelectionMode;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Attach library current value — trailing 14×14 check (LC-21). */
  currentValue?: string;
  onPick?: (file: FileBrowserFile) => void;
  currentFolder?: string;
  onCurrentFolderChange?: (folder: string) => void;
  tileSize?: TileSizeRung;
  mediaAspect?: MediaAspect;
  selectAllScope?: FileBrowserSelectAllScope;
  bulkBarPlacement?: FileBrowserBulkBarPlacement;
  tableZebra?: boolean;
  /** Test / story override. Default: split ≥640, drill-in below. */
  layout?: FileBrowserLayout;
  /** Opens the in-pane FileUpload (same forms control Attach uses). */
  onUpload?: (file: File) => unknown;
  search?: string;
  onSearchChange?: (query: string) => void;
  onOpen?: (file: FileBrowserFile) => void;
  onDownload?: (files: FileBrowserFile[]) => void;
  onRename?: (file: FileBrowserFile) => void;
  onMove?: (files: FileBrowserFile[]) => void;
  onDelete?: (files: FileBrowserFile[]) => void;
  accept?: string;
}
