import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyHost } from '../feedback';
import { getFeedback, resetFeedback } from '../feedback/store';
import { getToasts, resetToasts } from '../Toast/store';

import { CopyField } from './index';

function copyOf(container: HTMLElement) {
  return container.querySelector("[aria-label='Copy to clipboard']");
}

const writeText = vi.fn();

describe('CopyField', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...(typeof navigator !== 'undefined' ? navigator : {}),
      clipboard: { writeText },
    });
    resetToasts();
    resetFeedback();
  });

  afterEach(() => {
    resetToasts();
    resetFeedback();
  });

  it('copy is a real tab stop and rings its own glyph', () => {
    const result = renderWithProviders(<CopyField label="API token" value="mpo_live_4f2a9c81e0b3" />);
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    expect(copy.getAttribute('tabindex')).toBe('0');
    expect(copy.getAttribute('aria-label')).toBe('Copy to clipboard');
    expect(copy.className).toMatch(/mp-chip-dismiss/);
    expect(copy.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
  });

  it('success routes through notify() as a one-line past-tense toast', async () => {
    const result = renderWithProviders(
      <NotifyHost>
        <CopyField label="API token" value="mpo_live_4f2a9c81e0b3" />
      </NotifyHost>,
    );
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    fireEvent.click(copy);
    await vi.waitFor(() => {
      expect(getToasts()).toHaveLength(1);
    });
    const toast = getToasts()[0];
    expect(toast?.title).toBe('Copied to clipboard.');
    expect(toast?.intent).toBe('success');
    expect(toast?.description).toBeUndefined();
    expect(toast?.title).not.toMatch(/success/i);
    expect(getFeedback()).toHaveLength(0);
    expect(copyOf(result.container)?.querySelector('.mp-chip-dismiss-ring')).not.toBeNull();
    expect(await result.findByText('Copied to clipboard.')).toBeInTheDocument();
    await vi.waitFor(() => {
      const live = document.querySelector("[aria-live]:not([aria-live='off'])");
      expect(live?.textContent ?? '').toMatch(/Copied to clipboard/);
    });
  });

  it('failure is a field-scoped inline alert and never a toast', async () => {
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const result = renderWithProviders(<CopyField label="API token" value="mpo_live_4f2a9c81e0b3" />);
    const copy = copyOf(result.container);
    if (!copy) {
      throw new Error('copy not found');
    }
    fireEvent.click(copy);
    await vi.waitFor(() => {
      expect(getFeedback()).toHaveLength(1);
    });
    expect(getToasts()).toHaveLength(0);
    const alert = getFeedback()[0];
    expect(alert?.surface).toBe('alert');
    expect(alert?.severity).toBe('error');
    expect(alert?.scope).toBe('field');
    expect(alert?.body).toBe('Copy failed.');
    expect(alert?.body).not.toMatch(/success/i);
    expect(await result.findByText('Copy failed.')).toBeInTheDocument();
  });

  it('shows a failed copy only beside its own field and clears it after success', async () => {
    const result = renderWithProviders(
      <>
        <div data-testid="first-copy">
          <CopyField label="First token" value="first" />
        </div>
        <div data-testid="second-copy">
          <CopyField label="Second token" value="second" />
        </div>
      </>,
    );
    const first = result.getByTestId('first-copy');
    const second = result.getByTestId('second-copy');
    writeText.mockRejectedValueOnce(new Error('Denied'));
    fireEvent.click(copyOf(first)!);
    await vi.waitFor(() => {
      expect(first.textContent).toContain('Copy failed.');
    });
    expect(second.textContent).not.toContain('Copy failed.');
    writeText.mockRejectedValueOnce(new Error('Denied'));
    fireEvent.click(copyOf(second)!);
    await vi.waitFor(() => {
      expect(second.textContent).toContain('Copy failed.');
    });
    fireEvent.click(copyOf(first)!);
    await vi.waitFor(() => {
      expect(first.textContent).not.toContain('Copy failed.');
    });
    expect(second.textContent).toContain('Copy failed.');
    expect(getToasts()).toHaveLength(1);
  });

  it('replaces repeated failures and removes its feedback on unmount', async () => {
    writeText.mockRejectedValue(new Error('Denied'));
    const result = renderWithProviders(<CopyField label="Token" value="first" />);
    fireEvent.click(copyOf(result.container)!);
    await vi.waitFor(() => {
      expect(getFeedback()).toHaveLength(1);
    });
    fireEvent.click(copyOf(result.container)!);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2);
    });
    expect(result.getAllByText('Copy failed.')).toHaveLength(1);
    expect(getFeedback()).toHaveLength(1);
    result.unmount();
    expect(getFeedback()).toHaveLength(0);
  });

  it('ignores a clipboard result after its field unmounts', async () => {
    let rejectCopy!: (reason: Error) => void;
    writeText.mockReturnValue(
      new Promise((_, reject) => {
        rejectCopy = reject;
      }),
    );
    const result = renderWithProviders(<CopyField label="Token" value="first" />);
    fireEvent.click(copyOf(result.container)!);
    result.unmount();
    rejectCopy(new Error('Denied'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getFeedback()).toHaveLength(0);
    expect(getToasts()).toHaveLength(0);
  });
});
