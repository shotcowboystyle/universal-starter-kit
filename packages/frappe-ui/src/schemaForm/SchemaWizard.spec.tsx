import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FieldSchema } from '../fieldRegistry';

import { SchemaWizard, schemaToWizardSteps } from './SchemaWizard';

import type { FormSchema } from './index';

const fields: FieldSchema[] = [
  { type: 'Data', name: 'first_name', label: 'First Name', required: true },
  { type: 'Data', name: 'region', label: 'Region', required: true },
  { type: 'Data', name: 'note', label: 'Note' },
];

const schema: FormSchema = {
  fields,
  sections: [
    { label: 'Identity', columns: [{ fields: [fields[0]] }] },
    { label: 'Destination', columns: [{ fields: [fields[1], fields[2]] }] },
  ],
};

function Harness({ initial = {}, onComplete }: { initial?: Record<string, unknown>; onComplete?: () => void }) {
  const [doc, setDoc] = useState<Record<string, unknown>>(initial);
  return (
    <SchemaWizard
      schema={schema}
      doc={doc}
      setValue={(name, value) => {
        setDoc((prev) => ({ ...prev, [name]: value }));
      }}
      completeLabel="Restore backup"
      onCancel={() => {}}
      onComplete={onComplete}
      labels="visible"
    />
  );
}

describe(schemaToWizardSteps, () => {
  it('cuts one rail step per section and appends Review', () => {
    const steps = schemaToWizardSteps(schema);
    expect(steps.map((step) => step.id)).toEqual(['identity', 'destination', 'review']);
    expect(steps[0]?.fields).toEqual(['first_name']);
    expect(steps[1]?.fields).toEqual(['region', 'note']);
    expect(steps[2]?.review).toBe(true);
  });
});

describe(SchemaWizard, () => {
  it('display-gates every section panel (LC-63)', () => {
    const { container } = renderWithProviders(<Harness />);
    const panels = container.querySelectorAll('[data-wizard-panel]');
    expect(panels).toHaveLength(3);
    expect(container.querySelectorAll('[data-wizard-panel][data-active="false"]')).toHaveLength(2);
  });

  it('LC-63 wizard probe: fill, advance, return keeps the value', async () => {
    const { container } = renderWithProviders(<Harness />);
    const input =
      (container.querySelector('#first_name') as HTMLInputElement | null) ??
      (container.querySelector("[name='first_name']") as HTMLInputElement | null) ??
      container.querySelector('input')!;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Ada' } });
    fireEvent.input(input, { target: { value: 'Ada' } });

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    expect(container.querySelector('[data-wizard-shell]')?.dataset.wizardCurrent).toBe('1');

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-back']")!);
    });
    const again =
      (container.querySelector('#first_name') as HTMLInputElement | null) ??
      (container.querySelector("[name='first_name']") as HTMLInputElement | null) ??
      container.querySelector('input')!;
    expect(again.value).toBe('Ada');
  });

  it('per-step validation blocks advance and focuses the first invalid field', async () => {
    const { container } = renderWithProviders(<Harness />);
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    expect(container.querySelector('[data-wizard-shell]')?.dataset.wizardCurrent).toBe('0');
    expect(container.querySelector("[data-error-summary], [data-testid='error-summary']")).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const first =
      (container.querySelector('#first_name') as HTMLElement | null) ??
      (container.querySelector("[name='first_name']") as HTMLElement | null) ??
      (container.querySelector('input') as HTMLElement | null);
    expect(first).toBeTruthy();
    expect(
      document.activeElement === first ||
        Boolean(first && first.contains(document.activeElement)) ||
        document.activeElement?.id === 'first_name' ||
        document.activeElement?.getAttribute('name') === 'first_name',
    ).toBe(true);
  });

  it('complete primary is the task verb', async () => {
    const onComplete = vi.fn();
    const { container } = renderWithProviders(
      <Harness
        initial={{ first_name: 'Ada', region: 'eu-central' }}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    const primary = container.querySelector("[data-testid='wizard-primary']") as HTMLElement;
    expect(primary.textContent).toBe('Restore backup');
    await act(async () => {
      fireEvent.click(primary);
    });
    expect(onComplete).toHaveBeenCalledWith();
  });
});
