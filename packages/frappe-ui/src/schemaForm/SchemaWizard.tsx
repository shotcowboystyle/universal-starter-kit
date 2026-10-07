import { Wizard } from '@repo/ui';
import type { WizardFormLike, WizardStatus, WizardStep } from '@repo/ui';
import { cloneElement, isValidElement, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { FieldSchema } from '../fieldRegistry';

import { SchemaForm } from './index';
import type { FormSchema, FormSection, SchemaFormProps } from './index';

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold', 'Button']);

function sectionFields(section: FormSection): FieldSchema[] {
  return section.columns.flatMap((column) => column.fields);
}

function isEmpty(value: unknown): boolean {
  return value == null || value === '';
}

function withFieldIdentity(rendered: ReactNode, field: FieldSchema): ReactNode {
  if (!isValidElement(rendered)) {
    return rendered;
  }
  const props = rendered.props as { id?: string; name?: string };
  return cloneElement(rendered, {
    id: props.id ?? field.name,
    name: props.name ?? field.name,
  } as never);
}

function inputFields(fields: FieldSchema[]): FieldSchema[] {
  return fields.filter((field) => !LAYOUT_TYPES.has(field.type) && !field.hidden);
}

/** Cut wizard steps from schema section breaks; review is always last. */
export function schemaToWizardSteps(schema: FormSchema, reviewLabel = 'Review'): WizardStep[] {
  const sectionSteps = schema.sections.map((section, index) => {
    const fields = inputFields(sectionFields(section));
    return {
      id: section.label ? section.label.toLowerCase().replaceAll(/\s+/g, '-') : `section-${index}`,
      label: section.label ?? `Step ${index + 1}`,
      description: section.description,
      fields: fields.map((field) => field.name),
      fieldLabels: Object.fromEntries(fields.map((field) => [field.name, field.label ?? field.name])),
    };
  });
  return [...sectionSteps, { id: 'review', label: reviewLabel, review: true }];
}

export interface SchemaWizardProps extends Omit<SchemaFormProps, 'schema'> {
  schema: FormSchema;
  completeLabel: string;
  onComplete?: () => void | Promise<void>;
  onCancel?: () => void;
  reviewLabel?: string;
  status?: WizardStatus;
  labels?: 'visible' | 'hidden' | 'auto';
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
}

export function SchemaWizard({
  schema,
  doc,
  setValue,
  errors = {},
  completeLabel,
  onComplete,
  onCancel,
  reviewLabel = 'Review',
  status = 'ready',
  labels,
  compact,
  emptyTitle,
  emptyDescription,
  errorTitle,
  errorDescription,
  ...schemaFormProps
}: SchemaWizardProps) {
  const steps = useMemo(() => schemaToWizardSteps(schema, reviewLabel), [reviewLabel, schema]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldErrorsRef = useRef(fieldErrors);
  fieldErrorsRef.current = fieldErrors;
  const docRef = useRef(doc);
  docRef.current = doc;

  const fieldByName = useMemo(() => {
    const map = new Map<string, FieldSchema>();
    for (const field of inputFields(schema.fields)) {
      map.set(field.name, field);
    }
    return map;
  }, [schema.fields]);

  const wrapSetValue = useCallback(
    (name: string, value: unknown) => {
      setValue(name, value);
      if (fieldErrorsRef.current[name]) {
        const next = { ...fieldErrorsRef.current };
        delete next[name];
        fieldErrorsRef.current = next;
        setFieldErrors(next);
      }
    },
    [setValue],
  );

  const form = useMemo<WizardFormLike>(
    () => ({
      getFieldValue: (name) => docRef.current[name],
      setFieldValue: (name, value) => {
        wrapSetValue(name, value);
      },
      getFieldMeta: (name) => {
        const message = fieldErrorsRef.current[name] ?? errors[name];
        return { errors: message ? [message] : [] };
      },
      validateField: (name) => {
        const field = fieldByName.get(name);
        const value = docRef.current[name];
        if (field?.required && isEmpty(value)) {
          const message = `${field.label ?? name} is required`;
          const next = { ...fieldErrorsRef.current, [name]: message };
          fieldErrorsRef.current = next;
          setFieldErrors(next);
          return message;
        }
        if (fieldErrorsRef.current[name]) {
          const next = { ...fieldErrorsRef.current };
          delete next[name];
          fieldErrorsRef.current = next;
          setFieldErrors(next);
        }
        return;
      },
    }),
    [errors, fieldByName, wrapSetValue],
  );

  const mergedErrors = useMemo(() => ({ ...errors, ...fieldErrors }), [errors, fieldErrors]);

  return (
    <Wizard
      steps={steps}
      form={form}
      completeLabel={completeLabel}
      onComplete={onComplete}
      onCancel={onCancel}
      status={status}
      labels={labels}
      compact={compact}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      errorTitle={errorTitle}
      errorDescription={errorDescription}>
      {schema.sections.map((section, index) => (
        <Wizard.Panel key={steps[index]?.id ?? index}>
          <SchemaForm
            {...schemaFormProps}
            schema={{
              sections: [{ ...section, label: undefined, description: undefined, hideBorder: true }],
              fields: schema.fields,
            }}
            doc={doc}
            setValue={wrapSetValue}
            errors={mergedErrors}
            renderFieldWrapper={(rendered, field) => {
              const identified = withFieldIdentity(rendered, field);
              return schemaFormProps.renderFieldWrapper
                ? schemaFormProps.renderFieldWrapper(identified, field)
                : identified;
            }}
          />
        </Wizard.Panel>
      ))}
      <Wizard.Panel>
        <Wizard.Review />
      </Wizard.Panel>
    </Wizard>
  );
}
