import { router } from 'expo-router';

import { readJson } from '@/lib/api/read-json';
import { authService } from '@/lib/auth/auth-service';

const getHeaders = (optionHeaders: RequestInit['headers'], token: string | null) => {
  const entries: [string, string][] = [['Content-Type', 'application/json']];

  if (optionHeaders) {
    if (optionHeaders instanceof Headers) {
      entries.push(...optionHeaders.entries());
    } else if (Array.isArray(optionHeaders)) {
      entries.push(...optionHeaders);
    } else {
      entries.push(...Object.entries(optionHeaders));
    }
  }

  if (token !== null && token !== '') {
    entries.push(['Authorization', `Bearer ${token}`]);
  }

  return Object.fromEntries(entries);
};

const handleErrorResponse = async (response: Response): Promise<never> => {
  let errorMessage: string;
  try {
    const errorData = await readJson<{ message?: string }>(response);
    const { message } = errorData;
    errorMessage = message === undefined || message === '' ? JSON.stringify(errorData) : message;
  } catch {
    try {
      errorMessage = await response.text();
    } catch {
      errorMessage = `Request failed with status ${response.status}`;
    }
  }
  throw new Error(errorMessage);
};

const handleSuccessResponse = async <T>(response: Response, handleEmptyResponse: boolean): Promise<T> => {
  if (handleEmptyResponse && (response.status === 204 || response.headers.get('content-length') === '0')) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: empty bodies are only requested by callers whose T admits null (delete endpoints)
    return null as T;
  }
  return await readJson<T>(response);
};

export const fetchWithAuth = async <T>(
  url: string,
  options: RequestInit = {},
  handleEmptyResponse = false,
): Promise<T> => {
  const token = await authService.getToken();
  const headers = getHeaders(options.headers, token);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      await authService.logout();
      router.replace('/(auth)/login');
    }
    await handleErrorResponse(response);
  }

  return await handleSuccessResponse<T>(response, handleEmptyResponse);
};
