/**
 * @vitest-environment jsdom
 *
 * Five primitives the house barrel could not express.
 *
 * Collapsible / LinearGradient / VisuallyHidden / Unspaced are
 * knob-immune primitives. Collapsible adds safe form-button defaults. AlertDialogContent is a
 * house surface: `unstyled` drops Tamagui's baked elevate chrome so the
 * overlay elevation token is the only surface source.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { AlertDialog } from 'tamagui';
import * as tamagui from 'tamagui';
import * as tamaguiLinearGradient from 'tamagui/linear-gradient';
import { afterEach, describe, expect, it } from 'vitest';

import { AlertDialogContent, AlertDialogOverlay } from './surfaces';

import * as pkg from './index';

afterEach(cleanup);

describe('knob-immune primitives on the house barrel', () => {
  it('isolates the safe Collapsible adapter and preserves other primitives', () => {
    expect(pkg.Collapsible).not.toBe(tamagui.Collapsible);
    expect(pkg.Unspaced).toBe(tamagui.Unspaced);
    expect(pkg.VisuallyHidden).toBe(tamagui.VisuallyHidden);
    expect(pkg.Collapsible.Trigger).not.toBe(tamagui.Collapsible.Trigger);
    expect(pkg.Collapsible.Content).toBe(tamagui.Collapsible.Content);
  });

  it('exports LinearGradient from the tamagui/linear-gradient subpath (not the main barrel)', () => {
    expect((tamagui as Record<string, unknown>).LinearGradient).toBeUndefined();
    expect(pkg.LinearGradient).toBe(tamaguiLinearGradient.LinearGradient);
  });

  it('leaves the raw trigger untouched while giving the public trigger a safe default', () => {
    const result = renderWithProviders(
      <>
        <tamagui.Collapsible>
          <tamagui.Collapsible.Trigger>Raw</tamagui.Collapsible.Trigger>
        </tamagui.Collapsible>
        <pkg.Collapsible>
          <pkg.Collapsible.Trigger>Safe</pkg.Collapsible.Trigger>
        </pkg.Collapsible>
      </>,
    );
    expect(result.getByRole('button', { name: 'Raw' }).getAttribute('type')).toBeNull();
    expect(result.getByRole('button', { name: 'Safe' }).getAttribute('type')).toBe('button');
  });

  it('renders Collapsible open with trigger and content', () => {
    const { getByText } = renderWithProviders(
      <pkg.Collapsible defaultOpen>
        <pkg.Collapsible.Trigger>Toggle</pkg.Collapsible.Trigger>
        <pkg.Collapsible.Content>Fold substrate</pkg.Collapsible.Content>
      </pkg.Collapsible>,
    );
    expect(getByText('Toggle')).toBeTruthy();
    expect(getByText('Fold substrate')).toBeTruthy();
  });

  it('renders VisuallyHidden into the tree without a visible box', () => {
    const { getByText } = renderWithProviders(
      <pkg.VisuallyHidden>Hidden label for assistive technology</pkg.VisuallyHidden>,
    );
    const node = getByText('Hidden label for assistive technology');
    expect(node).toBeTruthy();
    expect(node.className).toMatch(/_o-/);
  });

  it('renders Unspaced as a transparent spacing marker', () => {
    const { getByText } = renderWithProviders(
      <pkg.Unspaced>
        <pkg.Text>unspaced child</pkg.Text>
      </pkg.Unspaced>,
    );
    expect(getByText('unspaced child')).toBeTruthy();
  });

  it('renders LinearGradient with theme-token stops', () => {
    const { container } = renderWithProviders(
      <pkg.LinearGradient width={80} height={40} colors={['$color4', '$background']} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

describe('house AlertDialog surface', () => {
  it('is not the raw AlertDialog.Content (baked elevate chrome)', () => {
    expect(pkg.AlertDialogContent).toBe(AlertDialogContent);
    expect(pkg.AlertDialogContent).not.toBe(AlertDialog.Content);
    expect(pkg.AlertDialogOverlay).toBe(AlertDialogOverlay);
    expect(pkg.AlertDialogOverlay).not.toBe(AlertDialog.Overlay);
  });

  it('renders role=alertdialog through the house surface', () => {
    renderWithProviders(
      <AlertDialog defaultOpen>
        <AlertDialog.Portal>
          <AlertDialogOverlay />
          <AlertDialogContent role="alertdialog" data-testid="house-alertdialog">
            <AlertDialog.Title>Delete customer?</AlertDialog.Title>
            <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
          </AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog>,
    );
    const surface = document.querySelector('[data-testid="house-alertdialog"]');
    expect(surface).toBeTruthy();
    expect(surface?.getAttribute('role')).toBe('alertdialog');
    expect(document.body.textContent).toContain('Delete customer?');
  });
});
