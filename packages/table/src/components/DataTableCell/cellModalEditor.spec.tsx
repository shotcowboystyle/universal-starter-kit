/**
 * CellModalEditor on web (MPO-221): the tall-field editor is a FloatingPanel
 * attached to the cell it was opened from, the same primitive the native
 * variant uses, not a centered Dialog. The panel owns the SF-OVERLAY /
 * E-OVERLAY surface (elevatedSurface); the staging contract rides on top.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(import('@repo/forms'), async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/forms')>()),
  FieldDisplay: (props: { field?: string }) =>
    React.createElement('div', {
      'data-testid': 'mock-FieldDisplay',
      'data-field': props.field,
    }),
  Button: ({ children, onPress, ...props }: { children?: React.ReactNode; onPress?: (event: unknown) => void }) =>
    React.createElement('button', { type: 'button', ...props, onClick: onPress }, children),
}));

import { CellModalEditor } from './CellModalEditor';

const panel = () => document.querySelector('[data-testid="floating-panel-viewport"]');

function renderEditor(onCommit = vi.fn()) {
  const utils = renderWithProviders(
    <CellModalEditor
      field="textarea"
      value="hello"
      onCommit={onCommit}
      title="Edit text"
      label="Notes">
      {(draft, onDraftChange) =>
        React.createElement('textarea', {
          'data-testid': 'draft-editor',
          value: draft,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            onDraftChange(event.target.value);
          },
        })
      }
    </CellModalEditor>,
  );
  return { ...utils, onCommit };
}

describe('CellModalEditor on web — FloatingPanel, not a Dialog (MPO-221)', () => {
  it('opens the editor inside the FloatingPanel viewport', async () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('mock-FieldDisplay'));
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    expect(panel()!.contains(screen.getByTestId('draft-editor'))).toBe(true);
    expect(panel()!.textContent).toContain('Edit text');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it("anchors to the cell trigger: the panel's reference wraps the cell face", async () => {
    renderEditor();
    const face = screen.getByTestId('mock-FieldDisplay');
    expect(face.closest('[data-fp-reference]')).not.toBeNull();
    fireEvent.click(face);
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    expect(panel()!.style.position).toBe('fixed');
  });

  it('an outside click commits the draft (LC-21)', async () => {
    const { onCommit } = renderEditor();
    fireEvent.click(screen.getByTestId('mock-FieldDisplay'));
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    fireEvent.change(screen.getByTestId('draft-editor'), { target: { value: 'changed' } });
    fireEvent.click(document.body);
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('changed');
  });

  it('Escape discards the draft', async () => {
    const { onCommit } = renderEditor();
    fireEvent.click(screen.getByTestId('mock-FieldDisplay'));
    await waitFor(() => {
      expect(panel()).not.toBeNull();
    });
    const editor = screen.getByTestId('draft-editor');
    fireEvent.change(editor, { target: { value: 'changed' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('the web source no longer mounts a Tamagui Dialog', () => {
    const source = readFileSync(join(__dirname, 'CellModalEditor.tsx'), 'utf-8');
    expect(source).not.toMatch(/\bDialog\b.*from "tamagui"/);
    expect(source).not.toMatch(/DialogContent|DialogOverlay/);
    expect(source).toMatch(/<FloatingPanel/);
  });
});
