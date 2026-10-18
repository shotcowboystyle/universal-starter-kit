import type { AnyFormApi } from '../types';

/**
 * A Switch bound to an immediate effect commits on
 * flip. Updating that field's default so `isDirty` stays false means the
 * page-level bar never rises, and a later Discard cannot revert the flip.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- public helper over a form of unknown shape; the field's value type is erased
export const commitImmediateField = (form: AnyFormApi, name: string, value: unknown): void => {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- AnyFormApi erases the form's data type, so its defaultValues are `any`
  form.update({ defaultValues: { ...form.options.defaultValues, [name]: value } });
  form.setFieldMeta(name, (prev) => ({
    ...prev,
    isDirty: false,
    isDefaultValue: true,
  }));
};
