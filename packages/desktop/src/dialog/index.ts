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
  open(options?: OpenDialogOptions): Promise<string | string[] | null>;
  save(options?: SaveDialogOptions): Promise<string | null>;
  message(message: string, options?: MessageDialogOptions): Promise<void>;
  ask(message: string, options?: ConfirmDialogOptions): Promise<boolean>;
  confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean>;
  prompt(message: string, defaultValue?: string): Promise<string | null>;
}

/**
 * The default `message`/`ask`/`confirm`/`prompt` are the browser's modal
 * globals, so they are **web-only** — not the "safe default every platform
 * gets" the docs used to claim.
 *
 * GJS is the case that matters: react-gnome's polyfills define a stub
 * `window` with no `alert`, `confirm` or `prompt` on it, so these used to
 * dereference `undefined` and throw a bare `TypeError` from inside a shared
 * package, at whatever unrelated call site happened to trigger a confirm.
 * Failing with a named error that says which platform is missing which
 * capability is strictly better than that, and better than the other
 * tempting option — quietly returning `false` — because a delete confirm
 * that silently answers "no" looks like a broken button, while one that
 * silently answers "yes" deletes something nobody confirmed.
 *
 * The real fix is `dialog/index.gnome.ts` on `Adw.AlertDialog`, resolved by
 * the `.gnome.*` extensions the GNOME vite config registers. Until then this
 * throws, loudly, on GNOME.
 */
function browserDialog<Name extends 'alert' | 'confirm' | 'prompt'>(
  name: Name,
  api: string,
): NonNullable<Window[Name]> {
  const fn = typeof window === 'undefined' ? undefined : window[name];
  if (typeof fn !== 'function') {
    throw new TypeError(
      `@repo/desktop: dialog.${api} needs window.${name}, which this platform does not have. ` +
        `The dialog defaults are the browser's modal globals and are web-only; GNOME needs an Adw.AlertDialog ` +
        `backend in dialog/index.gnome.ts.`,
    );
  }
  return fn.bind(window) as NonNullable<Window[Name]>;
}

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
    browserDialog('alert', 'message')(options?.title ? `${options.title}\n\n${message}` : message);
  },
  async ask(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return browserDialog('confirm', 'ask')(options?.title ? `${options.title}\n\n${message}` : message);
  },
  async confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    return browserDialog('confirm', 'confirm')(options?.title ? `${options.title}\n\n${message}` : message);
  },
  async prompt(message: string, defaultValue = ''): Promise<string | null> {
    return browserDialog('prompt', 'prompt')(message, defaultValue);
  },
};
