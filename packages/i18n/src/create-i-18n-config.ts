import type { BackendModule, InitOptions } from 'i18next';

/**
 * Options for creating i18n initialization configuration.
 * All language/namespace settings must be provided by the consumer,
 * keeping this utility fully generic and framework-level.
 */
export interface I18nConfigOptions {
  /** Supported language codes (e.g. ["en", "te"]) */
  languages: readonly string[];
  /** Translation namespaces (e.g. ["common"]) */
  namespaces: readonly string[];
  /** Default/fallback language code */
  defaultLanguage: string;
  /** Default namespace used when none is specified in t() calls */
  defaultNamespace: string;
  /** Translation resources - can be bundled or loaded dynamically */
  resources?: InitOptions['resources'];
  /** Frappe backend plugin instance (from createFrappeBackend) */
  frappeBackend?: BackendModule | null;
}

/**
 * Creates i18n initialization options with consistent settings.
 * Use this to ensure all platforms have the same i18n behavior.
 *
 * When `VITE_FRAPPE_ENABLED` is true and a `frappeBackend` is provided,
 * i18next is configured with `partialBundledLanguages` so the Frappe
 * backend supplements (and overrides) bundled local resources.
 *
 * @example
 * import { createI18nConfig, createFrappeBackend } from "@repo/i18n";
 *
 * i18n.use(initReactI18next).init(createI18nConfig({
 *   languages, namespaces, defaultLanguage, defaultNamespace, resources,
 *   frappeBackend: createFrappeBackend(),
 * }));
 */
export function createI18nConfig(options: I18nConfigOptions): InitOptions {
  const config: InitOptions = {
    // JSON compatibility for React Native
    compatibilityJSON: 'v4',

    // Namespace configuration
    defaultNS: options.defaultNamespace,
    ns: [...options.namespaces],

    // Language configuration
    supportedLngs: [...options.languages],
    fallbackLng: options.defaultLanguage,

    // Resources (provided by caller)
    resources: options.resources,

    // Interpolation settings
    interpolation: {
      // React handles XSS escaping, so we disable i18next escaping
      escapeValue: false,
    },

    // Missing key handling
    returnNull: false,
    returnEmptyString: false,

    // Debug mode (can be enabled via environment)
    debug: false,
  };

  // When Frappe is enabled, attach the backend plugin so translations
  // are fetched from Frappe and merged over bundled local resources.
  if (process.env.VITE_FRAPPE_ENABLED === 'true' && options.frappeBackend) {
    config.partialBundledLanguages = true;
    config.backend = options.frappeBackend;
  }

  return config;
}
