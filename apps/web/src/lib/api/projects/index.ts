// Core API client
export { projectApi } from '../project-api';

// Types and constants
export type { CreateProjectInput, UpdateProjectInput } from '@/types/project-api';
export { PROJECT_KEYS } from '@/types/project-api';

// Query and mutation hooks
export { useProjects, useProject, useCreateProject, useUpdateProject, useDeleteProject } from './queries';
