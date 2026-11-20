'use client';

import NextLink from 'next/link';
import {
  useParams as useNextParams,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
  useSearchParams,
} from 'next/navigation';

import { hrefToString } from '../types';
import type { Href, InputRouteParams, InputRouteParamsBlank, LinkComponent, Router } from '../types';

const noop = (): void => {
  // intentionally empty
};

export const useRouter = (): Router => {
  const router = useNextRouter();
  const pathname = useNextPathname();
  const searchParams = useSearchParams();
  return {
    back: () => {
      router.back();
    },
    canGoBack: () => typeof window !== 'undefined' && window.history.length > 1,
    push: (href: Href) => {
      router.push(hrefToString(href));
    },
    navigate: (href: Href) => {
      router.push(hrefToString(href));
    },
    replace: (href: Href) => {
      router.replace(hrefToString(href));
    },
    dismiss: () => {
      router.back();
    },
    dismissAll: () => {
      router.push('/');
    },
    canDismiss: () => false,
    setParams: <T extends string = ''>(params?: T extends '' ? InputRouteParamsBlank : InputRouteParams<T>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    subscribe: (listener) => {
      listener('success');
      return noop;
    },
    onLoadState: (listener) => {
      listener('loaded');
      return noop;
    },
  };
};

export const usePathname = (): string => useNextPathname();

export const useParams = () => {
  const routeParams = useNextParams() ?? {};
  const searchParams = useSearchParams();
  return { ...routeParams, ...Object.fromEntries(searchParams.entries()) };
};

export const Link: LinkComponent = ({ href, replace, children, ...props }) => (
  <NextLink
    href={hrefToString(href)}
    replace={replace}
    {...props}>
    {children}
  </NextLink>
);

Link.resolveHref = hrefToString;
