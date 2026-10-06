'use client';

import { Button, DropdownMenu } from '@repo/ui';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';

export default function LanguageSwitcher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const params = useParams();
  const locale = params.locale as 'en' | 'de';

  const handleLanguageChange = (nextLocale: 'en' | 'de') => {
    // The pathname from the hook can be inconsistent, sometimes including the
    // locale and sometimes not. To ensure we always have a clean base path,
    // we derive it from the reliable `params.locale`.
    const currentLocale = params.locale as string;
    const basePath = pathname.startsWith(`/${currentLocale}`) ? pathname.substring(currentLocale.length + 1) : pathname;

    startTransition(() => {
      router.replace(basePath || '/', { locale: nextLocale });
    });
  };

  return (
    <DropdownMenu
      placement="bottom-end"
      items={[
        { label: 'English', onSelect: () => handleLanguageChange('en') },
        { label: 'Deutsch', onSelect: () => handleLanguageChange('de') },
      ]}>
      <Button outlined size="$3" disabled={isPending}>
        {locale?.toUpperCase()}
      </Button>
    </DropdownMenu>
  );
}
