'use client';

import { Toaster } from 'sonner';

import { TOAST_DURATION } from '@/constants/ui';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: Readonly<AuthLayoutProps>) => (
  <>
    {children}
    <Toaster
      position="bottom-right"
      expand={false}
      toastOptions={{
        duration: TOAST_DURATION,
      }}
      visibleToasts={1}
      closeButton
    />
  </>
);

export default AuthLayout;
