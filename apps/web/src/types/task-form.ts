'use client';

import { z } from 'zod';

import { TaskStatus } from './db-interface';

const userSchema = z.object({
  _id: z.string(),
  name: z.string().nullable(),
  email: z.email().optional(),
});

export const TaskFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  dueDate: z.date().optional(),
  status: z.enum(TaskStatus).optional(),
  assignee: userSchema.optional(),
  projectId: z.string().optional(),
  boardId: z.string().optional(),
});
