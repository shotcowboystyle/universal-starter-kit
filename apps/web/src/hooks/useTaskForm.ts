'use client';

import { useForm } from '@repo/forms';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { userApi } from '@/lib/api/userApi';
import { TaskStatus } from '@/types/dbInterface';
import { TaskFormSchema } from '@/types/taskForm';
import { USER_KEYS } from '@/types/userApi';

export type TaskFormSubmitValues = z.infer<typeof TaskFormSchema>;

/** Flat field state the widgets bind to (Combobox writes an id, DatePicker writes Date | null). */
export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: Date | null;
  assigneeId: string;
}

interface UseTaskFormProps {
  defaultValues?: Partial<TaskFormSubmitValues>;
  onSubmit: (values: TaskFormSubmitValues) => Promise<void>;
}

export const useTaskForm = ({ defaultValues, onSubmit }: UseTaskFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Combobox debounces and only calls onSearch while open, so no local debounce/open state.
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users = [], isFetching: isSearching } = useQuery({
    queryKey: USER_KEYS.list({ search: searchQuery }),
    queryFn: () => userApi.searchUsers(searchQuery),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const defaultAssignee = defaultValues?.assignee;
  // Label for the pre-selected assignee before it shows up in search results.
  const assigneeLabel = defaultAssignee
    ? defaultAssignee.name || defaultAssignee.email || defaultAssignee._id
    : undefined;

  const handleSubmit = async (values: TaskFormValues) => {
    const { assigneeId, dueDate, ...rest } = values;
    const name =
      users.find((u) => u._id === assigneeId)?.name ??
      (defaultAssignee?._id === assigneeId ? defaultAssignee.name : null);
    try {
      setIsSubmitting(true);
      await onSubmit({
        ...rest,
        dueDate: dueDate ?? undefined,
        assignee: assigneeId ? { _id: assigneeId, name } : undefined,
      });
    } catch (error) {
      toast.error(`Failed to submit task: ${error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const form = useForm({
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      status: defaultValues?.status ?? TaskStatus.TODO,
      dueDate: defaultValues?.dueDate ?? null,
      assigneeId: defaultAssignee?._id ?? '',
    } as TaskFormValues,
    onSubmit: ({ value }) => handleSubmit(value),
  });

  return {
    form,
    isSubmitting,
    users,
    searchQuery,
    setSearchQuery,
    isSearching,
    assigneeLabel,
    handleSubmit,
  };
};
