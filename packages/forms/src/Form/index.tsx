import { useUrlState } from '@repo/router';
import { Preset, useResolvedKnobs } from '@repo/theme';
import { type FormApi, type FormOptions, useForm } from '@tanstack/react-form';
import { type FormEvent, type ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Form as TamaguiForm, type FormProps as TamaguiFormProps, XStack, YStack, isWeb } from 'tamagui';

import { ContextualSaveBar, type ContextualSaveBarProps } from '../ContextualSaveBar';
import { ErrorSummary, collectFormFieldErrors, type ErrorSummaryItem } from '../ErrorSummary';
import { RequiredMarkingContext, mapHouseRequiredMarking } from '../requiredMarking';

import { getFormSubmission } from './submissionController';
import { type FormValidateOn, resolveEffectiveValidateOn } from './validateOn';

export type { FormValidateOn } from './validateOn';
export { resolveEffectiveValidateOn, remapValidatorsForTiming, type EffectiveValidateOn } from './validateOn';

export const FormContext = createContext<
  FormApi<any, any, any, any, any, any, any, any, any, any, any, any> | undefined
>(undefined);

export function useFormContext<TParentData, _TFormValidator = any>() {
  return useContext(FormContext) as FormApi<TParentData, any, any, any, any, any, any, any, any, any, any, any>;
}

export interface FormValidateContextValue {
  validateOn: FormValidateOn;
  /** True after ≥1 submit attempt (upgrades `"submit"` → blur-then-change). */
  hasSubmitted: boolean;
}

const defaultValidateContext: FormValidateContextValue = {
  validateOn: 'submit',
  hasSubmitted: false,
};

export const FormValidateContext = createContext<FormValidateContextValue>(defaultValidateContext);

export function useFormValidate(): FormValidateContextValue {
  return useContext(FormValidateContext);
}

export type FormSaveMode = 'embedded' | 'declarative';

export interface FormSaveModeContextValue {
  mode: FormSaveMode;
  onAutoCommit?: (name: string, value: unknown) => void;
}

const defaultSaveMode: FormSaveModeContextValue = { mode: 'embedded' };

/** Declarative forms stage text/checkbox/radio; switches auto-commit. */
export const FormSaveModeContext = createContext<FormSaveModeContextValue>(defaultSaveMode);

export function useFormSaveMode(): FormSaveModeContextValue {
  return useContext(FormSaveModeContext);
}

export interface FormProps<TFormData, _TFormValidator = any> extends Omit<TamaguiFormProps, 'onSubmit'> {
  children: ReactNode;
  form?: FormApi<TFormData, any, any, any, any, any, any, any, any, any, any, any>;
  formOptions?: FormOptions<TFormData, any, any, any, any, any, any, any, any, any, any, any>;
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

function AutoErrorSummary({
  form,
  title,
  formElement,
}: {
  form: FormApi<any, any, any, any, any, any, any, any, any, any, any, any>;
  title?: string;
  formElement: HTMLElement | null;
}) {
  const Subscribe = (
    form as unknown as {
      Subscribe: (props: { selector: (state: any) => any; children: (value: any) => ReactNode }) => ReactNode;
    }
  ).Subscribe;

  return (
    <Subscribe
      selector={(state: any) => ({
        fieldMeta: state.fieldMeta,
        submissionAttempts: state.submissionAttempts ?? 0,
      })}>
      {({
        fieldMeta,
        submissionAttempts,
      }: {
        fieldMeta: Record<string, { errors?: unknown[] } | undefined>;
        submissionAttempts: number;
      }) => {
        if (submissionAttempts < 1) {
          return null;
        }
        const errors: ErrorSummaryItem[] = collectFormFieldErrors(fieldMeta);
        if (errors.length === 0) {
          return null;
        }
        return <ErrorSummary errors={errors} title={title} formElement={formElement} />;
      }}
    </Subscribe>
  );
}

function FormValidateProvider({
  form,
  validateOn,
  children,
}: {
  form: FormApi<any, any, any, any, any, any, any, any, any, any, any, any>;
  validateOn: FormValidateOn;
  children: ReactNode;
}) {
  const Subscribe = (
    form as unknown as {
      Subscribe: (props: { selector: (state: any) => any; children: (value: any) => ReactNode }) => ReactNode;
    }
  ).Subscribe;

  return (
    <Subscribe selector={(state: any) => state.submissionAttempts ?? 0}>
      {(submissionAttempts: number) => (
        <FormValidateContext.Provider
          value={{
            validateOn,
            hasSubmitted: submissionAttempts >= 1,
          }}>
          {children}
        </FormValidateContext.Provider>
      )}
    </Subscribe>
  );
}

export function Form<TFormData extends Record<string, any>, TFormValidator = any>({
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
}: FormProps<TFormData, TFormValidator>) {
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });
  const requiredMarkMode = mapHouseRequiredMarking(knobProps.requiredMarking);
  const formAutofocusOn = knobProps.formAutofocus === 'on';

  // Get URL state — always call the hook, only use its values when syncWithUrl is true
  const [urlState, setUrlState] = useUrlState<TFormData>(formOptions?.defaultValues || ({} as TFormData), {
    debounceMs: urlDebounceMs,
  });

  // Use a ref to always call the latest onSubmit
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const formElementRef = useRef<HTMLElement | null>(null);
  const didAutofocusRef = useRef(false);

  // Create form with URL state as default values.
  // Pass a minimal empty config when providedForm is given so the inner form is a no-op.
  const defaultForm = useForm<TFormData, any, any, any, any, any, any, any, any, any, any, any>(
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
              await formOptions.onSubmit({ value, formApi, meta: {} } as any);
            }
          },
        },
  );

  const form = providedForm || defaultForm;

  // Sync form state to URL when enabled
  useEffect(() => {
    if (!syncWithUrl) {
      return;
    }

    const subscription = form.store.subscribe(() => {
      const values = form.store.state.values;
      setUrlState(values);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [form, syncWithUrl, setUrlState]);

  const handleSubmit = useMemo(
    () => (e?: FormEvent) => {
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
  const setFormRef = (node: any) => {
    if (!isWeb) {
      formElementRef.current = null;
      return;
    }
    const el =
      (node as HTMLElement | null)?.tagName === 'FORM'
        ? (node as HTMLElement)
        : (((node as HTMLElement | null)?.querySelector?.('form') as HTMLElement | null) ??
          (node as HTMLElement | null));
    formElementRef.current = el;
  };

  // House `formAutofocus`: default off (a11y). Only focus first control when knob is on.
  useEffect(() => {
    if (!formAutofocusOn || !isWeb || didAutofocusRef.current) {
      return;
    }
    const formEl = formElementRef.current;
    if (!formEl || typeof formEl.querySelector !== 'function') {
      return;
    }
    const first = formEl.querySelector(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    ) as HTMLElement | null;
    if (!first || typeof first.focus !== 'function') {
      return;
    }
    first.focus();
    didAutofocusRef.current = true;
  }, [formAutofocusOn, children]);

  const saveBarProps = typeof saveBar === 'object' ? saveBar : {};
  const saveMode: FormSaveModeContextValue = {
    mode: saveBar ? 'declarative' : 'embedded',
    onAutoCommit: saveBarProps.onAutoCommit,
  };

  const formNode = (
    <FormContext.Provider value={form}>
      <FormSaveModeContext.Provider value={saveMode}>
        <RequiredMarkingContext.Provider value={{ mode: requiredMarkMode }}>
          <FormValidateProvider form={form} validateOn={validateOn}>
            <TamaguiForm ref={setFormRef} onSubmit={handleSubmit} {...tamaguiFormProps}>
              <YStack
                data-mpo-form-layout=""
                data-gap={knobProps.gap.gap}
                data-density={knobProps.density}
                data-size={knobProps.size}
                data-nested={compact ? 'true' : undefined}
                width="100%"
                minWidth={0}
                {...knobProps.gap}
                {...(tamaguiFormProps.flex != null ? { flex: tamaguiFormProps.flex as never } : {})}>
                {showErrorSummary ? (
                  <AutoErrorSummary form={form} title={errorSummaryTitle} formElement={formElementRef.current} />
                ) : null}
                {children}
                {saveBar ? <ContextualSaveBar {...(typeof saveBar === 'object' ? saveBar : {})} /> : null}
              </YStack>
            </TamaguiForm>
          </FormValidateProvider>
        </RequiredMarkingContext.Provider>
      </FormSaveModeContext.Provider>
    </FormContext.Provider>
  );

  return compact ? <Preset overrides={{ density: 'compact' }}>{formNode}</Preset> : formNode;
}

export interface FormActionsProps {
  children: ReactNode;
  /** Eject the within-group gap recipe. */
  gap?: number | string;
}

/**
 * GOV.UK / Polaris action row: left-aligned, wraps, gapped via the space
 * recipe — never stretched to the form column and never sized from `sizeToken`.
 */
export function FormActions({ children, gap }: FormActionsProps) {
  const { knobProps } = useResolvedKnobs();
  const resolvedGap = gap ?? knobProps.gap.gap;
  return (
    <XStack
      data-mpo-form-actions=""
      data-gap={String(resolvedGap)}
      data-density={knobProps.density}
      data-size={knobProps.size}
      gap={resolvedGap as never}
      alignSelf="flex-start"
      alignItems="center"
      flexWrap="wrap">
      {children}
    </XStack>
  );
}

/** @internal test helper — effective timing for current FormValidate context. */
export function useEffectiveValidateOn() {
  const { validateOn, hasSubmitted } = useFormValidate();
  return resolveEffectiveValidateOn(validateOn, hasSubmitted);
}
