/**
 * Backoffice i18n — the package ships its own translations under the
 * "backoffice" namespace (English bundled; more languages can join the
 * BUNDLED_RESOURCES map) and registers them into the ambient i18next
 * instance, following @repo/i18n conventions:
 *
 *   - registration is additive: `addResourceBundle(lng, ns, …, deep=true,
 *     overwrite=false)`, so anything the HOST already registered for the
 *     namespace wins, and a Frappe i18n backend (partialBundledLanguages)
 *     can still supplement over the bundle.
 *   - every t() call in the package also carries an inline English default,
 *     so a missing bundle degrades to English instead of raw keys.
 *
 * When no i18next instance was initialized at all (a host app that does not
 * use i18n), the provider initializes a minimal English-only instance so
 * react-i18next binds a working `t`.
 */
import i18next from 'i18next';
import type { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';

export const BACKOFFICE_I18N_NAMESPACE = 'backoffice';

const BUNDLED_RESOURCES = { en };

const registeredInstances = new WeakSet<I18nInstance>();

const loadBackofficeNamespace = async (instance: I18nInstance): Promise<void> => {
  try {
    await instance.loadNamespaces(BACKOFFICE_I18N_NAMESPACE);
  } catch {
    // Safe to continue: a readiness hint only — the bundled resources are already registered.
  }
};

const addBundles = (instance: I18nInstance): void => {
  for (const [lng, resources] of Object.entries(BUNDLED_RESOURCES)) {
    // deep merge, never overwrite — host-registered keys take precedence.
    instance.addResourceBundle(lng, BACKOFFICE_I18N_NAMESPACE, resources, true, false);
  }
  // Satisfy backends that lazy-load namespaces (react-i18next readiness).
  void loadBackofficeNamespace(instance);
};

/**
 * Idempotently register the bundled backoffice translations on `instance`
 * (the global i18next singleton by default). Safe to call before the host
 * initializes i18next — registration is deferred to the `initialized` event.
 * Called automatically by BackofficeProvider.
 */
export const registerBackofficeTranslations = (instance: I18nInstance = i18next): void => {
  if (registeredInstances.has(instance)) {
    return;
  }
  registeredInstances.add(instance);

  if (instance.isInitialized) {
    addBundles(instance);
    return;
  }

  instance.on('initialized', () => {
    addBundles(instance);
  });

  // No host i18n at all: bring up a minimal instance so t() works. Guarded
  // against a host init that is merely in flight.
  const initializing = instance.isInitializing;
  if (!initializing && !instance.isInitialized) {
    void instance.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: BACKOFFICE_I18N_NAMESPACE,
      ns: [BACKOFFICE_I18N_NAMESPACE],
      resources: {},
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
    });
  }
};
