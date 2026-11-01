/**
 * Schema Link whose target DocType is a tree (Account, Item Group, Territory).
 * Loads the forest the same way FrappeTreeView does, then renders TreeSelect.
 */
import { useDocTypeMeta, useFrappeCollection, useLiveQuery, useLinkTitle } from '@repo/frappe';
import type { FrappeConnectionConfig } from '@repo/frappe';
import { TreeSelect } from '@repo/ui';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useFrappeConfig } from '../FrappeProvider';
import { buildTreeNodes } from '../FrappeTreeView';

import type { LinkProps } from './Link';

const useTreeConnection = (baseURL?: string, auth?: LinkProps['auth']): FrappeConnectionConfig | undefined => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL ?? '';
  const finalAuth = auth ?? config?.auth;
  // Carry `fixtures` through, the way FrappeTreeView does. Without it a
  // LinkTree under a fixture-backed FrappeProvider takes the HTTP path
  // instead: every story dials socket.io at the mock host and prints
  // ERR_TUNNEL_CONNECTION_FAILED, which is a G-15 story-honesty breach and
  // was the only console noise left on FrappeUI/LinkTree (MPO-197).
  return useMemo(
    () =>
      finalBaseURL
        ? {
            baseURL: finalBaseURL,
            socketPort: config?.socketPort,
            auth: finalAuth,
            realtime: config?.realtime,
            fixtures: config?.fixtures,
          }
        : undefined,
    [finalBaseURL, config?.socketPort, config?.realtime, finalAuth, config?.fixtures],
  );
};

export const LinkTree = ({
  label,
  value = '',
  onChange,
  doctype,
  filters,
  disabled = false,
  required = false,
  baseURL,
  auth,
  error,
  helperText,
  readOnly = false,
  skeleton = false,
  compact = false,
  placeholder,
  referenceDoctype: _referenceDoctype,
  ...stackProps
}: LinkProps) => {
  const { t } = useTranslation();
  const isLocked = disabled || readOnly;
  const connectionConfig = useTreeConnection(baseURL, auth);

  const { meta } = useDocTypeMeta(connectionConfig, doctype);
  const titleField = meta?.title_field ?? 'name';
  const parentField = `parent_${doctype.toLowerCase().replaceAll(' ', '_')}`;

  const collection = useFrappeCollection(connectionConfig && !isLocked ? connectionConfig : undefined, doctype, {
    fields: ['name', titleField, parentField],
    filters,
  });

  const { data: rawData, isLoading } = useLiveQuery(
    (q) => (collection ? q.from({ _list: collection }) : null),
    [collection],
  );

  // SAFETY: the live query reads this doctype's collection, whose rows always carry `name`
  const docs = useMemo(() => (rawData as { name: string }[] | undefined) ?? [], [rawData]);
  const nodes = useMemo(() => buildTreeNodes(docs, parentField, titleField), [docs, parentField, titleField]);

  const { title } = useLinkTitle(connectionConfig, doctype, value || undefined);

  const handleChange = useCallback(
    (next: string) => {
      if (isLocked) {
        return;
      }
      onChange(next);
    },
    [isLocked, onChange],
  );

  return (
    <TreeSelect
      nodes={nodes}
      value={value}
      onChange={handleChange}
      valueLabel={value ? (title ?? value) : undefined}
      label={label}
      placeholder={placeholder ?? t('Select {{doctype}}', { doctype })}
      searchPlaceholder={t('Filter {{doctype}}', { doctype })}
      emptyMessage={t('No matching {{doctype}}', { doctype })}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      error={error}
      helperText={helperText}
      skeleton={skeleton}
      compact={compact}
      loading={isLoading}
      // SAFETY: the remaining YStack props are forwarded verbatim to the TreeSelect root
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
      {...(stackProps as Record<string, unknown>)}
    />
  );
};
