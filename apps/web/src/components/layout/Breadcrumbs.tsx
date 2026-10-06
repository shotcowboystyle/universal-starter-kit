'use client';

import { Breadcrumbs as BreadcrumbTrail } from '@repo/ui';

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
import { useRouter } from '@/i18n/navigation';

export function Breadcrumbs() {
  const { items } = useBreadcrumbs();
  const router = useRouter();

  return (
    <BreadcrumbTrail
      items={items.map((item) => ({ label: item.title, href: item.link }))}
      onNavigate={(href) => {
        router.push(href);
      }}
      maxVisible={3}
    />
  );
}
