import { AsyncSkeleton, ScrollView, Text, XStack, YStack } from '@repo/ui';
/**
 * Meta-driven quick entry dialog — desk parity.
 *
 * Consumed by the list surface ("New" button) and chrome ("new x" command)
 * via the fixed contract below. Behavior:
 *
 * - Loads the doctype meta (shared getdoctype cache) and plans the compact
 *   field set (see quickEntryPlan.ts). When the doctype does not quick-enter
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { FormErrorBoundary, wrapFieldWithErrorBoundary } from '../form/FormErrorBoundary';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { useDoctypeMeta } from '../shared/useDoctypeMeta';
import type { DocFieldMeta, DoctypeMeta } from '../shared/useDoctypeMeta';
import { useFrappeApp } from '../shared/useFrappeApp';

import {
  PROMPT_NAME_FIELD,
  buildQuickEntryDefaults,
  buildQuickEntrySchema,
  isEmptyFieldValue,
  parseServerError,
  planQuickEntry,
  resolveCreatedName,
} from './quickEntryPlan';

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
  defaults?: Record<string, unknown>;
  /** Meta override for stories / tests (skips the getdoctype fetch). */
  metaOverride?: DoctypeMeta;
}

export function QuickEntryDialog({
  doctype,
  open,
  onOpenChange,
  onCreated,
  onEditFullForm,
  defaults,
  metaOverride,
}: QuickEntryDialogProps) {
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

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const openRef = useRef(open);
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
      setDraft({});
      setErrors({});
      setSaving(false);
      return;
    }
    if (plan?.kind !== 'fields' || seededRef.current) {
      return;
    }
    seededRef.current = true;
    setDraft(buildQuickEntryDefaults(plan.fields, defaults));
  }, [open, plan, defaults]);

  const setValue = useCallback((field: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleEditFullForm = useCallback(() => {
    onOpenChange(false);
    onEditFullForm?.();
  }, [onOpenChange, onEditFullForm]);

  const canInsert = Boolean(config?.fixtures ?? app);

  const insertDoc = useCallback(
    async (values: Record<string, unknown>): Promise<string> => {
      if (config?.fixtures) {
        const created = await config.fixtures.createDoc<FrappeDocData>(doctype, {
          ...values,
          doctype,
        } as Partial<FrappeDocData>);
        return resolveCreatedName(created);
      }
      if (!app) {
        throw new Error(t('quickEntry.notConnected', 'Frappe is not configured'));
      }
      // The live create_doc RPC returns the created doc (server-issued name)
      // wrapped in the whitelisted-method envelope; the collection insert
      // path never surfaces the real name, so quick entry posts directly.
      const endpoint = app.db().getEndpoints().createDoc;
      const res = await app.call().post<Record<string, unknown>>(endpoint, {
        ...values,
        doctype,
      });
      return resolveCreatedName(res.payload);
    },
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

    const requiredErrors: Record<string, string> = {};
    for (const field of formFields) {
      if (!field.required) {
        continue;
      }
      if (isEmptyFieldValue(current[field.fieldname])) {
        requiredErrors[field.fieldname] = requiredMessage(field);
      }
    }
    if (Object.keys(requiredErrors).length > 0) {
      setErrors(requiredErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const { [PROMPT_NAME_FIELD]: promptName, ...values } = current;
      if (typeof promptName === 'string' && promptName.trim()) {
        values.name = promptName.trim();
      }
      const name = await insertDoc(values);
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
      const nextErrors: Record<string, string> = {};
      const unmapped: string[] = [];
      for (const fieldname of parsed.missingFields) {
        const field = formFields.find((candidate) => candidate.fieldname === fieldname);
        if (field) {
          nextErrors[fieldname] = requiredMessage(field);
        } else {
          unmapped.push(fieldname);
        }
      }
      const general =
        parsed.general ??
        (unmapped.length > 0
          ? t('quickEntry.serverRequiresFields', 'Missing required fields: {{fields}}', {
              fields: unmapped.join(', '),
            })
          : undefined);
      if (general) {
        nextErrors.general = general;
      }
      setErrors(nextErrors);
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
              onPress={() => void handleCreate()}
              testID="quick-entry-create">
              {saving ? t('quickEntry.creating', 'Creating…') : t('quickEntry.create', 'Create')}
            </Button>
          </XStack>
        ) : undefined
      }>
      {showForm ? (
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
      ) : metaError && !meta ? (
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
            {metaError.message}
          </Text>
          <XStack justifyContent="flex-end">
            <Button
              chromeless
              onPress={handleEditFullForm}>
              {t('quickEntry.editFullForm', 'Edit Full Form')}
            </Button>
          </XStack>
        </YStack>
      ) : (
        <YStack testID="quick-entry-skeleton">
          <AsyncSkeleton layout="generic" />
        </YStack>
      )}
    </AdaptivePopup>
  );
}
