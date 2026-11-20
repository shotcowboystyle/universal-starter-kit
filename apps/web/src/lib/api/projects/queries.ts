import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PROJECT_KEYS } from '@/types/project-api';
import type { CreateProjectInput, UpdateProjectInput } from '@/types/project-api';

import { projectApi } from '../project-api';

type EntityRef = string | { _id: string };

const getRefId = (ref: EntityRef | null | undefined): string | undefined =>
  ref instanceof Object ? ref._id : (ref ?? undefined);

const hasId = (id: string | undefined): id is string => id !== undefined && id !== '';

export const useProjects = (boardId?: string | { _id: string; title: string }) => {
  const resolvedId = getRefId(boardId);
  const id = hasId(resolvedId) ? resolvedId : undefined;

  return useQuery({
    queryKey: PROJECT_KEYS.list(id ?? ''),
    queryFn: async () => {
      if (!hasId(id)) {
        throw new Error('Board ID is required');
      }
      return await projectApi.getProjects(id);
    },
    enabled: hasId(id),
  });
};

export const useProject = (id: string | { _id: string } | undefined) => {
  const resolvedId = getRefId(id);
  const projectId = hasId(resolvedId) ? resolvedId : undefined;

  return useQuery({
    queryKey: PROJECT_KEYS.detail(projectId ?? ''),
    queryFn: async () => {
      if (!hasId(projectId)) {
        throw new Error('Project ID is required');
      }
      return await projectApi.getProjectById(projectId);
    },
    enabled: hasId(projectId),
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => await projectApi.createProject(input),
    onSuccess: (newProject) => {
      // Invalidate the projects list for the specific board
      const boardId = getRefId(newProject.board);

      if (hasId(boardId)) {
        void queryClient.invalidateQueries({
          queryKey: PROJECT_KEYS.list(boardId),
        });
      }
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Omit<UpdateProjectInput, 'owner'>) => {
      // Create a new object with only the allowed fields
      const updateData: UpdateProjectInput = {
        title: updates.title,
        description: updates.description ?? null,
      };

      // Only include description if it's provided
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }

      return await projectApi.updateProject(id, updateData);
    },
    onSuccess: (updatedProject) => {
      // Invalidate both the list and the specific project
      const boardId = getRefId(updatedProject.board);

      if (hasId(boardId)) {
        void queryClient.invalidateQueries({
          queryKey: PROJECT_KEYS.list(boardId),
        });
      }

      void queryClient.invalidateQueries({
        queryKey: PROJECT_KEYS.detail(updatedProject._id),
      });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      await projectApi.deleteProject(projectId);
    },
    onSuccess: (_, projectId, context: { boardId?: string } | undefined) => {
      // Invalidate the projects list for the board if we have the boardId
      if (hasId(context?.boardId)) {
        void queryClient.invalidateQueries({
          queryKey: PROJECT_KEYS.list(context.boardId),
        });
      }
      // Remove the specific project from the cache
      queryClient.removeQueries({
        queryKey: PROJECT_KEYS.detail(projectId),
      });
    },
  });
};
