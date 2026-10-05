'use client';

import { Button, Combobox, DatePicker, Form, Input, RadioGroup, TextArea } from '@repo/forms';
import { XStack } from '@repo/ui';
import { startOfToday } from 'date-fns';
import { useTranslations } from 'next-intl';

import { type TaskFormSubmitValues, useTaskForm } from '@/hooks/useTaskForm';
import { TaskStatus } from '@/types/dbInterface';
import { TaskFormSchema } from '@/types/taskForm';

interface TaskFormProps {
  defaultValues?: TaskFormSubmitValues;
  onSubmit: (values: TaskFormSubmitValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

const validateTitle = ({ value }: { value: string }) =>
  TaskFormSchema.shape.title.safeParse(value).error?.issues[0]?.message;

export function TaskForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Submit' }: TaskFormProps) {
  const { form, isSubmitting, users, setSearchQuery, isSearching, assigneeLabel } = useTaskForm({
    defaultValues,
    onSubmit,
  });
  const t = useTranslations('kanban.task');

  return (
    <Form form={form} testID="task-form">
      <Input
        name="title"
        label={t('titleLabel')}
        placeholder={t('titlePlaceholder')}
        inputProps={{ testID: 'task-title-input' }}
        validators={{ onSubmit: validateTitle }}
      />
      <DatePicker name="dueDate" label={t('dueDateLabel')} placeholder={t('pickDate')} minDate={startOfToday()} />
      <Combobox
        name="assigneeId"
        label={t('assignToLabel')}
        placeholder={t('selectUser')}
        searchPlaceholder={t('searchUsers')}
        emptyMessage={isSearching ? t('searching') : t('noUsersFound')}
        options={users.map((user) => ({
          value: user._id,
          label: user.name || user.email,
          description: user.name ? user.email : undefined,
        }))}
        onSearch={setSearchQuery}
        loading={isSearching}
        valueLabel={assigneeLabel}
        clearable
      />
      <RadioGroup
        name="status"
        label={t('statusLabel')}
        options={[
          { value: TaskStatus.TODO, label: t('statusTodo') },
          { value: TaskStatus.IN_PROGRESS, label: t('statusInProgress') },
          { value: TaskStatus.DONE, label: t('statusDone') },
        ]}
      />
      <TextArea
        name="description"
        label={t('descriptionLabel')}
        placeholder={t('descriptionPlaceholder')}
        textAreaProps={{ testID: 'task-description-input' }}
      />
      <XStack justifyContent="flex-end" gap="$3">
        {onCancel && (
          <Button outlined onPress={onCancel} testID="cancel-task-button">
            {t('cancel')}
          </Button>
        )}
        <Button accent action="submit" loading={isSubmitting} testID="submit-task-button">
          {isSubmitting ? t('submitting') : submitLabel}
        </Button>
      </XStack>
    </Form>
  );
}
