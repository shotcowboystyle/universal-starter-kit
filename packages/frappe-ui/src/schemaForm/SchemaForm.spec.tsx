import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FieldSchema } from '../fieldRegistry';

import { SchemaForm } from './index';
import type { FormSchema } from './index';

const identityFields: FieldSchema[] = [
  { type: 'Data', name: 'first_name', label: 'First Name' },
  { type: 'Data', name: 'last_name', label: 'Last Name' },
];

function sourceHasHookRunner(): boolean {
  const src = readFileSync(join(import.meta.dirname, 'index.tsx'), 'utf-8');
  const stripped = src.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
  return stripped.includes('frappe.ui.form.on');
}

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
    const setValue = vi.fn();
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

    const viaProp = screen.getByLabelText('ReadOnly via prop') as HTMLInputElement;
    const viaSchema = screen.getByLabelText('ReadOnly via schema') as HTMLInputElement;
    const editable = screen.getByLabelText('Editable') as HTMLInputElement;

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
        setValue={vi.fn()}
        disabled
      />,
    );
    const input = screen.getByLabelText('First Name') as HTMLInputElement;
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
        setValue={vi.fn()}
      />,
    );
    const card = container.querySelector('[data-mpo-schema-form-card]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.dataset.mpoSchemaFormBorderless).toBeNull();
    const style = card.getAttribute('style') ?? '';
    expect(style).not.toMatch(/border-width:\s*1px/i);
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
        setValue={vi.fn()}
      />,
    );
    const card = container.querySelector('[data-mpo-schema-form-card]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.dataset.mpoSchemaFormBorderless).toBe('');
    const style = card.getAttribute('style') ?? '';
    expect(style).not.toMatch(/border-width:\s*1px/i);
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
        setValue={vi.fn()}
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
        setValue={vi.fn()}
      />,
    );
    // `hidden` is a getByRole option, not a SelectorMatcherOptions one —
    // getByLabelText never filters on visibility, so it was a no-op that only
    // typechecked by accident (MPO-109).
    const input = screen.getByLabelText('First Name') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Jane');
    const footer = input.closest("[aria-hidden='true']") as HTMLElement | null;
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
        setValue={vi.fn()}
        order={['c', 'a']}
      />,
    );
    const a = screen.getByLabelText('Field A');
    const b = screen.getByLabelText('Field B');
    const c = screen.getByLabelText('Field C');
    const d = screen.getByLabelText('Field D');
    const e = screen.getByLabelText('Field E');
    // c, b, a, d, e — b/d/e unlisted, stay put; listed slots fill as c then a.
    expect(c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(d.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
