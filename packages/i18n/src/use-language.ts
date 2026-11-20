import i18n, { changeLanguage as changeI18nLanguage } from 'i18next';
import { useCallback, useEffect, useState } from 'react';

import { getPersistedLanguage, persistLanguage } from './locale-persistence';

const initialLanguage = (): string => {
  // Restore persisted language preference before falling back to i18next default
  const persisted = getPersistedLanguage();
  if (persisted !== null && persisted !== '') {
    return persisted;
  }
  const current = i18n?.language;
  return current !== undefined && current !== '' ? current : 'en';
};

export const useLanguage = (): [string, (locale: string) => void] => {
  const [language, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    // Sync i18next to persisted language on mount if they differ
    const persisted = getPersistedLanguage();
    if (persisted !== null && persisted !== '' && persisted !== i18n?.language) {
      void changeI18nLanguage(persisted);
    }
    i18n.on('languageChanged', setLanguage);
    return () => {
      i18n.off('languageChanged', setLanguage);
    };
  }, []);

  const changeLanguage = useCallback((lang: string) => {
    persistLanguage(lang);
    void changeI18nLanguage(lang);
  }, []);

  return [language, changeLanguage];
};
