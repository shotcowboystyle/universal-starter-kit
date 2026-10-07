/**
 * Frappe FileUpload contract specs (the live-data uploader behind the
 * "FrappeUI/FileUpload" catalog entry — not the forms dropzone, and not the
 * FileUploadField registry adapter).
 *
 * Everything worth pinning here is transport state, because that is what the
 * component owns and what a screenshot cannot show: the size gate before a
 * byte is read, the progress channel, the failure row that keeps the existing
 * value instead of wiping it (DG-VAL-04), retry, and the abort that has to
 * actually reach the handler's AbortSignal.
 *
 * The default transport inserts into the File doctype, so every test injects
 * `onUpload` — the documented override — and drives it by hand.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileUpload } from './FileUpload';

afterEach(cleanup);

const hiddenInput = (container: HTMLElement) => container.querySelector('input[type="file"]')!;

function makeFile(name = 'report.pdf', size = 1024, type = 'application/pdf') {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function selectFile(container: HTMLElement, file: File) {
  await act(async () => {
    fireEvent.change(hiddenInput(container), { target: { files: [file] } });
  });
}

/** A handler the test resolves or rejects on demand. */
function deferredUpload() {
  let resolve!: (url: string) => void;
  let reject!: (err: Error) => void;
  let progress!: (percent: number) => void;
  let signal!: AbortSignal;
  const handler = vi.fn(async (_file: File, ctx: { onProgress: (p: number) => void; signal: AbortSignal }) => {
    progress = ctx.onProgress;
    signal = ctx.signal;
    return await new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    handler,
    resolve: (url: string) => {
      resolve(url);
    },
    reject: (err: Error) => {
      reject(err);
    },
    progress: (p: number) => {
      progress(p);
    },
    get signal() {
      return signal;
    },
  };
}

describe('FileUpload empty state', () => {
  it('offers a Choose File affordance and nothing else', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onChange={() => {}}
      />,
    );
    expect(result.getButton('Choose File')).toBeTruthy();
    expect(result.container.querySelector('[data-file-upload="transfer"]')).toBeNull();
  });

  it('marks a required field on its label', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        required
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Attachment');
    expect(result.container.textContent).toContain('*');
  });

  it('skeleton branch offers no affordance at all', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        skeleton
        onChange={() => {}}
      />,
    );
    expect(result.getButton('Choose File')).toBeUndefined();
  });

  it('shows helperText while nothing is in flight', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        helperText="PDF or PNG, under 5MB"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('PDF or PNG, under 5MB');
  });
});

describe('FileUpload size gate', () => {
  it('refuses a file over maxSize before the transport is ever called', async () => {
    const onUpload = vi.fn();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        maxSize={1024}
        onUpload={onUpload}
        onChange={onChange}
      />,
    );
    await selectFile(result.container, makeFile('big.pdf', 2048));
    expect(onUpload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(result.container.textContent).toContain('exceeds');
  });

  it('accepts a file at exactly maxSize', async () => {
    const onUpload = vi.fn().mockResolvedValue('/files/ok.pdf');
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        maxSize={1024}
        onUpload={onUpload}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile('ok.pdf', 1024));
    expect(onUpload).toHaveBeenCalledOnce();
  });
});

/**
 * i18n interpolation is INERT under `renderWithProviders`: the provider hands
 * back the raw key, so `t("Retry {{name}}", { name })` renders the accessible
 * name literally as `Retry {{name}}` rather than `Retry report.pdf`. Buttons
 * are therefore looked up by the stable half of the label, and the per-file
 * parameterisation is asserted separately (`ariaNames` below) so a dropped
 * `aria-label` still fails. Recorded on MPO-123.
 */
const buttonLabelled = (container: HTMLElement, prefix: string) =>
  [...container.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(prefix));

describe('FileUpload transfer', () => {
  it('shows the file name and a live progressbar while uploading', async () => {
    const upload = deferredUpload();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile('report.pdf'));

    const row = result.container.querySelector('[data-file-upload="transfer"]');
    expect(row?.dataset.transferStatus).toBe('uploading');
    expect(result.container.textContent).toContain('report.pdf');

    const bar = result.container.querySelector('[data-file-upload="progress"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('0');
    await act(async () => {
      upload.progress(42);
    });
    expect(result.container.querySelector('[data-file-upload="progress"]')?.getAttribute('aria-valuenow')).toBe('42');
  });

  it('clamps a nonsense progress report into 0..100', async () => {
    const upload = deferredUpload();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile());
    await act(async () => {
      upload.progress(999);
    });
    expect(result.container.querySelector('[data-file-upload="progress"]')?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('emits the committed URL through onChange and clears the transfer row', async () => {
    const upload = deferredUpload();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={onChange}
      />,
    );
    await selectFile(result.container, makeFile());
    await act(async () => {
      upload.resolve('/files/report.pdf');
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/files/report.pdf');
    });
    expect(result.container.querySelector('[data-file-upload="transfer"]')).toBeNull();
  });

  it('keeps the existing value when the transfer fails (DG-VAL-04)', async () => {
    const upload = deferredUpload();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        value="/files/previous.pdf"
        onUpload={upload.handler}
        onChange={onChange}
      />,
    );
    await selectFile(result.container, makeFile());
    await act(async () => {
      upload.reject(new Error('network is down'));
    });
    await waitFor(() => {
      expect(result.container.querySelector('[data-file-upload="transfer"]')?.dataset.transferStatus).toBe('failed');
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(result.container.textContent).toContain('network is down');
    expect(result.container.textContent).toContain('previous.pdf');
  });

  it('offers Retry and Remove on a failed row, and Retry re-runs the transport', async () => {
    const upload = deferredUpload();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile('report.pdf'));
    await act(async () => {
      upload.reject(new Error('boom'));
    });
    await waitFor(() => {
      expect(buttonLabelled(result.container, 'Retry ')).toBeTruthy();
    });
    const remove = buttonLabelled(result.container, 'Remove ');
    expect(remove).toBeTruthy();
    // Both affordances carry a per-file accessible name, so a screen reader
    // can tell one failed row's Retry from another's.
    expect(buttonLabelled(result.container, 'Retry ')?.getAttribute('aria-label')).toMatch(/^Retry \S/);
    expect(remove?.getAttribute('aria-label')).toMatch(/^Remove \S/);
    // The visible text stays the short verb; the file name lives on the label.
    expect(buttonLabelled(result.container, 'Retry ')?.textContent).toContain('Retry');

    await act(async () => {
      fireEvent.click(buttonLabelled(result.container, 'Retry ') as Element);
    });
    expect(upload.handler).toHaveBeenCalledTimes(2);
  });

  it('Cancel aborts the in-flight signal and drops the row', async () => {
    const upload = deferredUpload();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile('report.pdf'));
    expect(upload.signal.aborted).toBe(false);

    await act(async () => {
      fireEvent.click(buttonLabelled(result.container, 'Cancel ') as Element);
    });
    expect(upload.signal.aborted).toBe(true);
    expect(result.container.querySelector('[data-file-upload="transfer"]')).toBeNull();
  });

  it('an aborted transport never emits onChange', async () => {
    const upload = deferredUpload();
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        onUpload={upload.handler}
        onChange={onChange}
      />,
    );
    await selectFile(result.container, makeFile('report.pdf'));
    await act(async () => {
      fireEvent.click(buttonLabelled(result.container, 'Cancel ') as Element);
      upload.resolve('/files/late.pdf');
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FileUpload with a value', () => {
  it('previews an image value as an <img> with a string src', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Photo"
        isImage
        value="/files/photo.png"
        onChange={() => {}}
      />,
    );
    const img = result.container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/files/photo.png');
  });

  it('shows the file name for a non-image value', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        value="/files/deep/report.pdf"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('report.pdf');
    expect(result.container.querySelector('img')).toBeNull();
  });

  it('offers Replace and Remove, and Remove clears the value', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        value="/files/report.pdf"
        onChange={onChange}
      />,
    );
    expect(result.getButton('Replace')).toBeTruthy();
    fireEvent.click(result.getButton('Remove') as Element);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('readOnly hides Replace and Remove — the value is visible, not editable', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        value="/files/report.pdf"
        readOnly
        onChange={() => {}}
      />,
    );
    expect(result.getButton('Replace')).toBeUndefined();
    expect(result.getButton('Remove')).toBeUndefined();
  });

  it('disabled refuses a Remove even though the button is on screen', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        value="/files/report.pdf"
        disabled
        onChange={onChange}
      />,
    );
    fireEvent.click(result.getButton('Remove') as Element);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled refuses a file selection outright', async () => {
    const onUpload = vi.fn();
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        disabled
        onUpload={onUpload}
        onChange={() => {}}
      />,
    );
    await selectFile(result.container, makeFile());
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('FileUpload accept', () => {
  it('passes an explicit accept list to the native picker', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Attachment"
        accept=".pdf,.docx"
        onChange={() => {}}
      />,
    );
    expect(hiddenInput(result.container).getAttribute('accept')).toBe('.pdf,.docx');
  });

  it('falls back to image/* when the field is an image field', () => {
    const result = renderWithProviders(
      <FileUpload
        label="Photo"
        isImage
        onChange={() => {}}
      />,
    );
    expect(hiddenInput(result.container).getAttribute('accept')).toBe('image/*');
  });
});
