import type { AnyFormApi } from '../types';

type FormDefaults = Record<string, unknown>;

/**
 * A Switch bound to an immediate effect commits on
 * flip. Updating that field's default so `isDirty` stays false means the
 * page-level bar never rises, and a later Discard cannot revert the flip.
 */
export function commitImmediateField(form: AnyFormApi, name: string, value: unknown): void {
  const options = form.options as { defaultValues?: FormDefaults };
  const nextDefaults: FormDefaults = { ...options.defaultValues, [name]: value };
  const update = (form as { update?: (opts: { defaultValues: FormDefaults }) => void }).update;
  if (typeof update === 'function') {
    update({ defaultValues: nextDefaults });
  } else {
    options.defaultValues = nextDefaults;
  }
  const setFieldMeta = (
    form as {
      setFieldMeta?: (field: string, updater: (prev: Record<string, unknown>) => unknown) => void;
    }
  ).setFieldMeta;
  if (typeof setFieldMeta === 'function') {
    setFieldMeta(name, (prev) => ({
      ...prev,
      isDirty: false,
      isDefaultValue: true,
    }));
  }
}
