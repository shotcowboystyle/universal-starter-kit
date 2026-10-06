interface SubmissionForm {
  handleSubmit(): Promise<void>;
  state: { isSubmitting: boolean; isSubmitSuccessful: boolean };
}

type SubmissionOutcome = 'success' | 'invalid' | 'failed' | 'busy';
type SubmissionSnapshot = Readonly<{ error: string | null; submitting: boolean }>;

const createSubmissionController = (form: SubmissionForm) => {
  let snapshot: SubmissionSnapshot = { error: null, submitting: false };
  const listeners = new Set<() => void>();

  const update = (error: string | null, submitting = snapshot.submitting) => {
    if (snapshot.error === error && snapshot.submitting === submitting) {
      return;
    }
    snapshot = { error, submitting };
    listeners.forEach((listener) => {
      listener();
    });
  };
  const reportError = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    update(text || 'network unreachable');
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clearError: () => {
      update(null);
    },
    reportError,
    async submit(): Promise<SubmissionOutcome> {
      // Set the guard before invoking user code, including synchronous throws.
      if (snapshot.submitting || form.state.isSubmitting) {
        return 'busy';
      }
      update(null, true);
      return await Promise.resolve()
        .then(async () => await form.handleSubmit())
        .then((): SubmissionOutcome => (form.state.isSubmitSuccessful ? 'success' : 'invalid'))
        .catch((error): SubmissionOutcome => {
          reportError(error);
          return 'failed';
        })
        .finally(() => {
          update(snapshot.error, false);
        });
    },
  };
};

const controllers = new WeakMap<SubmissionForm, ReturnType<typeof createSubmissionController>>();

/** Keep UI submission failures shared without changing the caller's FormApi. */
export const getFormSubmission = (form: SubmissionForm) => {
  let controller = controllers.get(form);
  if (!controller) {
    controller = createSubmissionController(form);
    controllers.set(form, controller);
  }
  return controller;
};
