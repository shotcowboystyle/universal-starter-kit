import { action } from '@repo/storybook';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import type { FieldSchema } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';
import { SchemaForm } from '../../schemaForm';
import type { FormSchema } from '../../schemaForm';
import { Check } from '../Check';
import { Data } from '../Data';

import { Heading } from '.';
import type { HeadingProps } from '.';

export default {
  title: 'FrappeUI/Heading',
  component: Heading,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A section heading component for organizing form fields with optional collapsible sections.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Heading text' },
    description: { control: 'text', description: 'Optional description text' },
    level: {
      control: 'select',
      options: [1, 2, 3, 4],
      description: 'Heading level (H1-H4)',
    },
    collapsible: { control: 'boolean', description: 'Allow section to collapse' },
    defaultCollapsed: { control: 'boolean', description: 'Start collapsed' },
    showSeparator: { control: 'boolean', description: 'Show separator line' },
  },
};

export const Default = (args: HeadingProps) => <Heading {...args} />;
Default.args = {
  label: 'General Information',
  level: 2,
} satisfies Partial<HeadingProps>;

Default.storyName = 'Main';
export const Collapsible = () => (
  <YStack
    gap="$4"
    width={500}>
    <Heading
      label="Personal Information"
      description="Click to expand/collapse"
      level={2}
      collapsible
      onCollapseChange={action('onCollapseChange')}>
      <YStack
        gap="$3"
        paddingTop="$3">
        <Text color="$gray11">This content is inside the collapsible section.</Text>
      </YStack>
    </Heading>
  </YStack>
);
Collapsible.parameters = {
  docs: {
    description: {
      story: 'Collapsible sections can be toggled by clicking the heading.',
    },
  },
};

export const FormWithSections = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [newsletter, setNewsletter] = useState(false);

  return (
    <YStack
      gap="$4"
      width={500}>
      <Heading
        label="Personal Information"
        level={2}
        showSeparator
        collapsible>
        <YStack
          gap="$3"
          paddingTop="$3">
          <Data
            label="First Name"
            value={firstName}
            onChange={(v) => {
              setFirstName(v);
            }}
            required
          />
          <Data
            label="Last Name"
            value={lastName}
            onChange={(v) => {
              setLastName(v);
            }}
            required
          />
        </YStack>
      </Heading>

      <Heading
        label="Contact Information"
        level={2}
        showSeparator
        collapsible>
        <YStack
          gap="$3"
          paddingTop="$3">
          <Data
            label="Email"
            value={email}
            onChange={(v) => {
              setEmail(v);
            }}
            required
          />
        </YStack>
      </Heading>

      <Heading
        label="Preferences"
        description="Optional settings"
        level={2}
        showSeparator
        collapsible
        defaultCollapsed>
        <YStack
          gap="$3"
          paddingTop="$3">
          <Check
            label="Subscribe to newsletter"
            value={newsletter}
            onChange={(v) => {
              setNewsletter(v);
            }}
          />
        </YStack>
      </Heading>
    </YStack>
  );
};
FormWithSections.parameters = {
  docs: {
    description: {
      story: 'Real-world example of using Heading to organize a form into collapsible sections.',
    },
  },
};

const headingInTableFields: FieldSchema[] = [
  { type: 'Heading', name: 'identity_break', label: 'Identity' },
  { type: 'Data', name: 'title', label: 'Title' },
  { type: 'Heading', name: 'notes_break', label: 'Notes' },
  { type: 'Data', name: 'notes', label: 'Notes' },
];

const headingInTableSchema: FormSchema = {
  fields: headingInTableFields,
  sections: [
    {
      label: 'General Information',
      description:
        'Heading is TABLE_LAYOUT — it is never a child-table column. Shown here as SchemaForm section chrome plus Heading fieldtypes.',
      columns: [{ fields: headingInTableFields }],
    },
  ],
};

function InTableStory() {
  const [doc, setDoc] = useState<Record<string, unknown>>({
    title: 'Alpha widget',
    notes: 'Follow up after the site visit.',
  });
  return (
    <YStack
      width="100%"
      maxWidth={520}>
      <SchemaForm
        schema={headingInTableSchema}
        doc={doc}
        setValue={(field, value) => {
          action('setValue')(field, value);
          setDoc((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </YStack>
  );
}

/**
 * Heading is TABLE_LAYOUT — skip the editable DataTable cell. SchemaForm mock
 * with Heading fieldtypes + section chrome (fieldtypeToTableField falls through
 * to a read-only input and is not used as a column).
 */
export const InTable = () => (
  <FrappeStoryProvider>
    <InTableStory />
  </FrappeStoryProvider>
);
InTable.storyName = 'In table';
InTable.parameters = {
  docs: {
    description: {
      story:
        'Heading is TABLE_LAYOUT_TYPES, so there is no editable LiveCell. This story mounts a SchemaForm mock section with Heading fieldtypes instead. fieldtypeToTableField("Heading") is the unmapped read-only fallback and is not used as a column.',
    },
  },
};
