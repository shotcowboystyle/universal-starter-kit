'use client';

import NextLink from 'next/link';
import {
  useParams as useNextParams,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
  useSearchParams,
} from 'next/navigation';

import type { Href, InputRouteParams, InputRouteParamsBlank, LinkComponent, Router } from '../types';

export const useRouter = (): Router => {
  const router = useNextRouter();
  const pathname = useNextPathname();
  const searchParams = useSearchParams();
  return {
    back: () => router.back(),
    canGoBack: () => typeof window !== 'undefined' && window.history.length > 1,
    push: (href: Href) => router.push(String(href)),
    navigate: (href: Href) => router.push(String(href)),
    replace: (href: Href) => router.replace(String(href)),
    dismiss: () => router.back(),
    dismissAll: () => router.push('/'),
    canDismiss: () => false,
    setParams: <T extends string = ''>(params?: T extends '' ? InputRouteParamsBlank : InputRouteParams<T>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    subscribe: (listener) => {
      listener('success');
      return () => {};
    },
    onLoadState: (listener) => {
      listener('loaded');
      return () => {};
    },
  };
};

export const usePathname = (): string => useNextPathname();

export const useParams = () => {
  const routeParams = useNextParams() ?? {};
  const searchParams = useSearchParams();
  const params: Record<string, string | string[] | undefined> = { ...routeParams };
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
};

export const Link: LinkComponent = ({ href, replace, children, ...props }) => (
  <NextLink href={String(href)} replace={replace} {...props}>
    {children}
  </NextLink>
);

Link.resolveHref = (href: Href) => String(href);
