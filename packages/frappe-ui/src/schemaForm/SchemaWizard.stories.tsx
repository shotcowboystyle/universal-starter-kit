import { action } from '@repo/storybook';
import React, { useState } from 'react';

import type { FieldSchema } from '../field-registry';

import { SchemaWizard } from './SchemaWizard';

import type { FormSchema } from './index';

export default {
  title: 'FrappeUI/SchemaWizard',
  component: SchemaWizard,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Schema-driven wizard: one rail step per DocType section break, Review last, composing the components Wizard over SchemaForm.',
      },
    },
  },
};

const fields: FieldSchema[] = [
  { type: 'Data', name: 'source', label: 'Source', required: true },
  { type: 'Data', name: 'volume', label: 'Destination volume', required: true },
  { type: 'Data', name: 'region', label: 'Region', required: true },
  { type: 'Data', name: 'checksums', label: 'Checksums' },
];

const schema: FormSchema = {
  fields,
  sections: [
    { label: 'Snapshot', columns: [{ fields: [fields[0]] }] },
    { label: 'Destination', columns: [{ fields: [fields[1], fields[2]] }] },
    { label: 'Verify', columns: [{ fields: [fields[3]] }] },
  ],
};

type WizardProps = React.ComponentProps<typeof SchemaWizard>;

const discardEdit = () => {
  // Static-status stories discard edits.
};

const StatefulWizard = (props: Partial<WizardProps>) => {
  const [doc, setDoc] = useState<WizardProps['doc']>({
    source: 'backup-2026-08-27-0300',
    volume: 'vol-restore-2026-08',
    region: 'eu-central',
    checksums: 'After restore',
  });
  return (
    <SchemaWizard
      schema={schema}
      doc={doc}
      setValue={(field, value) => {
        action('setValue')(field, value);
        setDoc((prev) => ({ ...prev, [field]: value }));
      }}
      completeLabel="Restore backup"
      onCancel={() => action('cancel')()}
      onComplete={() => action('complete')()}
      labels="visible"
      {...props}
    />
  );
};

export const Main = () => <StatefulWizard />;
Main.storyName = 'Ready';

export const Loading = () => (
  <SchemaWizard
    schema={schema}
    doc={{}}
    setValue={discardEdit}
    completeLabel="Restore backup"
    status="loading"
  />
);

export const Empty = () => (
  <SchemaWizard
    schema={schema}
    doc={{}}
    setValue={discardEdit}
    completeLabel="Restore backup"
    status="empty"
  />
);

// oxlint-disable-next-line sonarjs/no-globals-shadowing, sonarjs/no-built-in-override -- Storybook keys the story by its export name, the status it shows
export const Error = () => (
  <SchemaWizard
    schema={schema}
    doc={{}}
    setValue={discardEdit}
    completeLabel="Restore backup"
    status="error"
    errorTitle="Could not load this flow"
  />
);
