import { YStack } from 'tamagui';

import type { FileBrowserFile } from './types';

import { FileBrowser } from '.';

const INVOICES_FOLDER = 'Home/Invoices';

const files: FileBrowserFile[] = [
  { name: 'Home', file_name: 'Home', folder: '', is_folder: 1 },
  { name: INVOICES_FOLDER, file_name: 'Invoices', folder: 'Home', is_folder: 1 },
  { name: 'Home/Library', file_name: 'Library', folder: 'Home', is_folder: 1 },
  {
    name: 'inv-1',
    file_name: 'hetzner-hel1-invoice-aug.pdf',
    folder: INVOICES_FOLDER,
    file_size: 72_400,
    file_type: 'pdf',
    file_url: '/files/invoice.pdf',
    modified: '2026-08-12',
  },
  {
    name: 'img-1',
    file_name: 'swarm01-topology.png',
    folder: INVOICES_FOLDER,
    file_size: 612_000,
    file_type: 'png',
    file_url: '/files/topology.png',
    modified: '2026-08-09',
  },
];

export default {
  title: 'FrappeUI/FileBrowser',
  component: FileBrowser,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "File doctype browser: TreeView folders rail + DataTable/ImageGrid files pane. Doubles as Attach's choose-from-library tab.",
      },
    },
  },
};

export const Main = () => (
  <FileBrowser
    files={files}
    layout="split"
    currentFolder="Home/Invoices"
    surfaceId="story-split"
  />
);

/** Board measure script still addresses this CSF id. */
export const SplitList = Main;

export const SplitGrid = () => (
  <FileBrowser
    files={files}
    layout="split"
    view="grid"
    tileSize="md"
    mediaAspect="square"
    currentFolder="Home/Invoices"
    surfaceId="story-grid"
  />
);

export const DrillIn = () => (
  <YStack width={390}>
    <FileBrowser
      files={files}
      layout="drill"
      currentFolder="Home"
      surfaceId="story-drill"
    />
  </YStack>
);

/** Drilled-into files list at 390 — DrillIn pins Home so a row press cannot navigate. */
export const DrillInFiles = () => (
  <YStack width={390}>
    <FileBrowser
      files={files}
      layout="drill"
      currentFolder="Home/Invoices"
      surfaceId="story-drill-files"
    />
  </YStack>
);

/** Drill layout grid of the drilled-into files list (board 05 / MPO-423). */
export const DrillInGrid = () => (
  <YStack width={390}>
    <FileBrowser
      files={files}
      layout="drill"
      view="grid"
      tileSize="md"
      mediaAspect="square"
      currentFolder="Home/Invoices"
      surfaceId="story-drill-grid"
    />
  </YStack>
);

export const AttachPick = () => (
  <FileBrowser
    files={files}
    layout="split"
    selectionMode="single"
    currentValue="/files/invoice.pdf"
    currentFolder="Home/Invoices"
    surfaceId="story-attach"
  />
);

export const Knobs = () => (
  <FileBrowser
    files={files}
    layout="split"
    currentFolder="Home/Invoices"
    view="list"
    selectAllScope="filtered"
    bulkBarPlacement="bottom"
    tableZebra
    selectedIds={['inv-1']}
    surfaceId="story-knobs"
  />
);

export const FourStates = () => (
  <YStack gap="$4">
    <FileBrowser
      files={files}
      layout="split"
      currentFolder="Home/Invoices"
      foldersStatus="loading"
    />
    <FileBrowser
      files={files}
      layout="split"
      currentFolder="Home/Invoices"
      filesStatus="empty"
    />
    <FileBrowser
      files={files}
      layout="split"
      currentFolder="Home/Invoices"
      filesStatus="error"
      filesError="timed out"
      // DG-VAL-04: the drawn error face carries its CTA — without a retry
      // handler AsyncBoundary honestly draws none and the board shows a
      // truncated error state.
      onFilesRetry={() => {
        // The story only needs the CTA drawn; retrying does nothing here.
      }}
    />
  </YStack>
);
