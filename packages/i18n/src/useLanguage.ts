import i18n from 'i18next';
import { useCallback, useEffect, useState } from 'react';

import { getPersistedLanguage, persistLanguage } from './localePersistence';

export function useLanguage(): [string, (locale: string) => void] {
  const [language, setLanguage] = useState(() => {
    // Restore persisted language preference before falling back to i18next default
    return getPersistedLanguage() || i18n?.language || 'en';
  });

  useEffect(() => {
    // Sync i18next to persisted language on mount if they differ
    const persisted = getPersistedLanguage();
    if (persisted && persisted !== i18n?.language) {
      i18n?.changeLanguage(persisted);
    }
    i18n.on('languageChanged', setLanguage);
    return () => {
      i18n.off('languageChanged', setLanguage);
    };
  }, []);

  const changeLanguage = useCallback((lang: string) => {
    persistLanguage(lang);
    i18n?.changeLanguage(lang);
  }, []);

  return [language, changeLanguage];
}
