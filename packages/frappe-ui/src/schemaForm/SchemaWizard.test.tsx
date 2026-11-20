import { setTimeout as sleep } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FieldSchema } from '../field-registry';

import { SchemaWizard, schemaToWizardSteps } from './SchemaWizard';
import type { SchemaWizardProps } from './SchemaWizard';

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

type HarnessDoc = SchemaWizardProps['doc'];

const EMPTY_DOC: HarnessDoc = {};

const Harness = ({ initial = EMPTY_DOC, onComplete }: { initial?: HarnessDoc; onComplete?: () => void }) => {
  const [doc, setDoc] = useState<HarnessDoc>(initial);
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
};

describe(schemaToWizardSteps, () => {
  it('cuts one rail step per section and appends Review', () => {
    const steps = schemaToWizardSteps(schema);
    expect(steps.map((step) => step.id)).toStrictEqual(['identity', 'destination', 'review']);
    expect(steps[0]?.fields).toStrictEqual(['first_name']);
    expect(steps[1]?.fields).toStrictEqual(['region', 'note']);
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
      container.querySelector<HTMLInputElement>('#first_name') ??
      container.querySelector<HTMLInputElement>("[name='first_name']") ??
      container.querySelector('input')!;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Ada' } });
    fireEvent.input(input, { target: { value: 'Ada' } });

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    expect(container.querySelector<HTMLElement>('[data-wizard-shell]')?.dataset.wizardCurrent).toBe('1');

    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-back']")!);
    });
    const again =
      container.querySelector<HTMLInputElement>('#first_name') ??
      container.querySelector<HTMLInputElement>("[name='first_name']") ??
      container.querySelector('input')!;
    expect(again.value).toBe('Ada');
  });

  it('per-step validation blocks advance and focuses the first invalid field', async () => {
    const { container } = renderWithProviders(<Harness />);
    await act(async () => {
      fireEvent.click(container.querySelector("[data-testid='wizard-primary']")!);
    });
    expect(container.querySelector<HTMLElement>('[data-wizard-shell]')?.dataset.wizardCurrent).toBe('0');
    expect(container.querySelector("[data-error-summary], [data-testid='error-summary']")).toBeTruthy();
    await act(async () => {
      await sleep(0);
    });
    const first =
      container.querySelector<HTMLElement>('#first_name') ??
      container.querySelector<HTMLElement>("[name='first_name']") ??
      container.querySelector<HTMLElement>('input');
    expect(first).toBeTruthy();
    expect(
      document.activeElement === first ||
        Boolean(first && first.contains(document.activeElement)) ||
        document.activeElement?.id === 'first_name' ||
        document.activeElement?.getAttribute('name') === 'first_name',
    ).toBe(true);
  });

  it('complete primary is the task verb', async () => {
    const onComplete = vi.fn<() => void>();
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
    const primary = container.querySelector<HTMLElement>("[data-testid='wizard-primary']")!;
    expect(primary.textContent).toBe('Restore backup');
    await act(async () => {
      fireEvent.click(primary);
    });
    expect(onComplete).toHaveBeenCalledWith();
  });
});
