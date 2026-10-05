'use client';

import { Button, DropdownMenu } from '@repo/ui';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { useHydrated } from '@/hooks/useHydrated';

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const hydrated = useHydrated();
  const t = useTranslations('theme');

  return (
    <DropdownMenu
      placement="bottom-end"
      items={[
        { label: t('light'), onSelect: () => setTheme('light') },
        { label: t('dark'), onSelect: () => setTheme('dark') },
        { label: t('system'), onSelect: () => setTheme('system') },
      ]}>
      <Button
        outlined
        size="$3"
        icon={hydrated && resolvedTheme === 'dark' ? MoonIcon : SunIcon}
        aria-label={t('toggleTheme')}
      />
    </DropdownMenu>
  );
}
