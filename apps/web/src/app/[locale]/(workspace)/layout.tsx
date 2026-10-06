import { Suspense } from 'react';

import RootWrapper from '@/components/layout/RootWrapper';
import WorkspaceSpinner from '@/components/layout/WorkspaceSpinner';

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

const WorkspaceLoadingSkeleton = () => {
  return <WorkspaceSpinner />;
};

const AppLayout = async ({ children }: Readonly<AppLayoutProps>) => {
  return (
    <Suspense fallback=<WorkspaceLoadingSkeleton />>
      <RootWrapper>{children}</RootWrapper>
    </Suspense>
  );
};

export default AppLayout;
