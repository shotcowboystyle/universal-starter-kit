import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../fieldRegistry';

import type { FileBrowserFile } from './types';
import { readPersistedView } from './viewPersistence';

import { FileBrowser } from './index';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

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
    modified: '2026-08-12',
  },
  {
    name: 'img-1',
    file_name: 'topology.png',
    folder: 'Home/Invoices',
    file_size: 612_000,
    file_type: 'png',
    file_url: '/files/topology.png',
    modified: '2026-08-09',
  },
];

function folderState(container: HTMLElement) {
  return container.querySelector('[data-filebrowser-folders-state]')?.dataset.filebrowserFoldersState;
}

function filesState(container: HTMLElement) {
  return container.querySelector('[data-filebrowser-files-state]')?.dataset.filebrowserFilesState;
}

describe('FileBrowser panes — four states (DG-TBL-06)', () => {
  it('folders pane: ready, loading, empty, error', () => {
    const { container, rerender } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
      />,
    );
    expect(folderState(container)).toBe('ready');

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        foldersStatus="loading"
      />,
    );
    expect(folderState(container)).toBe('loading');

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        foldersStatus="empty"
      />,
    );
    expect(folderState(container)).toBe('empty');
    expect(screen.getByText('No folders')).toBeTruthy();

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        foldersStatus="error"
        foldersError="timed out"
      />,
    );
    expect(folderState(container)).toBe('error');
    expect(screen.getByText("Couldn't load folders")).toBeTruthy();
  });

  it('files pane: ready, loading, empty, error', () => {
    const { container, rerender } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
      />,
    );
    expect(filesState(container)).toBe('ready');

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        filesStatus="loading"
      />,
    );
    expect(filesState(container)).toBe('loading');

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        filesStatus="empty"
      />,
    );
    expect(filesState(container)).toBe('empty');
    expect(screen.getByText('No files')).toBeTruthy();

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        filesStatus="error"
        filesError="timed out"
      />,
    );
    expect(filesState(container)).toBe('error');
    expect(screen.getByText("Couldn't load files")).toBeTruthy();
  });

  it('empty and error are visually distinct (DG-ST-01)', () => {
    const { container, rerender } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        foldersStatus="empty"
        filesStatus="empty"
      />,
    );
    expect(container.querySelectorAll('[data-async-state="empty"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-async-state="error"]')).toBeNull();
    expect(screen.queryByText("Couldn't load folders")).toBeNull();
    expect(screen.queryByText("Couldn't load files")).toBeNull();

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        foldersStatus="error"
        filesStatus="error"
        foldersError
        filesError
      />,
    );
    expect(container.querySelectorAll('[data-async-state="error"]').length).toBeGreaterThan(0);
    expect(screen.getByText("Couldn't load folders")).toBeTruthy();
    expect(screen.getByText("Couldn't load files")).toBeTruthy();
    expect(screen.queryByText('No folders')).toBeNull();
    expect(screen.queryByText('No files')).toBeNull();
  });
});

describe('FileBrowser grid skeleton (LC-20)', () => {
  it("renders the skeleton at the grid's mediaAspect", () => {
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        view="grid"
        filesStatus="loading"
        mediaAspect="photo"
        tileSize="md"
      />,
    );
    const skeleton = container.querySelector("[data-async-skeleton='image-grid']");
    expect(skeleton).toBeTruthy();
    expect(skeleton?.dataset.mediaAspect).not.toBeNull();
    expect(Number(skeleton?.dataset.mediaAspect)).not.toBe(1);
    expect(container.querySelector("[data-filebrowser-tile-size='md']")).toBeTruthy();
  });
});

describe('FileBrowser composition', () => {
  it('keeps folders in the tree and files out of it', () => {
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
      />,
    );
    const tree = container.querySelector('[data-filebrowser-folders]');
    expect(tree?.textContent).toContain('Invoices');
    expect(tree?.textContent).not.toContain('invoice.pdf');
    expect(container.querySelector('[data-filebrowser-files]')?.textContent).toContain('invoice.pdf');
  });

  it('collapses to drill-in without shipping the pointer tree', () => {
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="drill"
        currentFolder="Home/Invoices"
      />,
    );
    expect(container.querySelector("[data-filebrowser-layout='drill']")).toBeTruthy();
    expect(container.querySelector("[data-filebrowser-folders] [role='tree']")).toBeNull();
    expect(container.querySelector('[data-filebrowser-back]')).toBeTruthy();
  });

  it('drill grid pane chain uses flexBasis auto so the wall can grow the frame (MPO-423)', () => {
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="drill"
        view="grid"
        currentFolder="Home/Invoices"
        tileSize="md"
      />,
    );
    const files = container.querySelector('[data-filebrowser-files]') as HTMLElement | null;
    const grid = container.querySelector("[data-filebrowser-files-view='grid']") as HTMLElement | null;
    expect(files).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(getComputedStyle(files!).flexBasis).toBe('auto');
    expect(getComputedStyle(grid!).flexBasis).toBe('auto');
    expect(container.querySelectorAll('[data-filebrowser-tile]')).toHaveLength(2);
  });

  it('multi-select shows checkboxes; Attach pick mode does not', () => {
    const { container, rerender } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        selectionMode="multi"
      />,
    );
    expect(container.querySelector("[data-filebrowser-selection='multi']")).toBeTruthy();
    expect(container.querySelectorAll('[role="checkbox"]').length).toBeGreaterThan(0);

    rerender(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        selectionMode="single"
        currentValue="/files/invoice.pdf"
      />,
    );
    expect(container.querySelector("[data-filebrowser-selection='single']")).toBeTruthy();
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  });

  it('persists view per surface and uses the tileSize rung, never a column literal', () => {
    const onViewChange = vi.fn();
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        surfaceId="desk-files"
        defaultView="list"
        onViewChange={onViewChange}
        tileSize="lg"
      />,
    );
    expect(container.querySelector("[data-filebrowser-view='list']")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(onViewChange).toHaveBeenCalledWith('grid');
    expect(readPersistedView('desk-files')).toBe('grid');
    expect(container.querySelector("[data-filebrowser-tile-size='lg']")).toBeTruthy();
    expect(container.querySelector("[data-filebrowser-tile-size='280']")).toBeNull();
  });

  it('honours bulkBarPlacement, tableZebra, and selectedIds on the frame', () => {
    const { container } = renderWithProviders(
      <FileBrowser
        files={FIXTURE}
        layout="split"
        currentFolder="Home/Invoices"
        selectedIds={['inv-1']}
        bulkBarPlacement="bottom"
        tableZebra
      />,
    );
    expect(container.querySelector("[data-filebrowser-zebra='on']")).toBeTruthy();
    expect(container.querySelector("[data-filebrowser-bulk-placement='bottom']")).toBeTruthy();
    expect(container.textContent).toMatch(/1 selected/);
  });
});

describe('Attach choose-from-library tab', () => {
  it("serves FileBrowser as Attach's library tab", async () => {
    const AttachField = getFieldComponent('Attach')!;
    const onChange = vi.fn();
    renderWithProviders(
      <AttachField
        label="Attachment"
        value={null}
        onChange={onChange}
        libraryFiles={FIXTURE}
        libraryFolder="Home/Invoices"
      />,
    );
    expect(screen.getByText(/Choose File/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /From Library/i }));
    expect(screen.getByRole('tab', { name: /From library/i })).toBeTruthy();
    expect(document.querySelector("[data-filebrowser-selection='single']")).toBeTruthy();
    expect(document.querySelectorAll("[data-filebrowser] [role='checkbox']")).toHaveLength(0);
    // The registry feed must actually reach the browser: the fixture's files
    // render as rows. Asserting only the tab shell let 035867446's dropped
    // pass-through stay green — an empty library looked identical to a fed one.
    expect(screen.getByText('invoice.pdf')).toBeTruthy();
    expect(screen.getByText('topology.png')).toBeTruthy();
  });
});
