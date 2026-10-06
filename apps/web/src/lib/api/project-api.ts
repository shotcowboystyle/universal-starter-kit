import { API_URL } from '@/constants/routes';
import { fetchWithAuth } from '@/lib/api/fetch-with-auth';
import type { Project } from '@/types/db-interface';
import type { CreateProjectInput, UpdateProjectInput } from '@/types/project-api';

// API Endpoint
const PROJECTS_ENDPOINT = `${API_URL}/projects`;

/**
 * API client for project-related operations
 * This should be used by React Query hooks, not directly in components
 */
export const projectApi = {
  // Get all projects for a board
  async getProjects(boardId: string): Promise<Project[]> {
    return await fetchWithAuth(`${PROJECTS_ENDPOINT}?boardId=${boardId}`);
  },

  // Get a single project by ID
  async getProjectById(id: string): Promise<Project> {
    return await fetchWithAuth(`${PROJECTS_ENDPOINT}/${id}`);
  },

  // Create a new project
  async createProject(input: CreateProjectInput): Promise<Project> {
    return await fetchWithAuth(PROJECTS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Update a project
  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    return await fetchWithAuth(`${PROJECTS_ENDPOINT}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  // Delete a project
  async deleteProject(id: string): Promise<void> {
    await fetchWithAuth(`${PROJECTS_ENDPOINT}/${id}`, {
      method: 'DELETE',
    });
  },
};
