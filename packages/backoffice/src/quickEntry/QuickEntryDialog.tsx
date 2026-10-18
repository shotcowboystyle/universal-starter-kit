/**
 * Meta-driven quick entry dialog — desk parity.
 *
 * Consumed by the list surface ("New" button) and chrome ("new x" command)
 * via the fixed contract below. Behavior:
 *
 * - Loads the doctype meta (shared getdoctype cache) and plans the compact
 *   field set (see quick-entry-plan.ts). When the doctype does not quick-enter
 *   (quick_entry off, no usable fields, or a mandatory child table) it
 *   immediately closes and calls onEditFullForm() — desk routing.
 * - Renders a "New <Doctype>" dialog (Sheet on narrow viewports via
 *   AdaptivePopup) with a SchemaForm/fieldRegistry mini-form seeded from
 *   simple meta defaults plus optional caller `defaults`.
 * - Create validates required client-side (inline errors), inserts through the
 *   live create_doc endpoint (fixtures in stories/tests), then fires
 *   onCreated(serverName) and closes. Server errors surface inline —
 *   MandatoryError maps back onto fields, everything else lands in the
 *   general slot (never a traceback).
 * - Escape / backdrop / sheet-swipe close via onOpenChange(false); the
 *   draft resets every time the dialog closes.
 */
import { AdaptivePopup, Button } from '@repo/forms';
import type { FrappeDocData } from '@repo/frappe';
import { SchemaForm, useFrappeConfig } from '@repo/frappe-ui';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { AsyncSkeleton, ScrollView, Text, XStack, YStack } from '@repo/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { FormErrorBoundary, wrapFieldWithErrorBoundary } from '../form/FormErrorBoundary';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useDoctypeMeta } from '../shared/use-doctype-meta';
import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';
import { useFrappeApp } from '../shared/use-frappe-app';

import {
  PROMPT_NAME_FIELD,
  buildQuickEntryDefaults,
  buildQuickEntrySchema,
  isEmptyFieldValue,
  parseServerError,
  planQuickEntry,
  resolveCreatedName,
} from './quick-entry-plan';
import type { ParsedServerError, QuickEntryDraft } from './quick-entry-plan';

export interface QuickEntryDialogProps {
  /** Proper-cased doctype name */
  doctype: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the created document name */
  onCreated?: (name: string) => void;
  /** Called when the user escapes to the full form (caller navigates) */
  onEditFullForm?: () => void;
  /** Extra field values merged over meta defaults when the dialog opens. */
  defaults?: QuickEntryDraft;
  /** Meta override for stories / tests (skips the getdoctype fetch). */
  metaOverride?: DoctypeMeta;
}

/** Required-field errors for the draft's empty values, keyed by fieldname. */
const collectRequiredErrors = (
  fields: DocFieldMeta[],
  draft: QuickEntryDraft,
  requiredMessage: (field: DocFieldMeta) => string,
) => {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.required === 1 && isEmptyFieldValue(draft[field.fieldname])) {
      errors[field.fieldname] = requiredMessage(field);
    }
  }
  return errors;
};

/** Insert payload: the prompt-name input becomes the doc `name`. */
const toInsertValues = (draft: QuickEntryDraft): QuickEntryDraft => {
  const { [PROMPT_NAME_FIELD]: promptName, ...values } = draft;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- draft values are untyped control output; typeof is the discriminant
  if (typeof promptName === 'string' && promptName.trim() !== '') {
    values.name = promptName.trim();
  }
  return values;
};

/**
 * Maps a parsed server error onto the form: missing fields the form renders
 * get inline errors; the rest are listed in the general slot.
 */
const mapServerErrors = (
  parsed: ParsedServerError,
  fields: DocFieldMeta[],
  requiredMessage: (field: DocFieldMeta) => string,
  unmappedMessage: (fieldnames: string) => string,
) => {
  const fieldsByName = new Map(fields.map((field) => [field.fieldname, field]));
  const errors: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const fieldname of parsed.missingFields) {
    const field = fieldsByName.get(fieldname);
    if (field) {
      errors[fieldname] = requiredMessage(field);
    } else {
      unmapped.push(fieldname);
    }
  }
  const general = parsed.general ?? (unmapped.length > 0 ? unmappedMessage(unmapped.join(', ')) : undefined);
  if (general !== undefined && general !== '') {
    errors.general = general;
  }
  return errors;
};

interface QuickEntryMetaErrorProps {
  doctype: string;
  message: string;
  onEditFullForm: () => void;
}

/** Meta failed to load: say so and keep the full-form escape. */
const QuickEntryMetaError = ({ doctype, message, onEditFullForm }: QuickEntryMetaErrorProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack {...knobProps.gap}>
      <Text
        role="alert"
        color="$red10"
        fontSize="$3">
        {t('quickEntry.metaError', 'Could not load {{doctype}}', {
          doctype,
        })}
      </Text>
      <Text
        color="$color10"
        fontSize="$2">
        {message}
      </Text>
      <XStack justifyContent="flex-end">
        <Button
          chromeless
          onPress={onEditFullForm}>
          {t('quickEntry.editFullForm', 'Edit Full Form')}
        </Button>
      </XStack>
    </YStack>
  );
};

export const QuickEntryDialog = ({
  doctype,
  open,
  onOpenChange,
  onCreated,
  onEditFullForm,
  defaults,
  metaOverride,
}: QuickEntryDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const config = useFrappeConfig();
  const app = useFrappeApp();

  const { meta: fetchedMeta, error: metaError } = useDoctypeMeta(open && !metaOverride ? doctype : undefined);
  const meta = metaOverride ?? fetchedMeta;

  // Capability gate: hosts disabling quickEntry route straight to the full
  // form (same path as doctypes that don't quick-enter).
  const { quickEntry } = useBackofficeCapabilities();
  const plan = useMemo<ReturnType<typeof planQuickEntry> | undefined>(() => {
    if (!quickEntry.enabled) {
      return { kind: 'full-form', reason: 'quick-entry-disabled' };
    }
    return meta ? planQuickEntry(meta) : undefined;
  }, [meta, quickEntry.enabled]);

  const [draft, setDraft] = useState<QuickEntryDraft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const draftRef = useRef(draft);
  // oxlint-disable-next-line react/refs -- latest-value ref: handleCreate reads the current draft without re-binding per keystroke
  draftRef.current = draft;
  const openRef = useRef(open);
  // oxlint-disable-next-line react/refs -- latest-value ref: the in-flight create checks whether the dialog was dismissed
  openRef.current = open;
  const deferredRef = useRef(false);
  const seededRef = useRef(false);

  // Prompt-named doctypes render a synthetic required name field first.
  const formFields = useMemo<DocFieldMeta[]>(() => {
    if (plan?.kind !== 'fields') {
      return [];
    }
    if (!plan.promptName) {
      return plan.fields;
    }
    const nameField: DocFieldMeta = {
      fieldname: PROMPT_NAME_FIELD,
      fieldtype: 'Data',
      label: t('quickEntry.nameLabel', '{{doctype}} Name', { doctype }),
      required: 1,
    };
    return [nameField, ...plan.fields];
  }, [plan, t, doctype]);

  const schema = useMemo(() => (formFields.length > 0 ? buildQuickEntrySchema(formFields) : undefined), [formFields]);

  // Desk routing: doctypes that don't quick-enter defer to the full form
  // as soon as the meta decision lands (once per open cycle).
  useEffect(() => {
    if (!open) {
      deferredRef.current = false;
      return;
    }
    if (plan?.kind === 'full-form' && !deferredRef.current) {
      deferredRef.current = true;
      onOpenChange(false);
      onEditFullForm?.();
    }
  }, [open, plan, onOpenChange, onEditFullForm]);

  // Seed the draft once per open; reset everything on close.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react/set-state-in-effect -- close resets the draft; the dialog is hidden while closed, so nothing stale shows
      setDraft({});
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- part of the close reset above
      setErrors({});
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- part of the close reset above
      setSaving(false);
      return;
    }
    if (plan?.kind !== 'fields' || seededRef.current) {
      return;
    }
    seededRef.current = true;
    setDraft(buildQuickEntryDefaults(plan.fields, defaults));
  }, [open, plan, defaults]);

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- SchemaForm's setValue contract; values are whatever each field control emits
  const setValue = useCallback((field: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      field in prev ? Object.fromEntries(Object.entries(prev).filter(([key]) => key !== field)) : prev,
    );
  }, []);

  const handleEditFullForm = useCallback(() => {
    onOpenChange(false);
    onEditFullForm?.();
  }, [onOpenChange, onEditFullForm]);

  const canInsert = Boolean(config?.fixtures ?? app);

  const insertDoc = useCallback(
    async (values: QuickEntryDraft): Promise<string> => {
      if (config?.fixtures) {
        const created = await config.fixtures.createDoc<FrappeDocData>(doctype, {
          ...values,
          doctype,
        });
        return resolveCreatedName(created);
      }
      if (!app) {
        throw new Error(t('quickEntry.notConnected', 'Frappe is not configured'));
      }
      // The live create_doc RPC returns the created doc (server-issued name)
      // wrapped in the whitelisted-method envelope; the collection insert
      // path never surfaces the real name, so quick entry posts directly.
      const endpoint = app.db().getEndpoints().createDoc;
      const res = await app.call().post(endpoint, {
        ...values,
        doctype,
      });
      return resolveCreatedName(res.payload);
    },
    // oxlint-disable-next-line react/preserve-manual-memoization -- `config?.fixtures` is the intended dependency; the compiler wants `config`
    [config?.fixtures, app, doctype, t],
  );

  const requiredMessage = useCallback(
    (field: DocFieldMeta) =>
      t('quickEntry.fieldRequired', '{{label}} is required', {
        label: field.label ?? field.fieldname,
      }),
    [t],
  );

  const handleCreate = useCallback(async () => {
    if (saving) {
      return;
    }
    const { current } = draftRef;

    const requiredErrors = collectRequiredErrors(formFields, current, requiredMessage);
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const name = await insertDoc(toInsertValues(current));
      // Dismissed mid-flight: the document exists, but surprising the user
      // with navigation after they closed the dialog would be dishonest.
      if (!openRef.current) {
        return;
      }
      if (name) {
        onCreated?.(name);
      }
      onOpenChange(false);
    } catch (error) {
      if (!openRef.current) {
        return;
      }
      const parsed = parseServerError(
        error,
        t('quickEntry.createFailed', 'Failed to create {{doctype}}', {
          doctype,
        }),
      );
      setErrors(
        mapServerErrors(parsed, formFields, requiredMessage, (fields) =>
          t('quickEntry.serverRequiresFields', 'Missing required fields: {{fields}}', { fields }),
        ),
      );
      // oxlint-disable-next-line react/todo -- the compiler can't lower try/finally yet; it skips this callback, which stays manually memoized
    } finally {
      if (openRef.current) {
        setSaving(false);
      }
    }
  }, [saving, formFields, requiredMessage, insertDoc, onCreated, onOpenChange, t, doctype]);

  // Full-form doctypes never flash the dialog — the effect above routes.
  if (plan?.kind === 'full-form') {
    return null;
  }

  const showForm = plan?.kind === 'fields' && !!schema;

  let body: React.ReactNode;
  if (showForm) {
    body = (
      <YStack
        {...knobProps.gap}
        testID="quick-entry-form">
        <ScrollView
          maxHeight={sizeRecipeEscape(480, 'quick entry: the field list scrolls inside the dialog past this height')}>
          <YStack {...knobProps.gap}>
            {/* A crashing field degrades to its inline error slot (per-field
              wrapper); a form-level crash costs the mini-form body only —
              the dialog chrome and the "Edit Full Form" escape in the
              footer stay alive (the desk-routing fallback must survive
              exactly when the quick form is broken). */}
            <FormErrorBoundary
              errorTitle={t('quickEntry.formRenderError', 'This form failed to render')}
              testID="quick-entry-form-error">
              <SchemaForm
                schema={schema}
                doc={draft}
                setValue={setValue}
                errors={errors}
                disabled={saving}
                sectionHeadingLevel={3}
                renderFieldWrapper={wrapFieldWithErrorBoundary}
              />
            </FormErrorBoundary>
          </YStack>
        </ScrollView>
        {errors.general ? (
          <Text
            role="alert"
            color="$red10"
            fontSize="$3"
            testID="quick-entry-error">
            {errors.general}
          </Text>
        ) : null}
      </YStack>
    );
  } else if (metaError && !meta) {
    body = (
      <QuickEntryMetaError
        doctype={doctype}
        message={metaError.message}
        onEditFullForm={handleEditFullForm}
      />
    );
  } else {
    body = (
      <YStack testID="quick-entry-skeleton">
        <AsyncSkeleton layout="generic" />
      </YStack>
    );
  }

  return (
    <AdaptivePopup
      open={open}
      onOpenChange={onOpenChange}
      title={t('quickEntry.title', 'New {{doctype}}', { doctype })}
      size="sm"
      footer={
        showForm ? (
          <XStack
            {...knobProps.gap}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap">
            <Button
              chromeless
              onPress={handleEditFullForm}
              testID="quick-entry-edit-full-form">
              {t('quickEntry.editFullForm', 'Edit Full Form')}
            </Button>
            <Button
              accent
              loading={saving}
              disabled={!canInsert || undefined}
              disabledReason={canInsert ? undefined : t('quickEntry.notConnected', 'Frappe is not configured')}
              // oxlint-disable-next-line eslint/no-void -- fire-and-forget: handleCreate settles every failure into inline errors
              onPress={() => void handleCreate()}
              testID="quick-entry-create">
              {saving ? t('quickEntry.creating', 'Creating…') : t('quickEntry.create', 'Create')}
            </Button>
          </XStack>
        ) : undefined
      }>
      {body}
    </AdaptivePopup>
  );
};
