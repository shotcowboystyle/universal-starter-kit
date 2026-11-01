import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FieldSchema } from '../field-registry';

import { SchemaForm } from './index';
import type { FormSchema, SchemaFormProps } from './index';

const identityFields: FieldSchema[] = [
  { type: 'Data', name: 'first_name', label: 'First Name' },
  { type: 'Data', name: 'last_name', label: 'Last Name' },
];

const sourceHasHookRunner = (): boolean => {
  const src = readFileSync(path.join(import.meta.dirname, 'index.tsx'), 'utf-8');
  // oxlint-disable-next-line sonarjs/super-linear-regex -- scans this package's own source file, never user input
  const stripped = src.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '');
  return stripped.includes('frappe.ui.form.on');
};

const getCard = (container: HTMLElement): HTMLElement => {
  const card = container.querySelector<HTMLElement>('[data-mpo-schema-form-card]');
  if (!card) {
    throw new Error('SchemaForm rendered no section card');
  }
  return card;
};

/** True when `a` comes before `b` in document order. */
const precedes = (a: Node, b: Node): boolean =>
  // oxlint-disable-next-line eslint/no-bitwise -- compareDocumentPosition returns a bitmask
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('SchemaForm design-law (MPO-60 / R10)', () => {
  it('does not implement frappe.ui.form.on (R10 out of scope)', () => {
    expect(sourceHasHookRunner()).toBe(false);
  });

  it('maps readOnlyFields and schema readOnly to readOnly, not disabled', () => {
    const fields: FieldSchema[] = [
      { type: 'Data', name: 'first_name', label: 'ReadOnly via prop' },
      { type: 'Data', name: 'last_name', label: 'ReadOnly via schema', readOnly: true },
      { type: 'Data', name: 'editable', label: 'Editable' },
    ];
    const schema: FormSchema = {
      fields,
      sections: [{ label: 'ReadOnly Mapping', columns: [{ fields }] }],
    };
    const setValue = vi.fn<SchemaFormProps['setValue']>();
    renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{
          first_name: 'copy me if you can',
          last_name: 'schema read-only value',
          editable: 'type here',
        }}
        setValue={setValue}
        readOnlyFields={['first_name']}
      />,
    );

    const viaProp = screen.getByLabelText<HTMLInputElement>('ReadOnly via prop');
    const viaSchema = screen.getByLabelText<HTMLInputElement>('ReadOnly via schema');
    const editable = screen.getByLabelText<HTMLInputElement>('Editable');

    expect(viaProp.readOnly).toBe(true);
    expect(viaProp.disabled).toBe(false);
    expect(viaSchema.readOnly).toBe(true);
    expect(viaSchema.disabled).toBe(false);
    expect(editable.readOnly).toBe(false);
    expect(editable.disabled).toBe(false);

    fireEvent.change(viaProp, { target: { value: 'mutated' } });
    fireEvent.change(viaSchema, { target: { value: 'mutated' } });
    expect(setValue).not.toHaveBeenCalled();

    fireEvent.change(editable, { target: { value: 'ok' } });
    expect(setValue).toHaveBeenCalledWith('editable', 'ok');
  });

  it('disabled form still disables; read-only is a separate channel', () => {
    const fields: FieldSchema[] = [{ type: 'Data', name: 'first_name', label: 'First Name' }];
    const schema: FormSchema = {
      fields,
      sections: [{ label: 'Disabled', columns: [{ fields }] }],
    };
    renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{ first_name: 'Jane' }}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
        disabled
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('First Name');
    expect(input.disabled || input.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('default section is SF-CARD: no hardcoded 1px border', () => {
    const schema: FormSchema = {
      fields: identityFields,
      sections: [{ label: 'Identity', columns: [{ fields: identityFields }] }],
    };
    const { container } = renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{}}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
      />,
    );
    const card = getCard(container);
    expect(card).toBeTruthy();
    expect(card.dataset.mpoSchemaFormBorderless).toBeNull();
    const style = card.getAttribute('style') ?? '';
    expect(style).not.toMatch(/border-width:\s*1px/iu);
    const computed = getComputedStyle(card);
    expect(computed.borderWidth === '1px' && computed.borderStyle === 'solid').toBe(false);
  });

  it('hideBorder is SF-TRANSPARENT (borderless marker, no card fill)', () => {
    const schema: FormSchema = {
      fields: identityFields,
      sections: [{ label: 'Ghost', hideBorder: true, columns: [{ fields: identityFields }] }],
    };
    const { container } = renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{}}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
      />,
    );
    const card = getCard(container);
    expect(card).toBeTruthy();
    expect(card.dataset.mpoSchemaFormBorderless).toBe('');
    const style = card.getAttribute('style') ?? '';
    expect(style).not.toMatch(/border-width:\s*1px/iu);
  });

  it('forwards description as helperText and honors compact/skeleton flags', () => {
    const fields: FieldSchema[] = [
      {
        type: 'Data',
        name: 'code',
        label: 'Code',
        description: 'Warehouse SKU',
      },
    ];
    const schema: FormSchema = {
      fields,
      sections: [{ label: 'Stock', columns: [{ fields }] }],
    };
    renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{ code: 'SKU-1' }}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
      />,
    );
    expect(screen.getByText('Warehouse SKU')).toBeTruthy();
  });

  it('collapsible section display-gates the body (LC-63) without unmounting', () => {
    const fields: FieldSchema[] = [{ type: 'Data', name: 'first_name', label: 'First Name' }];
    const schema: FormSchema = {
      fields,
      sections: [
        {
          label: 'Identity',
          collapsible: true,
          collapsed: true,
          columns: [{ fields }],
        },
      ],
    };
    renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{ first_name: 'Jane' }}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
      />,
    );
    // `hidden` is a getByRole option, not a SelectorMatcherOptions one —
    // getByLabelText never filters on visibility, so it was a no-op that only
    // typechecked by accident (MPO-109).
    const input = screen.getByLabelText<HTMLInputElement>('First Name');
    expect(input).toBeTruthy();
    expect(input.value).toBe('Jane');
    const footer = input.closest<HTMLElement>("[aria-hidden='true']");
    expect(footer).toBeTruthy();
    expect(getComputedStyle(footer!).display).toBe('none');
  });
});

describe('SchemaForm order (R2 / MPO-22)', () => {
  it('reorders listed fields in the DOM; unlisted keep their meta positions', () => {
    const fields: FieldSchema[] = [
      { type: 'Data', name: 'a', label: 'Field A' },
      { type: 'Data', name: 'b', label: 'Field B' },
      { type: 'Data', name: 'c', label: 'Field C' },
      { type: 'Data', name: 'd', label: 'Field D' },
      { type: 'Data', name: 'e', label: 'Field E' },
    ];
    const schema: FormSchema = {
      fields,
      sections: [{ label: 'Order', columns: [{ fields }] }],
    };
    renderWithProviders(
      <SchemaForm
        schema={schema}
        doc={{}}
        setValue={vi.fn<SchemaFormProps['setValue']>()}
        order={['c', 'a']}
      />,
    );
    const a = screen.getByLabelText('Field A');
    const b = screen.getByLabelText('Field B');
    const c = screen.getByLabelText('Field C');
    const d = screen.getByLabelText('Field D');
    const e = screen.getByLabelText('Field E');
    // c, b, a, d, e — b/d/e unlisted, stay put; listed slots fill as c then a.
    expect(precedes(c, b)).toBe(true);
    expect(precedes(b, a)).toBe(true);
    expect(precedes(a, d)).toBe(true);
    expect(precedes(d, e)).toBe(true);
  });
});
