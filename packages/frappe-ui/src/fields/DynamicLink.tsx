/**
 * Frappe Dynamic Link: a doctype Select plus a Link over the chosen DocType.
 *
 * Design-law lives here: compose forms Select + the Frappe Link (Combobox)
 * adapter. Do not fork tamagui Select chrome. R10: no frappe.ui.form.on.
 */
import { Select as FormsSelect } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { Link } from './Link';

export interface DynamicLinkProps {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  doctypeFieldValue?: string;
  onDoctypeChange?: (doctype: string) => void;
  doctypes?: string[];
  disabled?: boolean;
  required?: boolean;
  baseURL?: string;
  auth?: any;
  error?: string;
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
}

export function DynamicLink({
  label,
  value,
  onChange,
  doctypeFieldValue,
  onDoctypeChange,
  doctypes = [],
  disabled = false,
  required = false,
  baseURL,
  auth,
  error,
  helperText,
  readOnly = false,
  skeleton = false,
  compact = false,
}: DynamicLinkProps) {
  const { knobProps } = useResolvedKnobs();
  const [selectedDoctype, setSelectedDoctype] = useState<string>(doctypeFieldValue ?? '');
  const isLocked = disabled || readOnly;
  const doctypeOptions = doctypes.map((doctype) => ({ label: doctype, value: doctype }));

  const handleDoctypeChange = (next: string | string[]) => {
    if (isLocked) {
      return;
    }
    const doctype = Array.isArray(next) ? (next[0] ?? '') : next;
    setSelectedDoctype(doctype);
    onDoctypeChange?.(doctype);
    onChange('');
  };

  const documentPicked = !!selectedDoctype;

  return (
    <YStack {...knobProps.gap}>
      <FormsSelect
        label={label}
        value={selectedDoctype}
        onChange={handleDoctypeChange}
        options={doctypeOptions}
        placeholder="Select DocType"
        disabled={isLocked}
        required={required}
        readOnly={readOnly}
        skeleton={skeleton}
        compact={compact}
        error={documentPicked ? undefined : error}
        helperText={documentPicked ? undefined : helperText}
      />
      {documentPicked ? (
        <Link
          doctype={selectedDoctype}
          value={value}
          onChange={onChange}
          disabled={isLocked}
          readOnly={readOnly}
          skeleton={skeleton}
          compact={compact}
          placeholder={`Select ${selectedDoctype}`}
          error={error}
          helperText={helperText}
          baseURL={baseURL}
          auth={auth}
        />
      ) : null}
    </YStack>
  );
}
