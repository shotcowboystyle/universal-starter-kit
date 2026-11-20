import { z } from 'zod';

import { API_URL } from '@/constants/routes';
import { parseJson } from '@/lib/api/parse-json';
import type { CreateBoardInput, UpdateBoardInput } from '@/types/board-api';
import type { Board } from '@/types/db-interface';

// API Endpoint
const BOARDS_ENDPOINT = `${API_URL}/boards`;

const DEFAULT_ERROR_MESSAGE = 'Request failed';

const errorBodySchema = z.object({ message: z.string().optional() });

const toHeaderEntries = (inputHeaders?: HeadersInit): [string, string][] => {
  if (inputHeaders === undefined) {
    return [];
  }
  if (inputHeaders instanceof Headers) {
    return [...inputHeaders.entries()];
  }
  return Array.isArray(inputHeaders) ? inputHeaders : Object.entries(inputHeaders);
};

const firstNonEmpty = (...values: (string | undefined)[]) =>
  values.find((value) => value !== undefined && value !== '') ?? DEFAULT_ERROR_MESSAGE;

const getErrorMessage = (responseText: string, statusText: string) => {
  try {
    const parsed: unknown = responseText === '' ? {} : JSON.parse(responseText);
    const result = errorBodySchema.safeParse(parsed);
    return firstNonEmpty(result.success ? result.data.message : undefined, statusText);
  } catch (parseError) {
    console.error('Error parsing error response:', parseError);
    return firstNonEmpty(responseText);
  }
};

// Helper function to handle fetch requests
const fetchWithAuth = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  try {
    // Get token from localStorage for Authorization header
    const token = localStorage.getItem('auth_token');

    const headers = new Map<string, string>([['Content-Type', 'application/json']]);
    for (const [key, value] of toHeaderEntries(options.headers)) {
      headers.set(key, value);
    }

    // Add Authorization header if token exists
    if (token !== null && token !== '') {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const baseHeaders = Object.fromEntries(headers);

    const response = await fetch(url, {
      ...options,
      // Still include for cookie fallback
      credentials: 'include',
      headers: baseHeaders,
    });

    const responseText = await response.text();

    if (!response.ok) {
      const errorMessage = getErrorMessage(responseText, response.statusText);

      if (typeof window !== 'undefined' && response.status === 401) {
        console.error('Authentication error - redirecting to login');
        const locale = window.location.pathname.split('/')[1] || 'en';
        window.location.href = `/${locale}/login`;
      }

      throw new Error(errorMessage);
    }

    if (!responseText) {
      throw new Error('Empty response from server');
    }
    return parseJson<T>(responseText);
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
};

/**
 * API client for board-related operations
 * This should be used by React Query hooks, not directly in components
 */
export const boardApi = {
  // Get all boards for the current user
  async getBoards(): Promise<{ myBoards: Board[]; teamBoards: Board[] }> {
    return await fetchWithAuth(BOARDS_ENDPOINT);
  },

  // Get a single board by ID
  async getBoardById(id: string): Promise<Board> {
    return await fetchWithAuth(`${BOARDS_ENDPOINT}/${id}`);
  },

  // Create a new board
  async createBoard(input: CreateBoardInput): Promise<Board> {
    return await fetchWithAuth(BOARDS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Update a board
  async updateBoard(id: string, input: UpdateBoardInput): Promise<Board> {
    return await fetchWithAuth(`${BOARDS_ENDPOINT}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  // Delete a board
  async deleteBoard(id: string): Promise<void> {
    await fetchWithAuth(`${BOARDS_ENDPOINT}/${id}`, {
      method: 'DELETE',
    });
  },

  // Add a member to a board
  async addBoardMember(boardId: string, memberId: string): Promise<Board> {
    return await fetchWithAuth(`${BOARDS_ENDPOINT}/${boardId}/members/${memberId}`, {
      method: 'POST',
    });
  },
};
