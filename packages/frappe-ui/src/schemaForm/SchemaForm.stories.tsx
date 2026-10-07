import { action } from '@repo/storybook';
import React, { useState } from 'react';
import { Text, YStack } from 'tamagui';

import type { FieldSchema } from '../fieldRegistry';

import { SchemaForm } from './index';
import type { FormSchema } from './index';

export default {
  title: 'FrappeUI/SchemaForm',
  component: SchemaForm,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Schema-driven form renderer: sections → columns → fields resolved through the fieldRegistry. Supports depends_on, overrides, hidden and read-only fields, and R2 `order` (listed names permute in place).',
      },
    },
  },
};

const fields: FieldSchema[] = [
  { type: 'Data', name: 'first_name', label: 'First Name', required: true },
  { type: 'Data', name: 'last_name', label: 'Last Name' },
  { type: 'Select', name: 'status', label: 'Status', options: 'Open\nWorking\nCompleted' },
  { type: 'Check', name: 'is_active', label: 'Active' },
  { type: 'Int', name: 'age', label: 'Age' },
  { type: 'Date', name: 'joined_on', label: 'Joined On' },
];

const schema: FormSchema = {
  fields,
  sections: [
    {
      label: 'Identity',
      columns: [{ fields: [fields[0], fields[2]] }, { fields: [fields[1], fields[3]] }],
    },
    {
      label: 'Details',
      columns: [{ fields: [fields[4], fields[5]] }],
    },
  ],
};

function StatefulForm({
  initialDoc = {},
  ...props
}: Partial<React.ComponentProps<typeof SchemaForm>> & { initialDoc?: Record<string, any> }) {
  const [doc, setDoc] = useState<Record<string, any>>(initialDoc);
  return (
    <YStack
      maxWidth={720}
      gap="$2">
      <SchemaForm
        schema={schema}
        doc={doc}
        setValue={(field, value) => {
          action('setValue')(field, value);
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
        {...props}
      />
      <Text
        data-testid="doc-state"
        fontSize="$1"
        color="$color9">
        {JSON.stringify(doc)}
      </Text>
    </YStack>
  );
}

export const Main = () => <StatefulForm initialDoc={{ first_name: 'Jane', status: 'Open', is_active: true }} />;
Main.storyName = 'Main';

/**
 * Adjudication target for audit finding #3: `readOnlyFields` (and per-field
 * `readOnly` in the schema) are converted to `disabled`, losing focusable /
 * copyable read-only semantics. `first_name` is read-only via prop,
 * `last_name` via schema `readOnly: true`, the rest stay editable.
 */
export const ReadOnlyVsDisabled = () => {
  const roSchema: FormSchema = {
    fields: [
      { type: 'Data', name: 'first_name', label: 'ReadOnly via prop' },
      { type: 'Data', name: 'last_name', label: 'ReadOnly via schema', readOnly: true },
      { type: 'Data', name: 'editable', label: 'Editable' },
    ],
    sections: [
      {
        label: 'ReadOnly Mapping',
        columns: [
          {
            fields: [
              { type: 'Data', name: 'first_name', label: 'ReadOnly via prop' },
              { type: 'Data', name: 'last_name', label: 'ReadOnly via schema', readOnly: true },
              { type: 'Data', name: 'editable', label: 'Editable' },
            ],
          },
        ],
      },
    ],
  };
  const [doc, setDoc] = useState<Record<string, any>>({
    first_name: 'copy me if you can',
    last_name: 'schema read-only value',
    editable: 'type here',
  });
  return (
    <SchemaForm
      schema={roSchema}
      doc={doc}
      setValue={(field, value) => {
        setDoc((prev) => ({ ...prev, [field]: value }));
      }}
      readOnlyFields={['first_name']}
    />
  );
};

export const Disabled = () => (
  <StatefulForm
    initialDoc={{ first_name: 'Jane', last_name: 'Doe' }}
    disabled
  />
);

/**
 * `hide_border` (df.hide_border) is SF-TRANSPARENT: no card fill, no heading
 * separator. Default sections are house Card / `cardSurface` (SF-CARD, no
 * hardcoded 1px border).
 */
export const HideBorder = () => {
  const ghost: FormSchema = {
    fields,
    sections: schema.sections.map((section) => ({ ...section, hideBorder: true })),
  };
  const [doc, setDoc] = useState<Record<string, any>>({
    first_name: 'Jane',
    status: 'Open',
    is_active: true,
  });
  return (
    <YStack maxWidth={720}>
      <SchemaForm
        schema={ghost}
        doc={doc}
        setValue={(field, value) => {
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </YStack>
  );
};
HideBorder.storyName = 'Hide border (SF-TRANSPARENT)';

export const RequiredAndErrors = () => (
  <StatefulForm
    initialDoc={{}}
    errors={{ first_name: 'First name is required', age: 'Must be a positive number' }}
  />
);

/** `status` toggles visibility of a dependent field (bare ref + eval: expression). */
export const ConditionalFields = () => {
  const condFields: FieldSchema[] = [
    { type: 'Select', name: 'status', label: 'Status', options: 'Open\nCompleted' },
    {
      type: 'Data',
      name: 'completion_notes',
      label: 'Completion Notes (eval: status == Completed)',
      depends_on: 'eval:doc.status === "Completed"',
    },
    {
      type: 'Data',
      name: 'status_reason',
      label: 'Status Reason (bare ref: status truthy)',
      depends_on: 'status',
    },
  ];
  const condSchema: FormSchema = {
    fields: condFields,
    sections: [{ label: 'Conditional', columns: [{ fields: condFields }] }],
  };
  const [doc, setDoc] = useState<Record<string, any>>({});
  return (
    <SchemaForm
      schema={condSchema}
      doc={doc}
      setValue={(field, value) => {
        setDoc((prev) => ({ ...prev, [field]: value }));
      }}
    />
  );
};

/** Unknown field type must render the "Unsupported field type" fallback, not crash. */
export const UnknownFieldType = () => {
  const unknownFields: FieldSchema[] = [
    { type: 'Data', name: 'known', label: 'Known Field' },
    { type: 'Quantum Flux', name: 'mystery', label: 'Mystery Field' },
  ];
  return (
    <SchemaForm
      schema={{
        fields: unknownFields,
        sections: [{ label: 'Unknown', columns: [{ fields: unknownFields }] }],
      }}
      doc={{}}
      setValue={action('setValue')}
    />
  );
};

/** Empty schema: no sections at all. Must render an empty stack. */
export const EmptySchema = () => (
  <SchemaForm
    schema={{ fields: [], sections: [] }}
    doc={{}}
    setValue={action('setValue')}
  />
);

export const HiddenFields = () => (
  <StatefulForm
    initialDoc={{ first_name: 'Jane' }}
    hideFields={['last_name', 'age']}
  />
);

/**
 * R2 cheap path (MPO-22 / GL-64): `order` permutes listed fields in place.
 * Here status then first_name swap among their slots; last_name / is_active /
 * age / joined_on stay put. No `sections` tree required.
 */
export const OrderInPlace = () => (
  <StatefulForm
    initialDoc={{ first_name: 'Jane', status: 'Open', is_active: true }}
    order={['status', 'first_name']}
  />
);
OrderInPlace.storyName = 'Order in place (R2)';

/** Field overrides: render function, component and props-merge forms. */
export const Overrides = () => (
  <StatefulForm
    initialDoc={{ first_name: 'Jane', status: 'Open' }}
    overrides={{
      first_name: {
        props: { placeholder: 'overridden placeholder' },
      },
      status: (props) => (
        <YStack
          data-testid="override-fn"
          padding="$2"
          backgroundColor="$color3">
          <Text fontSize="$2">
            fn override for {props.label}: {String(props.value)}
          </Text>
        </YStack>
      ),
    }}
  />
);

/**
 * Table (child table) field: columns resolved from `fieldMeta.fields` child df
 * via TableAdapter → ChildTable (no live DocType meta required).
 */
export const ChildTableField = () => {
  const tableFields: FieldSchema[] = [
    {
      type: 'Table',
      name: 'items',
      label: 'Order Items',
      options: 'Order Item',
      fields: [
        { fieldname: 'item_code', fieldtype: 'Data', label: 'Item Code', in_list_view: 1 },
        { fieldname: 'qty', fieldtype: 'Int', label: 'Qty', in_list_view: 1 },
        {
          fieldname: 'status',
          fieldtype: 'Select',
          label: 'Status',
          options: 'Draft\nSubmitted',
          in_list_view: 1,
        },
      ],
    } as FieldSchema,
  ];
  const tableSchema: FormSchema = {
    fields: tableFields,
    sections: [{ label: 'Lines', columns: [{ fields: tableFields }] }],
  };
  const [doc, setDoc] = useState<Record<string, any>>({
    items: [
      { item_code: 'SKU-100', qty: 2, status: 'Draft' },
      { item_code: 'SKU-200', qty: 1, status: 'Submitted' },
    ],
  });
  return (
    <YStack maxWidth={720}>
      <SchemaForm
        schema={tableSchema}
        doc={doc}
        setValue={(field, value) => {
          action('setValue')(field, value);
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </YStack>
  );
};

/**
 * DG-CTRL-01..06 demo: Select fieldtype auto-picks control by option count.
 * 2-option → ToggleGroup; short → RadioGroup; mid → Select; long → Combobox;
 * control=select ejects; Check uses switch/checkbox by commit.
 */
export const ChoiceHeuristics = () => {
  const mkOptions = (n: number) => Array.from({ length: n }, (_, i) => `Option ${i + 1}`).join('\n');
  const choiceFields: FieldSchema[] = [
    {
      type: 'Select',
      name: 'two_option',
      label: 'Two-option enum → ToggleGroup (DG-CTRL-04)',
      options: 'Buy\nSell',
    },
    {
      type: 'Select',
      name: 'short',
      label: 'Short (3) → RadioGroup',
      options: 'Open\nWorking\nCompleted',
    },
    {
      type: 'Select',
      name: 'mid',
      label: 'Mid (8) → Select',
      options: mkOptions(8),
    },
    {
      type: 'Select',
      name: 'long',
      label: 'Long (20) → Combobox',
      options: mkOptions(20),
    },
    {
      type: 'Select',
      name: 'eject',
      label: 'Short + control=select eject',
      options: 'A\nB\nC',
      control: 'select',
    },
    {
      type: 'Check',
      name: 'deferred_bool',
      label: 'Check deferred → Checkbox',
      commit: 'deferred',
    },
    {
      type: 'Check',
      name: 'immediate_bool',
      label: 'Check immediate → Switch',
      commit: 'immediate',
    },
  ];
  const choiceSchema: FormSchema = {
    fields: choiceFields,
    sections: [{ label: 'Choice heuristics', columns: [{ fields: choiceFields }] }],
  };
  const [doc, setDoc] = useState<Record<string, any>>({
    two_option: 'Buy',
    short: 'Open',
    mid: 'Option 1',
    long: 'Option 1',
    eject: '',
    deferred_bool: 0,
    immediate_bool: 1,
  });
  return (
    <YStack maxWidth={720}>
      <SchemaForm
        schema={choiceSchema}
        doc={doc}
        setValue={(field, value) => {
          action('setValue')(field, value);
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </YStack>
  );
};

/** Two schema columns inside a narrow shell — must stack (DG-FORM-09). */
export const NarrowColumns = () => {
  const [doc, setDoc] = useState<Record<string, any>>({
    first_name: 'Jane',
    last_name: 'Doe',
    status: 'Open',
  });
  return (
    <YStack
      maxWidth={300}
      borderWidth={1}
      borderColor="$borderColor"
      padding="$2">
      <SchemaForm
        schema={schema}
        doc={doc}
        setValue={(field, value) => {
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </YStack>
  );
};
NarrowColumns.storyName = 'Narrow columns (stack)';
