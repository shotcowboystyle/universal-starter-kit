import { useUrlState } from '@repo/router';
import { Preset, useResolvedKnobs } from '@repo/theme';
import { useForm, useSelector } from '@tanstack/react-form';
import type { AnyFormApi, FormApi, FormOptions } from '@tanstack/react-form';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { Form as TamaguiForm, XStack, YStack, isWeb } from 'tamagui';
import type { TamaguiElement, FormProps as TamaguiFormProps } from 'tamagui';

// oxlint-disable-next-line import/no-cycle -- Form renders the save bar and the bar reads the form context; splitting the context out would move exported modules
import { ContextualSaveBar } from '../ContextualSaveBar';
import type { ContextualSaveBarProps } from '../ContextualSaveBar';
import { ErrorSummary, collectFormFieldErrors } from '../ErrorSummary';
import type { ErrorSummaryItem } from '../ErrorSummary';
import { RequiredMarkingContext, mapHouseRequiredMarking } from '../required-marking';

import { getFormSubmission } from './submission-controller';
import { resolveEffectiveValidateOn } from './validate-on';
import type { FormValidateOn } from './validate-on';

export type { FormValidateOn } from './validate-on';
export { resolveEffectiveValidateOn, remapValidatorsForTiming, type EffectiveValidateOn } from './validate-on';

// oxlint-disable-next-line typescript/no-explicit-any -- FormApi carries 11 validator type parameters that differ per form; `any` is the only argument that accepts them all
type FormApiFor<TFormData> = FormApi<TFormData, any, any, any, any, any, any, any, any, any, any, any>;

// oxlint-disable-next-line typescript/no-explicit-any -- same 11 per-form validator type parameters as FormApiFor
type FormOptionsFor<TFormData> = FormOptions<TFormData, any, any, any, any, any, any, any, any, any, any, any>;

// oxlint-disable-next-line react-doctor/only-export-components -- the context is part of the Form public API and must live beside the provider
export const FormContext = createContext<AnyFormApi | undefined>(undefined);

/**
 * The enclosing form. Outside a `<Form>` the value is `undefined` at runtime
 * (callers such as `useFormField` fall back to an explicit `form` prop).
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the default shape of a form's values when the caller names none
type DefaultFormValues = Record<string, unknown>;

export const useFormContext = <TParentData = DefaultFormValues,>(): FormApiFor<TParentData> =>
  // SAFETY: every field and action rendered inside a <Form> sees the form it provides; callers outside one pass an explicit `form` and never read this value.
  // oxlint-disable-next-line typescript/no-non-null-assertion -- see the SAFETY note above
  useContext(FormContext)!;

export interface FormValidateContextValue {
  validateOn: FormValidateOn;
  /** True after ≥1 submit attempt (upgrades `"submit"` → blur-then-change). */
  hasSubmitted: boolean;
}

const defaultValidateContext: FormValidateContextValue = {
  validateOn: 'submit',
  hasSubmitted: false,
};

// oxlint-disable-next-line react-doctor/only-export-components -- the context is part of the Form public API and must live beside the provider
export const FormValidateContext = createContext<FormValidateContextValue>(defaultValidateContext);

export const useFormValidate = (): FormValidateContextValue => useContext(FormValidateContext);

export type FormSaveMode = 'embedded' | 'declarative';

export interface FormSaveModeContextValue {
  mode: FormSaveMode;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a committed field value can be of any field type; the consumer owns the interpretation
  onAutoCommit?: (name: string, value: unknown) => void;
}

const defaultSaveMode: FormSaveModeContextValue = { mode: 'embedded' };

/** Declarative forms stage text/checkbox/radio; switches auto-commit. */
// oxlint-disable-next-line react-doctor/only-export-components -- the context is part of the Form public API and must live beside the provider
export const FormSaveModeContext = createContext<FormSaveModeContextValue>(defaultSaveMode);

export const useFormSaveMode = (): FormSaveModeContextValue => useContext(FormSaveModeContext);

export interface FormProps<TFormData, _TFormValidator = unknown> extends Omit<TamaguiFormProps, 'onSubmit'> {
  children: ReactNode;
  form?: FormApiFor<TFormData>;
  formOptions?: FormOptionsFor<TFormData>;
  onSubmit?: (values: TFormData) => void | Promise<void>;
  syncWithUrl?: boolean;
  urlDebounceMs?: number;
  submitText?: string;
  /**
   * When true (default), render {@link ErrorSummary} above fields after a
   * failed submit that produced field errors. Set false to opt out
   * (embedded/inline forms).
   */
  showErrorSummary?: boolean;
  /** Heading for the auto ErrorSummary. */
  errorSummaryTitle?: string;
  /**
   * Preferred validation timing. Default `"submit"`.
   * After the first submit attempt, `"submit"` remaps field `onSubmit`
   * validators onto blur + change so errors clear live (blur-then-change).
   * Explicit `"blur"` / `"change"` always attach those listeners.
   */
  validateOn?: FormValidateOn;
  /**
   * Nested scale. Steps space/density down one level and wraps
   * descendants in a compact density Preset so fields inherit the same
   * gaps without a per-field `compact` prop. Density/space still own
   * gaps; size still owns control height (density≠size).
   */
  compact?: boolean;
  /**
   * Desk/record surfaces where the form IS the route. Renders
   * {@link ContextualSaveBar} and puts fields in declarative save mode —
   * text/checkbox/radio stage; Switch auto-commits and never raises the bar.
   * Resting/embedded forms keep {@link FormActions}.
   */
  saveBar?: boolean | ContextualSaveBarProps;
}

const AutoErrorSummary = ({
  form,
  title,
  formElement,
}: {
  form: AnyFormApi;
  title?: string;
  formElement: HTMLElement | null;
}) => {
  const fieldMeta = useSelector(form.store, (state) => state.fieldMeta);
  const submissionAttempts = useSelector(form.store, (state) => state.submissionAttempts);
  if (submissionAttempts < 1) {
    return null;
  }
  const errors: ErrorSummaryItem[] = collectFormFieldErrors(fieldMeta);
  if (errors.length === 0) {
    return null;
  }
  return (
    <ErrorSummary
      errors={errors}
      title={title}
      formElement={formElement}
    />
  );
};

const FormValidateProvider = ({
  form,
  validateOn,
  children,
}: {
  form: AnyFormApi;
  validateOn: FormValidateOn;
  children: ReactNode;
}) => {
  const submissionAttempts = useSelector(form.store, (state) => state.submissionAttempts);
  const hasSubmitted = submissionAttempts >= 1;
  const value = useMemo(() => ({ validateOn, hasSubmitted }), [validateOn, hasSubmitted]);
  return <FormValidateContext.Provider value={value}>{children}</FormValidateContext.Provider>;
};

/** Nothing to tear down when an effect has no subscription to remove. */
const noopCleanup = () => {
  // Intentionally empty: the effect registered nothing.
};

/** Props for the save bar: the object form's own props, nothing for `true`, `false` or omitted. */
const saveBarPropsFor = (saveBar: FormProps<object>['saveBar']): ContextualSaveBarProps =>
  saveBar === true || saveBar === false || saveBar === undefined ? {} : saveBar;

export const Form = <TFormData extends object>({
  children,
  form: providedForm,
  formOptions,
  onSubmit,
  syncWithUrl = false,
  urlDebounceMs = 500,
  submitText: _submitText,
  showErrorSummary = true,
  errorSummaryTitle,
  validateOn = 'submit',
  compact,
  saveBar,
  ...tamaguiFormProps
}: FormProps<TFormData>) => {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const requiredMarkMode = mapHouseRequiredMarking(knobProps.requiredMarking);
  const formAutofocusOn = knobProps.formAutofocus === 'on';

  // Get URL state — always call the hook, only use its values when syncWithUrl is true
  const [urlState, setUrlState] = useUrlState<TFormData>(
    // SAFETY: an empty object is only a placeholder default; it is read back only when syncWithUrl is true, and then the router deserializes URL params against these defaults.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- placeholder default described above
    formOptions?.defaultValues ?? ({} as TFormData),
    {
      debounceMs: urlDebounceMs,
    },
  );

  // Use a ref to always call the latest onSubmit
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const [formElement, setFormElement] = useState<HTMLElement | null>(null);
  const didAutofocusRef = useRef(false);

  // Create form with URL state as default values.
  // Pass a minimal empty config when providedForm is given so the inner form is a no-op.
  const defaultForm = useForm(
    providedForm
      ? {}
      : {
          ...formOptions,
          defaultValues: syncWithUrl ? urlState : formOptions?.defaultValues,
          onSubmit: async ({ value, formApi }) => {
            // Call the component's onSubmit prop via ref to get latest value
            if (onSubmitRef.current) {
              await onSubmitRef.current(value);
            }
            // Also call formOptions onSubmit if provided (but not twice)
            else if (formOptions?.onSubmit) {
              await formOptions.onSubmit({ value, formApi, meta: {} });
            }
          },
        },
  );

  const form = providedForm ?? defaultForm;

  // Sync form state to URL when enabled
  useEffect(() => {
    if (!syncWithUrl) {
      return noopCleanup;
    }

    const subscription = form.store.subscribe(() => {
      const { values } = form.store.state;
      setUrlState(values);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [form, syncWithUrl, setUrlState]);

  const handleSubmit = useMemo(
    () => (e?: SyntheticEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      // Guard against double-fire while a submission is already in flight
      if (form.state.isSubmitting) {
        return;
      }
      // Trigger Tanstack Form's handleSubmit which calls our onSubmit callback
      void getFormSubmission(form).submit();
    },
    [form],
  );

  // Capture the native form element for ErrorSummary focus targeting (web).
  const setFormRef = useCallback((node: TamaguiElement | null) => {
    if (!isWeb || !(node instanceof HTMLElement)) {
      setFormElement(null);
      return;
    }
    setFormElement(node.tagName === 'FORM' ? node : (node.querySelector<HTMLElement>('form') ?? node));
  }, []);

  // House `formAutofocus`: default off (a11y). Only focus first control when knob is on.
  // `children` is deliberately a dependency: fields mount with the children, and the
  // first control can only be focused once it exists.
  useEffect(() => {
    if (!formAutofocusOn || !isWeb || didAutofocusRef.current) {
      return;
    }
    const first = formElement?.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    );
    if (!first) {
      return;
    }
    first.focus();
    didAutofocusRef.current = true;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- re-run when children change so the first control is found once it mounts
  }, [formAutofocusOn, children, formElement]);

  const saveBarProps = saveBarPropsFor(saveBar);
  const hasSaveBar = saveBar !== undefined && saveBar !== false;
  const { onAutoCommit } = saveBarProps;
  const saveMode = useMemo<FormSaveModeContextValue>(
    () => ({ mode: hasSaveBar ? 'declarative' : 'embedded', onAutoCommit }),
    [hasSaveBar, onAutoCommit],
  );
  const requiredMarking = useMemo(() => ({ mode: requiredMarkMode }), [requiredMarkMode]);

  const formNode = (
    <FormContext.Provider value={form}>
      <FormSaveModeContext.Provider value={saveMode}>
        <RequiredMarkingContext.Provider value={requiredMarking}>
          <FormValidateProvider
            form={form}
            validateOn={validateOn}>
            <TamaguiForm
              ref={setFormRef}
              onSubmit={handleSubmit}
              {...tamaguiFormProps}>
              <YStack
                data-mpo-form-layout=""
                data-gap={knobProps.gap.gap}
                data-density={knobProps.density}
                data-size={knobProps.size}
                data-nested={compact ? 'true' : undefined}
                width="100%"
                minWidth={0}
                {...knobProps.gap}
                {...(tamaguiFormProps.flex == null ? {} : { flex: tamaguiFormProps.flex })}>
                {showErrorSummary ? (
                  <AutoErrorSummary
                    form={form}
                    title={errorSummaryTitle}
                    formElement={formElement}
                  />
                ) : null}
                {children}
                {hasSaveBar ? <ContextualSaveBar {...saveBarProps} /> : null}
              </YStack>
            </TamaguiForm>
          </FormValidateProvider>
        </RequiredMarkingContext.Provider>
      </FormSaveModeContext.Provider>
    </FormContext.Provider>
  );

  return compact ? <Preset overrides={{ density: 'compact' }}>{formNode}</Preset> : formNode;
};

export interface FormActionsProps {
  children: ReactNode;
  /** Eject the within-group gap recipe. */
  gap?: number | string;
}

/**
 * GOV.UK / Polaris action row: left-aligned, wraps, gapped via the space
 * recipe — never stretched to the form column and never sized from `sizeToken`.
 */
export const FormActions = ({ children, gap }: FormActionsProps) => {
  const { knobProps } = useResolvedKnobs();
  const resolvedGap = gap ?? knobProps.gap.gap;
  return (
    <XStack
      data-mpo-form-actions=""
      data-gap={String(resolvedGap)}
      data-density={knobProps.density}
      data-size={knobProps.size}
      // SAFETY: `gap` is a space token or a px number at every call site; Tamagui types token strings more narrowly than `string`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
      gap={resolvedGap as never}
      alignSelf="flex-start"
      alignItems="center"
      flexWrap="wrap">
      {children}
    </XStack>
  );
};

/**
 * Effective timing for the current FormValidate context.
 * @internal
 */
export const useEffectiveValidateOn = () => {
  const { validateOn, hasSubmitted } = useFormValidate();
  return resolveEffectiveValidateOn(validateOn, hasSubmitted);
};
