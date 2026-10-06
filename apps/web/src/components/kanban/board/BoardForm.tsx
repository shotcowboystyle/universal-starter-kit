'use client';

import { Form, Input, TextArea } from '@repo/forms';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { boardSchema } from '@/types/boardForm';

type BoardFormValues = z.infer<typeof boardSchema>;

interface BoardFormProps {
  defaultValues?: Partial<BoardFormValues>;
  onSubmit: (values: BoardFormValues) => Promise<void>;
  children?: React.ReactNode;
}

const validateTitle = ({ value }: { value: string }) =>
  boardSchema.shape.title.safeParse(value).error?.issues[0]?.message;

export function BoardForm({ defaultValues, onSubmit, children }: BoardFormProps) {
  const t = useTranslations('kanban.actions');

  return (
    <Form
      formOptions={{ defaultValues: { title: '', description: '', ...defaultValues } }}
      onSubmit={onSubmit}
      showErrorSummary={false}>
      <Input
        name="title"
        label={t('boardTitleLabel')}
        placeholder={t('boardTitlePlaceholder')}
        inputProps={{ testID: 'board-title-input' }}
        validators={{ onSubmit: validateTitle }}
      />
      <TextArea
        name="description"
        label={t('descriptionLabel')}
        placeholder={t('descriptionPlaceholder')}
        minRows={2}
        textAreaProps={{ testID: 'board-description-input' }}
      />
      {children}
    </Form>
  );
}
