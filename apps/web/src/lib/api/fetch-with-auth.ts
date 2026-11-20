const getHeaders = (optionHeaders: RequestInit['headers'], token: string | null) => {
  const entries: [string, string][] = [['Content-Type', 'application/json']];

  if (optionHeaders) {
    if (optionHeaders instanceof Headers || Array.isArray(optionHeaders)) {
      for (const [key, value] of optionHeaders) {
        entries.push([key, value]);
      }
    } else {
      for (const [key, value] of Object.entries(optionHeaders)) {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- caller-supplied header values can be non-strings at runtime
        if (typeof value === 'string') {
          entries.push([key, value]);
        }
      }
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
    // SAFETY: error bodies are expected to be JSON objects; a null/non-object body throws below and falls back to text
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- response.json() is any; shape checked by the optional access below
    const errorData = (await response.json()) as { message?: string };
    errorMessage =
      errorData.message !== undefined && errorData.message !== '' ? errorData.message : JSON.stringify(errorData);
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
    // SAFETY: callers that opt into handleEmptyResponse accept a null result for empty bodies
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- T is caller-chosen and cannot be proven to include null
    return null as unknown as T;
  }
  // oxlint-disable-next-line typescript/no-unsafe-return -- response.json() is untyped; callers pin T to the endpoint's JSON shape
  return await response.json();
};

/**
 * Helper function to handle fetch requests with authentication
 * This is a shared utility used by all API clients
 */
export const fetchWithAuth = async <T>(
  url: string,
  options: RequestInit = {},
  handleEmptyResponse = false,
): Promise<T> => {
  const token = localStorage.getItem('auth_token');
  const headers = getHeaders(options.headers, token);

  const response = await fetch(url, {
    ...options,
    // Still include for cookie fallback
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return await handleSuccessResponse<T>(response, handleEmptyResponse);
};
