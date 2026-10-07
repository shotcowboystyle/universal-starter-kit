/**
 * Small input dialogs for the form menu / sidebar, built on the catalog
 * ConfirmDialog (cross-platform alert dialog) with input bodies:
 *  - RenameDialog  → frappe.rename_doc
 *  - EmailDialog   → frappe.core.doctype.communication.email.make
 *  - AssignDialog  → frappe.desk.form.assign_to.add (User link search)
 *  - JumpToFieldDialog → desk Ctrl/Cmd+J field picker
 */

import { ConfirmDialog, ScrollView, Text, XStack, YStack } from '@repo/ui';
import { Input, TextArea } from '@repo/forms';
import { Link } from '@repo/frappe-ui';
import {
  ensureFocusVisibleRing,
  getGroupPosition,
  sizeRecipeEscape,
  stackRadiusProps,
  useResolvedKnobs,
} from '@repo/theme';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (newName: string) => void;
}

export function RenameDialog({ open, onOpenChange, currentName, onRename }: RenameDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [value, setValue] = useState(currentName);

  // Reset while closed (ConfirmDialog remounts its body on open, so the
  // uncontrolled forms Input must see the fresh draft at mount).
  useEffect(() => {
    if (!open) {
      setValue(currentName);
    }
  }, [open, currentName]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('renameTitle', 'Rename document')}
      confirmLabel={t('rename', 'Rename')}
      confirmDisabled={!value.trim() || value.trim() === currentName}
      confirmDisabledReason={t('renameDisabled', 'Enter a different name')}
      onConfirm={() => {
        onRename(value.trim());
      }}>
      <YStack {...knobProps.gap}>
        <Text
          color="$color11"
          fontSize="$3">
          {t('renameBody', 'New name for {{name}}:', { name: currentName })}
        </Text>
        <Input
          value={value}
          onChangeText={setValue}
          inputProps={{
            'aria-label': t('newName', 'New name'),
            autoFocus: true,
          }}
        />
      </YStack>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject: string;
  onSend: (args: { recipients: string; subject: string; content: string }) => void;
}

export function EmailDialog({ open, onOpenChange, defaultSubject, onSend }: EmailDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [content, setContent] = useState('');

  // Reset while closed — see RenameDialog.
  useEffect(() => {
    if (!open) {
      setRecipients('');
      setSubject(defaultSubject);
      setContent('');
    }
  }, [open, defaultSubject]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('emailTitle', 'New Email')}
      confirmLabel={t('send', 'Send')}
      confirmDisabled={!recipients.trim() || !subject.trim()}
      confirmDisabledReason={t('emailDisabled', 'Recipients and subject are required')}
      onConfirm={() => {
        onSend({ recipients: recipients.trim(), subject: subject.trim(), content });
      }}>
      <YStack
        {...knobProps.gap}
        minWidth={dialogBodyMinWidth}>
        <Input
          value={recipients}
          onChangeText={setRecipients}
          placeholder={t('emailTo', 'To (comma-separated emails)')}
          inputProps={{
            'aria-label': t('emailTo', 'To (comma-separated emails)'),
            autoFocus: true,
          }}
        />
        <Input
          value={subject}
          onChangeText={setSubject}
          placeholder={t('emailSubject', 'Subject')}
          inputProps={{ 'aria-label': t('emailSubject', 'Subject') }}
        />
        <TextArea
          value={content}
          onChangeText={setContent}
          placeholder={t('emailMessage', 'Message')}
          minRows={4}
          textAreaProps={{ 'aria-label': t('emailMessage', 'Message') }}
        />
      </YStack>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

export interface AssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (user: string) => void;
}

export function AssignDialog({ open, onOpenChange, onAssign }: AssignDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [user, setUser] = useState('');

  useEffect(() => {
    if (open) {
      setUser('');
    }
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('assignTitle', 'Add assignment')}
      confirmLabel={t('assign', 'Assign')}
      confirmDisabled={!user}
      confirmDisabledReason={t('assignDisabled', 'Pick a user first')}
      onConfirm={() => {
        onAssign(user);
      }}>
      <YStack
        {...knobProps.gap}
        minWidth={dialogBodyMinWidth}>
        <Link
          label={t('assignTo', 'Assign to')}
          doctype="User"
          value={user}
          onChange={(value: unknown) => {
            setUser(value === null || value === undefined ? '' : String(value));
          }}
        />
      </YStack>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------------------
// Jump to field (desk Ctrl/Cmd+J)
// ---------------------------------------------------------------------------

export interface JumpToFieldTarget {
  name: string;
  label: string;
  tabKey: string;
  tabLabel: string;
}

export interface JumpToFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: readonly JumpToFieldTarget[];
  onJump: (field: JumpToFieldTarget) => void;
}

export function JumpToFieldDialog({ open, onOpenChange, fields, onJump }: JumpToFieldDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return fields;
    }
    return fields.filter(
      (field) => field.label.toLowerCase().includes(needle) || field.name.toLowerCase().includes(needle),
    );
  }, [fields, query]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('jumpToFieldTitle', 'Jump to field')}
      confirmLabel={t('jumpToField', 'Jump')}
      confirmDisabled={matches.length === 0}
      confirmDisabledReason={t('jumpToFieldNone', 'No matching fields')}
      allowManyActions
      onConfirm={() => {
        if (matches[0]) {
          onJump(matches[0]);
        }
      }}>
      <YStack
        {...knobProps.gap}
        minWidth={dialogBodyMinWidth}
        maxWidth={sizeRecipeEscape(
          420,
          'jump-to-field: a scannable column width, and the match list scrolls past about six rows',
        )}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t('jumpToFieldPlaceholder', 'Search fields…')}
          inputProps={{
            'aria-label': t('jumpToFieldPlaceholder', 'Search fields…'),
            autoFocus: true,
          }}
        />
        <ScrollView
          maxHeight={sizeRecipeEscape(
            240,
            'jump-to-field: a scannable column width, and the match list scrolls past about six rows',
          )}>
          <YStack>
            {matches.map((field, index) => {
              const position = getGroupPosition(index, matches.length);
              const corners = stackRadiusProps(position, knobProps.borderRadius.borderRadius);
              return (
                <XStack
                  key={`${field.tabKey}:${field.name}`}
                  role="button"
                  tabIndex={0}
                  alignItems="center"
                  paddingVertical="$2"
                  paddingHorizontal="$3"
                  overflow="hidden"
                  cursor="pointer"
                  outlineWidth={0}
                  {...corners}
                  hoverStyle={{ backgroundColor: '$color3', ...corners }}
                  pressStyle={{ backgroundColor: '$color5', ...corners }}
                  focusStyle={{ outlineWidth: 0 }}
                  focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
                  onPress={() => {
                    onJump(field);
                  }}
                  onKeyDown={
                    ((e: { key?: string; preventDefault?: () => void }) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault?.();
                        onJump(field);
                      }
                    }) as unknown as () => void
                  }>
                  <YStack
                    flex={1}
                    minWidth={0}>
                    <Text
                      fontSize="$3"
                      color="$color12"
                      numberOfLines={1}>
                      {field.label}
                    </Text>
                    <Text
                      fontSize="$1"
                      color="$color11"
                      numberOfLines={1}>
                      {field.tabLabel}
                    </Text>
                  </YStack>
                </XStack>
              );
            })}
          </YStack>
        </ScrollView>
      </YStack>
    </ConfirmDialog>
  );
}
