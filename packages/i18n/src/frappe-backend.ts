import type { BackendModule, ReadCallback, Services, InitOptions } from 'i18next';

export interface FrappeBackendOptions {
  /** Base URL for Frappe API (default: '') */
  baseUrl?: string;
  /** Custom fetch function (for SSR or testing) */
  fetch?: typeof globalThis.fetch;
}

// Frappe translation dict response shape: { message: { "Source": "Translated", ... } }
interface FrappeTranslationResponse {
  message: Record<string, string>;
}

const fetchTranslations = async (language: string, options: FrappeBackendOptions): Promise<Record<string, string>> => {
  const base = options.baseUrl ?? '';
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${base}/api/method/frappe.translate.get_dict?language=${encodeURIComponent(language)}`;
  const res = await fetchFn(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Frappe translation fetch failed: ${res.status}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- SAFETY: Frappe's get_dict endpoint responds with { message: Record<string, string> }
  const data: FrappeTranslationResponse = await res.json();
  return data.message ?? {};
};

/**
 * i18next backend plugin that fetches translations from Frappe's API.
 * Guarded by VITE_FRAPPE_ENABLED so it tree-shakes out of non-Frappe builds.
 */
const createFrappeBackend = (): BackendModule<FrappeBackendOptions> | null => {
  if (process.env.VITE_FRAPPE_ENABLED !== 'true') {
    return null;
  }

  let opts: FrappeBackendOptions = {};

  return {
    type: 'backend',
    init(_services: Services, backendOptions: FrappeBackendOptions, _i18nextOptions: InitOptions) {
      opts = backendOptions ?? {};
    },
    read(language: string, _namespace: string, onRead: ReadCallback) {
      // Not returned: i18next would treat a returned promise as a second result channel
      const load = async (): Promise<void> => {
        try {
          onRead(null, await fetchTranslations(language, opts));
        } catch (error) {
          onRead(error instanceof Error ? error : String(error), null);
        }
      };
      void load();
    },
  };
};

export { createFrappeBackend };
