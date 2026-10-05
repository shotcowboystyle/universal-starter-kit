/**
 * @vitest-environment jsdom
 */

import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogRegionContext } from '../surfaces';

import { ActionBar } from './ActionBar';
import { __resetActionDevWarnSeen } from './devWarn';

/** Simulates rendering inside a `DialogContent` surface. */
function inDialogRegion(ui: ReactNode) {
  return <DialogRegionContext.Provider value={{ inDialogRegion: true }}>{ui}</DialogRegionContext.Provider>;
}

describe('ActionBar', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetActionDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetActionDevWarnSeen();
  });

  it('renders cancel → secondary → primary (trailing primary)', () => {
    const { container } = renderWithProviders(
      <ActionBar
        id="save-bar"
        cancel={<Button actionRole="chrome">Cancel</Button>}
        secondary={<Button actionRole="secondary">Draft</Button>}
        primary={<Button accent>Save</Button>}
      />,
    );
    const texts = Array.from(container.querySelectorAll('[role="button"]')).map((el) => el.textContent);
    expect(texts).toEqual(['Cancel', 'Draft', 'Save']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('DEV warns when two accent/primary actions appear in one region', () => {
    renderWithProviders(
      <ActionBar id="dup">
        <Button accent>Save</Button>
        <Button accent>Publish</Button>
      </ActionBar>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('two-primaries'));
  });

  it('does not warn for a single primary slot', () => {
    renderWithProviders(<ActionBar id="ok" primary=<Button accent verb="Save" noun="document" /> />);
    expect(screen.getByText('Save document')).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('strips disabled from the cancel slot and warns cancel-disabled', () => {
    const onClick = vi.fn();
    const { container } = renderWithProviders(
      <ActionBar
        id="strip"
        cancel={
          <button type="button" disabled onClick={onClick}>
            Cancel
          </button>
        }
        primary={<Button accent>Save</Button>}
      />,
    );
    const cancelEl = container.querySelector('button') as HTMLButtonElement;
    expect(cancelEl).toBeTruthy();
    expect(cancelEl.disabled).toBe(false);
    expect(cancelEl.getAttribute('data-mp-cancel-disabled-ignored')).toBe('true');
    fireEvent.click(cancelEl);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cancel-disabled'));
  });

  it('cancel slot with a disabled house Button stays pressable', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <ActionBar
        id="strip-house"
        cancel={
          <Button actionRole="chrome" disabled onPress={onPress}>
            Cancel
          </Button>
        }
      />,
    );
    const cancelEl = screen.getByText('Cancel');
    fireEvent.click(cancelEl);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cancel-disabled'));
    // Stripping happens before Button renders, so no bare-disabled either.
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('DEV warns dialog-too-many-actions for 3 actions inside a dialog region', () => {
    renderWithProviders(
      inDialogRegion(
        <ActionBar
          id="dlg-three"
          cancel={<Button actionRole="chrome">Cancel</Button>}
          secondary={<Button actionRole="secondary">Draft</Button>}
          primary={<Button accent>Save</Button>}
        />,
      ),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('count=3'));
  });

  it('allowManyActions ejects the dialog action cap', () => {
    renderWithProviders(
      inDialogRegion(
        <ActionBar
          id="dlg-eject"
          allowManyActions
          cancel={<Button actionRole="chrome">Cancel</Button>}
          secondary={<Button actionRole="secondary">Draft</Button>}
          primary={<Button accent>Save</Button>}
        />,
      ),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
  });

  it('cancel + primary inside a dialog region stays silent (baseline)', () => {
    renderWithProviders(
      inDialogRegion(
        <ActionBar
          id="dlg-pair"
          cancel={<Button actionRole="chrome">Cancel</Button>}
          primary={<Button accent>Save</Button>}
        />,
      ),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
  });

  it('3 actions outside a dialog region are not capped (page-level bars)', () => {
    renderWithProviders(
      <ActionBar
        id="page-three"
        cancel={<Button actionRole="chrome">Cancel</Button>}
        secondary={<Button actionRole="secondary">Draft</Button>}
        primary={<Button accent>Save</Button>}
      />,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
  });
});
