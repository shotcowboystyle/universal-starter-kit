import { useMemo } from 'react';

import { useLanguage } from './use-language';

type DateInput = Date | number | string;

function getRelativeTime(language: string, date: DateInput): string {
  const diffMs = new Date(date).getTime() - Date.now();
  const abs = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (abs < 60) {
    return rtf.format(Math.round(diffMs / 1000), 'second');
  }
  if (abs < 3600) {
    return rtf.format(Math.round(diffMs / 60_000), 'minute');
  }
  if (abs < 86_400) {
    return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  }
  if (abs < 2_592_000) {
    return rtf.format(Math.round(diffMs / 86_400_000), 'day');
  }
  if (abs < 31_536_000) {
    return rtf.format(Math.round(diffMs / 2_592_000_000), 'month');
  }
  return rtf.format(Math.round(diffMs / 31_536_000_000), 'year');
}

export function createDateFormatter(language: string) {
  return {
    format: (date: DateInput, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(new Date(date)),
    relative: (date: DateInput) => getRelativeTime(language, date),
  };
}

export function createNumberFormatter(language: string) {
  return {
    format: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(language, options).format(value),
  };
}

export function createCurrencyFormatter(language: string) {
  return {
    format: (value: number, currency: string, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>) =>
      new Intl.NumberFormat(language, { ...options, style: 'currency', currency }).format(value),
  };
}

export function useFormatDate() {
  const [language] = useLanguage();
  return useMemo(() => createDateFormatter(language), [language]);
}

export function useFormatNumber() {
  const [language] = useLanguage();
  return useMemo(() => createNumberFormatter(language), [language]);
}

export function useFormatCurrency() {
  const [language] = useLanguage();
  return useMemo(() => createCurrencyFormatter(language), [language]);
}
