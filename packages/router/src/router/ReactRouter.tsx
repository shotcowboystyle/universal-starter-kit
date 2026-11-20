import {
  Link as ReactRouterLink,
  useLocation,
  useNavigate,
  useParams as useReactParams,
  useSearchParams as useReactSearchParams,
} from 'react-router-dom';

import { hrefToString } from '../types';
import type { Href, InputRouteParams, InputRouteParamsBlank, LinkComponent, Router } from '../types';

const noop = (): void => {
  // intentionally empty
};

export const useRouter = (): Router => {
  const location = useLocation();
  const navigate = useNavigate();
  return {
    back: () => {
      void navigate(-1);
    },
    canGoBack: () => true,
    push: (href: Href) => {
      void navigate(href, { replace: false });
    },
    navigate: (href: Href) => {
      void navigate(href, { replace: false });
    },
    replace: (href: Href) => {
      void navigate(href, { replace: true });
    },
    dismiss: (count?: number) => {
      void navigate(-1 * (count === undefined || count === 0 ? 1 : count));
    },
    dismissAll: () => {
      void navigate('/');
    },
    canDismiss: () => true,
    setParams: <T extends string = ''>(params?: T extends '' ? InputRouteParamsBlank : InputRouteParams<T>) => {
      const searchParams = new URLSearchParams(location.search);
      if (params != null) {
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) {
            searchParams.delete(key);
          } else {
            searchParams.set(key, value);
          }
        }
      }
      void navigate({ search: searchParams.toString() });
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

export const usePathname = (): string => useLocation().pathname;

// Combine route params and search params for React Router
export const useParams = () => {
  const routeParams = useReactParams();
  const [searchParams] = useReactSearchParams();
  const params: Record<string, string | string[] | undefined> = {};

  // Add route params
  for (const [key, value] of Object.entries(routeParams)) {
    if (value !== undefined) {
      params[key] = value;
    }
  }

  // Add search params
  for (const [key, value] of searchParams) {
    const existing = params[key];
    if (existing !== undefined && existing !== '') {
      // If key already exists from route params, make it an array
      params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      params[key] = value;
    }
  }

  return params;
};

export const Link: LinkComponent = ({ href, replace, children, ...props }) => (
  <ReactRouterLink
    to={href}
    replace={replace}
    {...props}>
    {children}
  </ReactRouterLink>
);

Link.resolveHref = hrefToString;
