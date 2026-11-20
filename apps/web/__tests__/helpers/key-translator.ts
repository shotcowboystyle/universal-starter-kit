import type { useTranslations } from 'next-intl';

// next-intl test double: `t(key)` resolves through `translate`
export const createUseTranslations = (translate: (key: string) => string): typeof useTranslations => {
  const translator = Object.assign((key: string) => translate(key), {
    rich: (key: string) => translate(key),
    markup: (key: string) => translate(key),
    raw: (key: string) => translate(key),
    has: () => true,
  });
  // SAFETY: the double matches the call signature components use; Translator's generic message-key typing cannot be reproduced here.
  return (() => translator) as unknown as typeof useTranslations;
};

// Every translation resolves to its key
export const mockUseTranslations = createUseTranslations((key) => key);
