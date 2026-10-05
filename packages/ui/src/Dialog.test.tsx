import { renderWithProviders } from '@repo/test-utils';
import { X } from '@tamagui/lucide-icons-2';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AlertDialog as TamaguiAlertDialog, Dialog as TamaguiDialog } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AlertDialog, Button, Dialog } from './index';

const catalog = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock('./shared/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => catalog.current[key] ?? key }),
}));

afterEach(() => {
  cleanup();
  catalog.current = {};
});

function OpenDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog open>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title>Edit profile</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

function OpenAlertDialog({ children }: { children: ReactNode }) {
  return (
    <AlertDialog open>
      <AlertDialog.Portal>
        <AlertDialog.Content>
          <AlertDialog.Title>Delete account?</AlertDialog.Title>
          {children}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}

const noDialogClose = () => {
  expect(screen.queryAllByRole('button', { name: 'Dialog Close' })).toHaveLength(0);
};

describe('house Dialog.Close is named by what it shows', () => {
  it("keeps each asChild button's visible label as its accessible name", () => {
    renderWithProviders(
      <OpenDialog>
        <Dialog.Close asChild>
          <Button>Cancel</Button>
        </Dialog.Close>
        <Dialog.Close asChild>
          <Button theme="accent">Save changes</Button>
        </Dialog.Close>
      </OpenDialog>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    noDialogClose();
  });

  it('names a bare close with text by that text', () => {
    renderWithProviders(
      <OpenDialog>
        <Dialog.Close>Done</Dialog.Close>
      </OpenDialog>,
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    noDialogClose();
  });

  it('gives an icon-only close the localized Close', () => {
    catalog.current = { Close: 'మూసివేయి' };
    renderWithProviders(
      <OpenDialog>
        <Dialog.Close asChild>
          <Button circular icon={X} />
        </Dialog.Close>
        <Dialog.Close>
          <X />
        </Dialog.Close>
      </OpenDialog>,
    );
    expect(screen.getAllByRole('button', { name: 'మూసివేయి' })).toHaveLength(2);
    noDialogClose();
  });

  it('keeps an explicit label on the part or its child', () => {
    renderWithProviders(
      <OpenDialog>
        <Dialog.Close asChild>
          <Button circular icon={X} aria-label="Close dialog" />
        </Dialog.Close>
        <Dialog.Close aria-label="Dismiss">
          <X />
        </Dialog.Close>
      </OpenDialog>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('still closes the dialog', async () => {
    renderWithProviders(
      <Dialog defaultOpen>
        <Dialog.Portal>
          <Dialog.Content>
            <Dialog.Title>Edit profile</Dialog.Title>
            <Dialog.Close asChild>
              <Button>Cancel</Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Edit profile')).toBeNull();
    });
  });

  it("changes only Close; every other part is tamagui's", () => {
    expect(Dialog.Close).not.toBe(TamaguiDialog.Close);
    for (const part of ['Trigger', 'Portal', 'Overlay', 'Content', 'Title', 'Description']) {
      expect(Dialog[part as keyof typeof Dialog]).toBe(TamaguiDialog[part as keyof typeof TamaguiDialog]);
    }
  });
});

describe('house AlertDialog Cancel and Action are named by what they show', () => {
  it("keeps each asChild button's visible label as its accessible name", () => {
    renderWithProviders(
      <OpenAlertDialog>
        <AlertDialog.Cancel asChild>
          <Button>Cancel</Button>
        </AlertDialog.Cancel>
        <AlertDialog.Action asChild>
          <Button theme="error">Yes, delete</Button>
        </AlertDialog.Action>
        <AlertDialog.Destructive asChild>
          <Button theme="error">Delete forever</Button>
        </AlertDialog.Destructive>
      </OpenAlertDialog>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeTruthy();
    noDialogClose();
  });

  it("changes only the close parts; every other part is tamagui's", () => {
    for (const part of ['Cancel', 'Action', 'Destructive'] as const) {
      expect(AlertDialog[part]).not.toBe(TamaguiAlertDialog[part]);
    }
    for (const part of ['Trigger', 'Portal', 'Overlay', 'Content', 'Title', 'Description']) {
      expect(AlertDialog[part as keyof typeof AlertDialog]).toBe(
        TamaguiAlertDialog[part as keyof typeof TamaguiAlertDialog],
      );
    }
  });
});
