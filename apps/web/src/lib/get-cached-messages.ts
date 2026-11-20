import { messages } from '@repo/i18n';
import type { Locale, Messages } from '@repo/i18n';
import { cacheLife } from 'next/cache';

import { APP_NAME } from '@/constants/ui';

const escapedAppName = JSON.stringify(APP_NAME).slice(1, -1);

const interpolateAppName = (localeMessages: Messages): Messages =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: JSON.parse is untyped; the round-trip only substitutes text inside string values, so the tree shape is unchanged
  JSON.parse(JSON.stringify(localeMessages).replaceAll('{appName}', escapedAppName)) as Messages;

export const getCachedMessages = async (locale: Locale) => {
  'use cache';
  cacheLife('days');

  const localeMessages = messages[locale] ?? messages.en;
  return interpolateAppName(localeMessages);
};
