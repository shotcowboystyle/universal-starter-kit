import { Wizard } from '@repo/ui';
import type { WizardFormLike, WizardStatus, WizardStep } from '@repo/ui';
import { cloneElement, isValidElement, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { FieldSchema } from '../field-registry';

import { SchemaForm } from './index';
import type { FormSchema, FormSection, SchemaFormProps } from './index';

const LAYOUT_TYPES = new Set(['Section Break', 'Column Break', 'Tab Break', 'Fold', 'Button']);
const NO_ERRORS: Record<string, string> = {};
const WHITESPACE_RUN = /\s+/gu;

const sectionFields = (section: FormSection): FieldSchema[] => section.columns.flatMap((column) => column.fields);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- checks a doc value of any fieldtype for emptiness
const isEmpty = (value: unknown): boolean => value == null || value === '';

const withFieldIdentity = (rendered: ReactNode, field: FieldSchema): ReactNode => {
  if (!isValidElement(rendered)) {
    return rendered;
  }
  // SAFETY: only the optional id/name props are read, each with a fallback
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const props = rendered.props as { id?: string; name?: string };
  // SAFETY: every registry field component accepts id and name, which it forwards to its input
  // oxlint-disable-next-line react/no-clone-element, typescript/no-unsafe-type-assertion -- stamps DOM identity onto registry-rendered fields the wizard does not own; see SAFETY above
  return cloneElement(rendered, { id: props.id ?? field.name, name: props.name ?? field.name } as never);
};

const inputFields = (fields: FieldSchema[]): FieldSchema[] =>
  fields.filter((field) => !LAYOUT_TYPES.has(field.type) && !field.hidden);

const sectionStepId = (section: FormSection, index: number): string =>
  section.label !== undefined && section.label !== ''
    ? section.label.toLowerCase().replaceAll(WHITESPACE_RUN, '-')
    : `section-${index}`;

/** Cut wizard steps from schema section breaks; review is always last. */
export const schemaToWizardSteps = (schema: FormSchema, reviewLabel = 'Review'): WizardStep[] => {
  const sectionSteps = schema.sections.map((section, index) => {
    const fields = inputFields(sectionFields(section));
    return {
      id: sectionStepId(section, index),
      label: section.label ?? `Step ${index + 1}`,
      description: section.description,
      fields: fields.map((field) => field.name),
      fieldLabels: Object.fromEntries(fields.map((field) => [field.name, field.label ?? field.name])),
    };
  });
  return [...sectionSteps, { id: 'review', label: reviewLabel, review: true }];
};

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

export const SchemaWizard = ({
  schema,
  doc,
  setValue,
  errors = NO_ERRORS,
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
}: SchemaWizardProps) => {
  const steps = useMemo(() => schemaToWizardSteps(schema, reviewLabel), [reviewLabel, schema]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldErrorsRef = useRef(fieldErrors);
  // oxlint-disable-next-line react/refs -- latest-value ref: the memoized form adapter reads the current errors
  fieldErrorsRef.current = fieldErrors;
  const docRef = useRef(doc);
  // oxlint-disable-next-line react/refs -- latest-value ref: the memoized form adapter reads the current doc
  docRef.current = doc;

  const fieldByName = useMemo(() => {
    const map = new Map<string, FieldSchema>();
    for (const field of inputFields(schema.fields)) {
      map.set(field.name, field);
    }
    return map;
  }, [schema.fields]);

  const clearFieldError = useCallback((name: string) => {
    if (fieldErrorsRef.current[name]) {
      const next = { ...fieldErrorsRef.current };
      // oxlint-disable-next-line typescript/no-dynamic-delete -- fieldErrors is a field-name dictionary
      delete next[name];
      fieldErrorsRef.current = next;
      setFieldErrors(next);
    }
  }, []);

  const wrapSetValue = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the value's type depends on the field's runtime fieldtype
    (name: string, value: unknown) => {
      setValue(name, value);
      clearFieldError(name);
    },
    [setValue, clearFieldError],
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
        const message =
          field?.required && isEmpty(docRef.current[name]) ? `${field.label ?? name} is required` : undefined;
        if (message === undefined) {
          clearFieldError(name);
        } else {
          const next = { ...fieldErrorsRef.current, [name]: message };
          fieldErrorsRef.current = next;
          setFieldErrors(next);
        }
        return message;
      },
    }),
    [errors, fieldByName, wrapSetValue, clearFieldError],
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
        <Wizard.Panel key={sectionStepId(section, index)}>
          <SchemaForm
            {...schemaFormProps}
            schema={{
              // The wizard step header shows the section label; the panel must not repeat it.
              // oxlint-disable-next-line sonarjs/no-undefined-assignment -- overriding the spread label/description with undefined hides them
              sections: [{ ...section, label: undefined, description: undefined, hideBorder: true }],
              fields: schema.fields,
            }}
            doc={doc}
            setValue={wrapSetValue}
            errors={mergedErrors}
            renderFieldWrapper={(rendered, field): ReactNode => {
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
};
