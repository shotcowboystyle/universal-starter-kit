import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BoardOverview } from '@/components/kanban/BoardOverview';

interface Props {
  params: Promise<{ locale: string }>;
}

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kanban' });

  return {
    title: t('title'),
    description: t('description'),
  };
};

const BoardPage = () => {
  return <BoardOverview />;
};

export default BoardPage;
