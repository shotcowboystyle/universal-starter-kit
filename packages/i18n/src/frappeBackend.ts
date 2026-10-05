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

async function fetchTranslations(language: string, options: FrappeBackendOptions): Promise<Record<string, string>> {
  const base = options.baseUrl ?? '';
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = `${base}/api/method/frappe.translate.get_dict?language=${encodeURIComponent(language)}`;
  const res = await fetchFn(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Frappe translation fetch failed: ${res.status}`);
  }
  const data: FrappeTranslationResponse = await res.json();
  return data.message ?? {};
}

/**
 * i18next backend plugin that fetches translations from Frappe's API.
 * Guarded by VITE_FRAPPE_ENABLED so it tree-shakes out of non-Frappe builds.
 */
function createFrappeBackend(): BackendModule<FrappeBackendOptions> | null {
  if (process.env.VITE_FRAPPE_ENABLED !== 'true') {
    return null;
  }

  let opts: FrappeBackendOptions = {};

  return {
    type: 'backend',
    init(_services: Services, backendOptions: FrappeBackendOptions, _i18nextOptions: InitOptions) {
      opts = backendOptions ?? {};
    },
    read(language: string, _namespace: string, callback: ReadCallback) {
      fetchTranslations(language, opts)
        .then((translations) => {
          callback(null, translations);
        })
        .catch((err) => {
          callback(err, null);
        });
    },
  };
}

export { createFrappeBackend };
