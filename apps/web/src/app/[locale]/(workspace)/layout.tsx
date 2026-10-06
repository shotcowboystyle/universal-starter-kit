import { Suspense } from 'react';

import RootWrapper from '@/components/layout/RootWrapper';
import WorkspaceSpinner from '@/components/layout/WorkspaceSpinner';

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AppLayout({ children }: Readonly<AppLayoutProps>) {
  return (
    <Suspense fallback=<WorkspaceLoadingSkeleton />>
      <RootWrapper>{children}</RootWrapper>
    </Suspense>
  );
}

function WorkspaceLoadingSkeleton() {
  return <WorkspaceSpinner />;
}
