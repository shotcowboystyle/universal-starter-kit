/**
 * Per-field / per-form error containment specs (backoffice-e2e-verify.md
 * gap #2): a single field renderer throwing during render must degrade to
 * an inline honest-error slot — field label + error panel + Retry — while
 * every sibling field, the toolbar, and the dialog chrome stay alive. The
 * pre-fix behavior was the route-level error boundary unmounting the whole
 * desk (the tiptap-v3 TextEditor regression turned "broken editor" into
 * "blank screen", QuickEntry case included).
 */
import { InMemoryFixtureProvider } from '@repo/frappe';
import type { FrappeFieldType } from '@repo/frappe';
import { FrappeProvider, registerField } from '@repo/frappe-ui';
import type { FieldRenderProps } from '@repo/frappe-ui';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { QuickEntryDialog } from '../quickEntry/QuickEntryDialog';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { DocFormScreen } from './DocFormScreen';

// ---------------------------------------------------------------------------
// A registry fieldtype whose renderer throws while `shouldCrash` is true —
// the exact shape of the tiptap-v3 regression (throw at every mount), with a
// lever the retry spec can flip to prove recovery-by-remount.
// ---------------------------------------------------------------------------

let shouldCrash = true;

const CrashProbeField = ({ label }: FieldRenderProps) => {
  if (shouldCrash) {
    throw new Error('Crash Probe field renderer exploded');
  }
  return <div data-testid="crash-probe-recovered">{label ?? 'recovered'}</div>;
};

const crashProbe = 'Crash Probe' as FrappeFieldType;

registerField(crashProbe, CrashProbeField);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const crashTaskMeta = {
  name: 'Crash Task',
  doctype: 'DocType',
  module: 'Projects',
  title_field: 'subject',
  fields: [
    { fieldname: 'main_section', fieldtype: 'Section Break', label: 'Main' },
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', required: 1 },
    { fieldname: 'broken_editor', fieldtype: 'Crash Probe', label: 'Broken Editor' },
    { fieldname: 'notes', fieldtype: 'Data', label: 'Notes' },
  ],
  links: [],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [crashTaskMeta],
    'Crash Task': [
      {
        name: 'CRASH-0001',
        doctype: 'Crash Task',
        subject: 'Containment subject',
        notes: 'Sibling value',
        docstatus: 0,
        owner: 'Administrator',
        modified: '2026-08-12 09:00:00.000000',
      },
    ],
  });

const quickEntryMeta: DoctypeMeta = {
  name: 'Crash Note',
  module: 'Desk',
  quick_entry: 1,
  fields: [
    { fieldname: 'title', fieldtype: 'Data', label: 'Title', required: 1 },
    { fieldname: 'boom', fieldtype: crashProbe, label: 'Boom', allow_in_quick_entry: 1 },
  ],
};

// ---------------------------------------------------------------------------

describe('form error containment', () => {
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    shouldCrash = true;
    // React logs every caught boundary error; the boundary itself logs the
    // containment signal. Silence both, then assert on the signal.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const containmentLogs = () =>
    warnSpy.mock.calls.filter((args) => String(args[0]).includes('form render error contained'));

  it('DocFormScreen: a crashing field degrades to its inline error slot; siblings stay editable', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="http://fixtures.local"
        fixtures={makeFixtures()}>
        <DocFormScreen
          doctype="Crash Task"
          name="CRASH-0001"
        />
      </FrappeProvider>,
    );

    // The form loaded: the sibling Data field renders the fixture value.
    const subjectInput = await screen.findByDisplayValue('Containment subject', undefined, {
      timeout: 10_000,
    });
    expect(screen.getByTestId('form-field-subject')).toBeTruthy();

    // The crashing field is an inline honest-error slot: label + panel + Retry.
    const slot = await screen.findByTestId('form-field-error-broken_editor');
    expect(slot.textContent).toContain('Broken Editor');
    expect(slot.textContent).toContain('This field failed to render');
    expect(slot.textContent).toContain('Retry');
    expect(containmentLogs().length).toBeGreaterThan(0);

    // The rest of the form survived: toolbar Save is present, the other
    // sibling field rendered, and the Subject field still accepts edits.
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByDisplayValue('Sibling value')).toBeTruthy();
    fireEvent.change(subjectInput, { target: { value: 'Edited while broken' } });
    await waitFor(() => {
      expect(screen.getByDisplayValue('Edited while broken')).toBeTruthy();
    });
  });

  it('DocFormScreen: Retry remounts the field — a recovered renderer replaces the slot', async () => {
    renderWithProviders(
      <FrappeProvider
        baseURL="http://fixtures.local"
        fixtures={makeFixtures()}>
        <DocFormScreen
          doctype="Crash Task"
          name="CRASH-0001"
        />
      </FrappeProvider>,
    );

    const slot = await screen.findByTestId('form-field-error-broken_editor', undefined, {
      timeout: 10_000,
    });
    const retry = [...slot.querySelectorAll("button, [role='button']")].find((el) => el.textContent?.includes('Retry'));
    expect(retry).toBeTruthy();

    // Transient crash: the renderer works on the next mount.
    shouldCrash = false;
    fireEvent.click(retry!);

    await waitFor(() => {
      expect(screen.getByTestId('crash-probe-recovered')).toBeTruthy();
    });
    expect(screen.queryByTestId('form-field-error-broken_editor')).toBeNull();
  });

  it('QuickEntryDialog: a crashing field keeps the dialog and its footer escape alive', async () => {
    renderWithProviders(
      <QuickEntryDialog
        doctype="Crash Note"
        open
        onOpenChange={() => {}}
        metaOverride={quickEntryMeta}
      />,
    );

    // The mini-form rendered inside the dialog (not the route boundary).
    await screen.findByTestId('quick-entry-form');

    // Crashing field → inline slot; sibling field + footer stay usable.
    const slot = await screen.findByTestId('form-field-error-boom');
    expect(slot.textContent).toContain('Boom');
    expect(slot.textContent).toContain('This field failed to render');

    const titleInput = document.querySelector('input');
    expect(titleInput).toBeTruthy();
    fireEvent.change(titleInput!, { target: { value: 'still typing' } });
    await waitFor(() => {
      expect(screen.getByDisplayValue('still typing')).toBeTruthy();
    });

    expect(screen.getByTestId('quick-entry-create')).toBeTruthy();
    expect(screen.getByTestId('quick-entry-edit-full-form')).toBeTruthy();
  });
});
