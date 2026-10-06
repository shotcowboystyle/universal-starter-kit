'use client';

import { Form, Input, TextArea } from '@repo/forms';
import { useTranslations } from 'next-intl';
import React from 'react';
import { z } from 'zod';

import { projectSchema } from '@/types/projectForm';

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  children?: React.ReactNode;
  onSubmit: (data: ProjectFormData) => void | Promise<void>;
  defaultValues?: {
    title: string;
    description?: string;
  };
}

const validateTitle = ({ value }: { value: string }) =>
  projectSchema.shape.title.safeParse(value).error?.issues[0]?.message;

export function ProjectForm({ children, onSubmit, defaultValues }: ProjectFormProps) {
  const t = useTranslations('kanban.project');

  return (
    <Form
      formOptions={{
        defaultValues: { title: defaultValues?.title ?? '', description: defaultValues?.description ?? '' },
      }}
      onSubmit={onSubmit}
      showErrorSummary={false}>
      <Input
        name="title"
        label={t('titleLabel')}
        placeholder={t('titlePlaceholder')}
        inputProps={{ testID: 'project-title-input' }}
        validators={{ onSubmit: validateTitle }}
      />
      <TextArea
        name="description"
        label={t('descriptionLabel')}
        placeholder={t('descriptionPlaceholder')}
        minRows={2}
        textAreaProps={{ testID: 'project-description-input' }}
      />
      {children}
    </Form>
  );
}
