import type { FieldComponentProps, FileUploadHandler, FormFieldProps } from '@repo/forms';
import { Button, FileUpload } from '@repo/forms';
import { FolderOpenIcon } from '@phosphor-icons/react';
import type { DeepKeys } from '@tanstack/form-core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProps } from 'tamagui';

import { AttachLibrary } from '../../FileBrowser/AttachLibrary';
import type { FileBrowserFile } from '../../FileBrowser/types';

const imageAccept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

export type FileUploadFieldProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown>,
      'children'
    >
  > & {
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    accept?: string;
    maxSize?: number;
    multiple?: boolean;
    isImage?: boolean;
    /** Controlled value (SchemaForm / registry adapters pass value+onChange). */
    value?: unknown;
    onChange?: (value: unknown) => void;
    /** Same transport contract as forms FileUpload (progress / fail / retry / cancel). */
    onUpload?: FileUploadHandler;
    /** Attach choose-from-library tab. Default on — this field IS Attach. */
    library?: boolean;
    libraryFiles?: FileBrowserFile[];
    libraryFolder?: string;
  };

export function FileUploadField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: FileUploadFieldProps<TData, TName>) {
  const { t } = useTranslation();
  const {
    defaultValue,
    form,
    _mode,
    name,
    _preserveValue,
    validators,
    disabled,
    accept,
    maxSize,
    multiple,
    isImage,
    value,
    onChange,
    onUpload,
    library = true,
    libraryFiles,
    libraryFolder,
    ...fieldProps
  } = useProps(props) as FileUploadFieldProps<TData, TName> & {
    value?: unknown;
    onChange?: (value: unknown) => void;
  } & Record<string, unknown>;

  const [libraryOpen, setLibraryOpen] = useState(false);
  const resolvedAccept = isImage ? (accept ?? imageAccept) : accept;
  const resolvedDefaultValue = value === undefined ? defaultValue : value;

  return (
    <>
      <FileUpload
        name={name}
        form={form}
        validators={validators}
        defaultValue={resolvedDefaultValue as any}
        onValueChange={onChange as any}
        label={fieldProps.label}
        labelProps={fieldProps.labelProps}
        error={fieldProps.error}
        helperText={fieldProps.helperText}
        readOnly={fieldProps.readOnly}
        skeleton={fieldProps.skeleton}
        compact={fieldProps.compact}
        required={fieldProps.required}
        id={fieldProps.id}
        size={fieldProps.size}
        disabled={disabled}
        accept={resolvedAccept}
        maxSize={maxSize}
        multiple={multiple}
        onUpload={onUpload}
        actions={
          library ? (
            <Button
              size="$4"
              outlined
              icon={FolderOpenIcon}
              disabled={disabled ?? fieldProps.readOnly}
              onPress={() => {
                setLibraryOpen(true);
              }}>
              {t('From Library')}
            </Button>
          ) : undefined
        }
      />
      {library ? (
        <AttachLibrary
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          value={value}
          files={libraryFiles}
          currentFolder={libraryFolder}
          accept={resolvedAccept}
          onPick={(file) => {
            onChange?.(file.file_url ?? file.name);
          }}
        />
      ) : null}
    </>
  );
}
