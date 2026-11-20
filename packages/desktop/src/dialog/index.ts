export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface MessageDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
}

export interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
}

export interface DialogApi {
  open: (options?: OpenDialogOptions) => Promise<string | string[] | null>;
  save: (options?: SaveDialogOptions) => Promise<string | null>;
  message: (message: string, options?: MessageDialogOptions) => Promise<void>;
  ask: (message: string, options?: ConfirmDialogOptions) => Promise<boolean>;
  confirm: (message: string, options?: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

/**
 * The default `message`/`ask`/`confirm`/`prompt` are the browser's modal
 * globals, so they are **web-only** — not the "safe default every platform
 * gets" the docs used to claim.
 *
 * On a runtime whose `window` lacks `alert`, `confirm` or `prompt`, these
 * would dereference `undefined` and throw a bare `TypeError` from inside a
 * shared package, at whatever unrelated call site triggered a confirm.
 * Failing with a named error that says which platform is missing which
 * capability is strictly better than that, and better than the other
 * tempting option — quietly returning `false` — because a delete confirm
 * that silently answers "no" looks like a broken button, while one that
 * silently answers "yes" deletes something nobody confirmed.
 */
const browserWindow = (name: 'alert' | 'confirm' | 'prompt', api: string): Window => {
  // `typeof` because a non-browser runtime may not declare `window` at all; a bare reference would throw.
  const target = typeof window === 'undefined' ? undefined : window;
  // The DOM typings say these globals always exist; a stub window may lack them.
  if (target?.[name] == null) {
    throw new TypeError(
      `@repo/desktop: dialog.${api} needs window.${name}, which this platform does not have. ` +
        `The dialog defaults are the browser's modal globals and are web-only.`,
    );
  }
  return target;
};

const withTitle = (message: string, title?: string): string =>
  title === undefined || title === '' ? message : `${title}\n\n${message}`;

export const dialog: DialogApi = {
  async open(_options?: OpenDialogOptions): Promise<string | string[] | null> {
    // No browser equivalent that returns a path; an <input type="file"> hands
    // back a File, not a filename the fs API could then open.
    return null;
  },
  async save(_options?: SaveDialogOptions): Promise<string | null> {
    return null;
  },
  async message(message: string, options?: MessageDialogOptions): Promise<void> {
    browserWindow('alert', 'message').alert(withTitle(message, options?.title));
  },
  async ask(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return browserWindow('confirm', 'ask').confirm(withTitle(message, options?.title));
  },
  async confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return browserWindow('confirm', 'confirm').confirm(withTitle(message, options?.title));
  },
  async prompt(message: string, defaultValue = ''): Promise<string | null> {
    return browserWindow('prompt', 'prompt').prompt(message, defaultValue);
  },
};
