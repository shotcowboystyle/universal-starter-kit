import { Analytics } from '@vercel/analytics/react';
import { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Roboto } from 'next/font/google';
import { notFound } from 'next/navigation';
import NextTopLoader from 'nextjs-toploader';
import { Suspense } from 'react';

import { routing } from '@/i18n/routing';
import { getCachedMessages } from '@/lib/get-cached-messages';
import { SchemeProviders } from '@/providers/SchemeProviders';

const roboto = Roboto({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
});

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: Readonly<Props>) {
  const { locale } = await params;
  // Enable static rendering
  setRequestLocale(locale);

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getCachedMessages(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={roboto.className} suppressHydrationWarning>
        <NextTopLoader color="#2563eb" showSpinner={false} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Tamagui's styled contexts call Math.random() while rendering and the
              scheme cookie is request data; cacheComponents allows both only
              below a Suspense boundary. */}
          <Suspense>
            <SchemeProviders>
              {children}
              <Analytics />
            </SchemeProviders>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
