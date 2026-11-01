/**
 * Registry mapping audit specs (fieldtype → component, per context).
 *
 * Guards against the "Link trap": a Frappe fieldtype silently degrading to a
 * plain text input in table cells (or to the wrong component in forms) when a
 * proper field exists. Cell mappings are asserted through
 * `fieldtypeToTableField` / `childFieldsToColumns`; form adapters are
 * asserted by inspecting the element they produce (the adapters under test
 * are plain functions without hooks, so calling them directly is safe).
 */
import { Button, Combobox, ImageField } from '@repo/forms';
import { customFieldTypes, frappeFieldTypes } from '@repo/frappe';
import type { FrappeFieldType } from '@repo/frappe';
import type React from 'react';
import type { ComponentType } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { registeredFieldtypesFromSource } from '../tests/registrySource';

import { childFieldsToColumns, fieldtypeToTableField, getFieldComponent, registerField } from './field-registry';
import type { ChildTableFieldDef, FieldRenderProps } from './field-registry';
import { Icon } from './fields/Icon';
import { Link } from './fields/Link';
import { Rating } from './fields/Rating';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- props of whichever field element the adapter under test built
type InspectableElement = React.ReactElement<Record<string, any>>;

type CustomRender = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the table's custom-cell render signature
  value: unknown,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the table's custom-cell render signature
  rowData: unknown,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mirrors the table's custom-cell render signature
  onChange: (value: unknown) => void,
  context?: { readOnly: boolean; disabled: boolean },
) => InspectableElement;

const customRenderOf = (mapped: ReturnType<typeof fieldtypeToTableField>): CustomRender => {
  expect(mapped.field).toBe('custom');
  const render = mapped.fieldProps?.render as CustomRender | undefined;
  expect(render).toBeTypeOf('function');
  return render!;
};

describe('fieldtypeToTableField (cell context)', () => {
  it('maps text-entry fieldtypes to the honest editors', () => {
    expect(fieldtypeToTableField('Data').field).toBe('input');
    expect(fieldtypeToTableField('Small Text').field).toBe('textarea');
    expect(fieldtypeToTableField('Long Text').field).toBe('textarea');
    expect(fieldtypeToTableField('Text').field).toBe('textarea');
  });

  it('maps Code / JSON / Markdown Editor to dedicated modal editors, not bare textareas', () => {
    expect(fieldtypeToTableField('Code').field).toBe('codeeditor');
    expect(fieldtypeToTableField('JSON').field).toBe('codeeditor');
    expect(fieldtypeToTableField('Markdown Editor').field).toBe('markdowneditor');
    expect(fieldtypeToTableField('Text Editor').field).toBe('richtexteditor');
    expect(fieldtypeToTableField('HTML Editor').field).toBe('richtexteditor');
  });

  it('maps Password to a masked input (never cleartext echo)', () => {
    const mapped = fieldtypeToTableField('Password');
    expect(mapped.field).toBe('input');
    expect(mapped.fieldProps?.secureTextEntry).toBe(true);
  });

  it('maps Autocomplete to a creatable combobox over the static options', () => {
    const mapped = fieldtypeToTableField('Autocomplete', 'Red\nGreen\nBlue');
    expect(mapped.field).toBe('combobox');
    expect(mapped.fieldProps?.options).toStrictEqual([
      { label: 'Red', value: 'Red' },
      { label: 'Green', value: 'Green' },
      { label: 'Blue', value: 'Blue' },
    ]);
    expect(mapped.fieldProps?.creatable).toBe(true);
    const onCreate = mapped.fieldProps?.onCreate as (v: string) => { label: string; value: string };
    expect(onCreate('Teal')).toStrictEqual({ label: 'Teal', value: 'Teal' });
  });

  it('maps Rating to the frappe-ui Rating field (0–1 fraction contract)', () => {
    const render = customRenderOf(fieldtypeToTableField('Rating'));
    const element = render(0.8, {}, () => {});
    expect(element.type).toBe(Rating);
    // oxlint-disable-next-line sonarjs/no-floating-point-equality -- the adapter passes the value through untouched, so identity is the contract
    expect(element.props.value).toBe(0.8);
    expect(element.props.maxStars).toBeUndefined();
    expect(element.props.compact).toBe(true);
  });

  it('maps Icon to the Icon picker cell (compact), honoring render context', () => {
    const render = customRenderOf(fieldtypeToTableField('Icon'));
    const element = render('mail', {}, () => {});
    expect(element.type).toBe(Icon);
    expect(element.props.value).toBe('mail');
    expect(element.props.compact).toBe(true);
    const readOnlyElement = render('mail', {}, () => {}, { readOnly: true, disabled: false });
    expect(readOnlyElement.props.readOnly).toBe(true);
  });

  it('Rating star count comes from df.options (stock cint(df.options) || 5)', () => {
    const render = customRenderOf(fieldtypeToTableField('Rating', '7'));
    const element = render(0.5, {}, () => {});
    expect(element.props.maxStars).toBe(7);
  });

  it('maps Link to the backend-searching Link combobox (regression)', () => {
    const render = customRenderOf(fieldtypeToTableField('Link', 'User'));
    const element = render('Administrator', {}, () => {});
    expect(element.type).toBe(Link);
    expect(element.props.doctype).toBe('User');
    expect(element.props.compact).toBe(true);
  });

  it('maps Dynamic Link to a Link combobox whose doctype resolves from the row', () => {
    const render = customRenderOf(fieldtypeToTableField('Dynamic Link', 'reference_type'));
    const element = render('USR-0001', { reference_type: 'User' }, () => {});
    expect(element.type).toBe(Link);
    expect(element.props.doctype).toBe('User');
    expect(element.props.disabled).toBe(false);
    expect(element.props.value).toBe('USR-0001');
  });

  it('Dynamic Link with an unset sibling doctype field stays disabled (nothing to search)', () => {
    const render = customRenderOf(fieldtypeToTableField('Dynamic Link', 'reference_type'));
    const element = render('', {}, () => {});
    expect(element.type).toBe(Link);
    expect(element.props.doctype).toBe('');
    expect(element.props.disabled).toBe(true);
    expect(element.props.placeholder).toBe('Set reference_type first');
  });

  it('unknown fieldtypes default to a read-only display, never an editable input (D-18.5)', () => {
    // Deliberate flip of the old "plain input" fallback: an unmapped
    // fieldtype rendering editable is the Link-in-cell trap class.
    const mapped = fieldtypeToTableField('Some Custom Type');
    expect(mapped.field).toBe('input');
    expect(mapped.fieldProps?.readOnly).toBe(true);
  });

  it('known Data fieldtype stays an editable input (not swept up by the unknown default)', () => {
    expect(fieldtypeToTableField('Data')).toStrictEqual({ field: 'input' });
  });

  it('custom cell renderers honor the read-only render context (D-18.4)', () => {
    const readOnlyContext = { readOnly: true, disabled: false };

    const ratingRender = customRenderOf(fieldtypeToTableField('Rating'));
    expect(ratingRender(0.8, {}, () => {}, readOnlyContext).props.readOnly).toBe(true);

    const linkRender = customRenderOf(fieldtypeToTableField('Link', 'User'));
    expect(linkRender('Administrator', {}, () => {}, readOnlyContext).props.readOnly).toBe(true);

    const dynamicRender = customRenderOf(fieldtypeToTableField('Dynamic Link', 'reference_type'));
    const dynamicElement = dynamicRender('USR-0001', { reference_type: 'User' }, () => {}, readOnlyContext);
    expect(dynamicElement.props.readOnly).toBe(true);

    // Without a context (legacy 3-arg call sites) the cells stay editable.
    expect(linkRender('Administrator', {}, () => {}).props.readOnly).toBeUndefined();
  });
});

describe('childFieldsToColumns (child-table context)', () => {
  const fields: ChildTableFieldDef[] = [
    { fieldname: 'item', fieldtype: 'Data', label: 'Item', in_list_view: 1 },
    { fieldname: 'qty', fieldtype: 'Int', label: 'Qty', in_list_view: 1, read_only: 1 },
    {
      fieldname: 'photo_view',
      fieldtype: 'Image',
      label: 'Photo',
      options: 'photo',
      in_list_view: 1,
    },
    { fieldname: 'sec', fieldtype: 'Section Break' },
    { fieldname: 'fold', fieldtype: 'Fold' },
    { fieldname: 'action', fieldtype: 'Button', label: 'Do It' },
  ];

  it('excludes layout and display-of-another-field types (Image, Fold, Button, breaks)', () => {
    const columns = childFieldsToColumns(fields);
    expect(columns.map((c) => c.id)).toStrictEqual(['item', 'qty']);
  });

  it('carries the read_only flag onto the column', () => {
    const columns = childFieldsToColumns(fields);
    expect(columns.find((c) => c.id === 'qty')?.readOnly).toBe(true);
    expect(columns.find((c) => c.id === 'item')?.readOnly).toBe(false);
  });
});

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** Calls a registry adapter directly; the adapters are plain functions without hooks. */
const renderAdapter = (component: ComponentType<FieldRenderProps>, props: FieldRenderProps): InspectableElement => {
  // SAFETY: every adapter under test is a plain function component (see the file header), never a class or exotic component
  const adapter = component as (adapterProps: FieldRenderProps) => InspectableElement;
  return adapter(props);
};

describe('form adapters (registry context)', () => {
  it('Autocomplete maps to a creatable Combobox over static options (not a Data input)', () => {
    const AutocompleteComponent = getFieldComponent('Autocomplete')!;
    expect(AutocompleteComponent).not.toBe(getFieldComponent('Data'));
    const element = renderAdapter(
      AutocompleteComponent,
      propsFor({
        value: 'Green',
        fieldMeta: { type: 'Autocomplete', name: 'color', options: 'Red\nGreen' },
      }),
    );
    expect(element.type).toBe(Combobox);
    expect(element.props.options).toStrictEqual([
      { label: 'Red', value: 'Red' },
      { label: 'Green', value: 'Green' },
    ]);
    expect(element.props.creatable).toBe(true);
    // Off-list free-text values still display themselves in the trigger.
    expect(element.props.valueLabel).toBe('Green');
    expect(element.props.onCreate('Teal')).toStrictEqual({ label: 'Teal', value: 'Teal' });
  });

  it('Image maps to a read-only ImageField (display-only widget)', () => {
    const ImageComponent = getFieldComponent('Image')!;
    const element = renderAdapter(ImageComponent, propsFor({ value: '/files/logo.png' }));
    expect(element.type).toBe(ImageField);
    expect(element.props.readOnly).toBe(true);
    expect(element.props.value).toBe('/files/logo.png');
  });

  it('Rating adapter passes the df.options star count through as maxStars', () => {
    const RatingComponent = getFieldComponent('Rating')!;
    const element = renderAdapter(
      RatingComponent,
      propsFor({ value: 0.5, fieldMeta: { type: 'Rating', name: 'score', options: '10' } }),
    );
    expect(element.type).toBe(Rating);
    expect(element.props.maxStars).toBe(10);
    expect(element.props.value).toBe(0.5);
  });

  it('unregistered fieldtypes resolve to undefined (SchemaForm renders the honest fallback)', () => {
    expect(getFieldComponent('Some Custom Type')).toBeUndefined();
  });

  it('Attach and Attach Image forward the library feed (MPO-53 AC-11 clobber guard)', () => {
    // 035867446 rewrote these adapters and silently dropped the
    // library/libraryFiles/libraryFolder pass-through, severing Attach's
    // choose-from-library tab from every schema-driven form. The feed is part
    // of the adapter contract; this pins it.
    const files = [{ name: 'inv-1', file_name: 'invoice.pdf', folder: 'Home', file_url: '/files/invoice.pdf' }];
    for (const fieldtype of ['Attach', 'Attach Image']) {
      const Component = getFieldComponent(fieldtype)!;
      const element = renderAdapter(Component, propsFor({ value: null, libraryFiles: files, libraryFolder: 'Home' }));
      expect(element.props.library).toBe(true);
      expect(element.props.libraryFiles).toBe(files);
      expect(element.props.libraryFolder).toBe('Home');
    }
    const AttachComponent = getFieldComponent('Attach')!;
    const disabledTab = renderAdapter(AttachComponent, propsFor({ value: null, library: false }));
    expect(disabledTab.props.library).toBe(false);
  });

  it('Icon is registered and adapts to the Icon picker', () => {
    const IconComponent = getFieldComponent('Icon')!;
    expect(IconComponent).toBeDefined();
    const element = renderAdapter(
      IconComponent,
      propsFor({
        value: 'mail',
        fieldMeta: { type: 'Icon', name: 'workspace_icon' },
      }),
    );
    expect(element.type).toBe(Icon);
    expect(element.props.value).toBe('mail');
  });

  it('union-minus-registry holds no real fieldtype (structural types only)', () => {
    // A real fieldtype missing from the registry renders the unsupported-type
    // string (the MPO-51 Icon hole, reopened once already by 035867446's
    // registry rewrite), so the whole union is asserted against the registry.
    // The three breaks and Fold never get adapters: FormSection / FormGrid /
    // Tabs serve them structurally.
    const unregistered = frappeFieldTypes.filter((fieldtype) => !getFieldComponent(fieldtype));
    expect(unregistered.toSorted()).toStrictEqual(['Column Break', 'Fold', 'Section Break', 'Tab Break'].toSorted());
  });

  it('registers nothing outside the FrappeFieldType union (MPO-15)', () => {
    expectTypeOf(registerField).parameter(0).toEqualTypeOf<FrappeFieldType>();
    const union = new Set<string>(frappeFieldTypes);
    const registered = [...registeredFieldtypesFromSource()];
    expect(registered.length).toBeGreaterThan(40);
    expect(registered.filter((fieldtype) => !union.has(fieldtype))).toStrictEqual([]);
    for (const custom of customFieldTypes) {
      expect(getFieldComponent(custom), custom).toBeDefined();
    }
  });

  it('Button is in the FrappeFieldType union and adapts to the house Button', () => {
    expectTypeOf<'Button'>().toExtend<FrappeFieldType>();
    const ButtonComponent = getFieldComponent('Button')!;
    expect(ButtonComponent).toBeDefined();
    const element = renderAdapter(
      ButtonComponent,
      propsFor({
        label: 'Make Payment Entry',
        fieldMeta: { type: 'Button', name: 'make_payment_entry' },
      }),
    );
    expect(element.type).toBe(Button);
    expect(element.props.children).toBe('Make Payment Entry');
  });
});
