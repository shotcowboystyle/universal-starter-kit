import {
  open as tauriOpen,
  save as tauriSave,
  message as tauriMessage,
  ask as tauriAsk,
  confirm as tauriConfirm,
} from '@tauri-apps/plugin-dialog';

import type {
  DialogApi,
  OpenDialogOptions,
  SaveDialogOptions,
  MessageDialogOptions,
  ConfirmDialogOptions,
} from './index';

export const dialog: DialogApi = {
  async open(options?: OpenDialogOptions): Promise<string | string[] | null> {
    const result = await tauriOpen({
      title: options?.title,
      defaultPath: options?.defaultPath,
      filters: options?.filters,
      multiple: options?.multiple,
      directory: options?.directory,
    });
    return result;
  },
  async save(options?: SaveDialogOptions): Promise<string | null> {
    const result = await tauriSave({
      title: options?.title,
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    return result;
  },
  async message(message: string, options?: MessageDialogOptions): Promise<void> {
    await tauriMessage(message, {
      title: options?.title,
      kind: options?.kind,
      okLabel: options?.okLabel,
    });
  },
  async ask(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return await tauriAsk(message, {
      title: options?.title,
      kind: options?.kind,
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  },
  async confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return await tauriConfirm(message, {
      title: options?.title,
      kind: options?.kind,
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  },
  async prompt(_message: string, _defaultValue?: string): Promise<string | null> {
    return null;
  },
};

export type {
  DialogApi,
  OpenDialogOptions,
  SaveDialogOptions,
  MessageDialogOptions,
  ConfirmDialogOptions,
} from './index';
